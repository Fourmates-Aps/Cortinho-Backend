// Clerk webhook handler
// Clerk sends user lifecycle events here — we sync to our users table.
// Verification uses svix (Clerk's webhook delivery layer).
//
// Register this URL in Clerk dashboard → Webhooks:
//   https://your-api-domain.com/webhooks/clerk
// Events to subscribe: user.created, user.updated, user.deleted

import { Request, Response } from "express";
import { Webhook } from "svix";
import { db } from "../../db.js";
import { users } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../logger/index.js";
import { cache } from "../cache/index.js";

interface ClerkUserEvent {
  type: "user.created" | "user.updated" | "user.deleted";
  data: {
    id:             string;
    email_addresses: { email_address: string; id: string }[];
    first_name:     string | null;
    last_name:      string | null;
    primary_email_address_id: string;
  };
}

export async function clerkWebhookHandler(req: Request, res: Response) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("CLERK_WEBHOOK_SECRET not set");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  const svixId        = req.headers["svix-id"]        as string;
  const svixTimestamp = req.headers["svix-timestamp"]  as string;
  const svixSignature = req.headers["svix-signature"]  as string;

  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).json({ error: "Missing svix headers" });
  }

  let event: ClerkUserEvent;
  try {
    const wh = new Webhook(secret);
    // req.body is the raw Buffer here (mounted before json parser)
    event = wh.verify(req.body, {
      "svix-id":        svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkUserEvent;
  } catch (err) {
    logger.warn({ err }, "Clerk webhook signature verification failed");
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  const { type, data } = event;
  logger.info({ type, clerkId: data.id }, "Clerk webhook received");

  try {
    switch (type) {
      case "user.created":
      case "user.updated": {
        const primaryEmail = data.email_addresses.find(
          (e) => e.id === data.primary_email_address_id
        )?.email_address ?? data.email_addresses[0]?.email_address ?? "";

        await db
          .insert(users)
          .values({
            clerkId:   data.id,
            email:     primaryEmail,
            firstName: data.first_name ?? undefined,
            lastName:  data.last_name  ?? undefined,
          })
          .onConflictDoUpdate({
            target:    users.clerkId,
            set: {
              email:     primaryEmail,
              firstName: data.first_name ?? undefined,
              lastName:  data.last_name  ?? undefined,
              updatedAt: new Date(),
            },
          });

        // Bust cached profile so next request re-fetches from DB
        const user = await db.query.users.findFirst({
          where:   eq(users.clerkId, data.id),
          columns: { id: true },
        });
        if (user) {
          await cache.del(`user:${user.id}:profile`);
          await cache.del(`clerk:${data.id}:dbUserId`);
        }
        break;
      }

      case "user.deleted": {
        // Soft-approach: mark deleted_at or fully delete.
        // We hard-delete because CASCADE removes cards/transactions too.
        await db.delete(users).where(eq(users.clerkId, data.id));
        await cache.del(`clerk:${data.id}:dbUserId`);
        break;
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    logger.error({ err, type, clerkId: data.id }, "Webhook processing error");
    res.status(500).json({ error: "Processing failed" });
  }
}
