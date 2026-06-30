import express from "express";
import dotenv from "dotenv";
import { verifyClerkToken } from "./middleware/clerkAuth.js";
import { db } from "./db.js";
import { users, cards } from "./drizzle/schema.js";
import { eq } from "drizzle-orm";
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
app.use(express.json());
// Public routes
app.get("/", (req, res) => {
    res.json({ message: "Cortinho API" });
});
// Protected routes - require Clerk token
app.use("/api/protected", verifyClerkToken);
app.get("/api/protected/user", (req, res) => {
    res.json({ userId: req.userId, message: "This is a protected endpoint" });
});
// Get user profile (Clerk ID sync)
app.get("/api/protected/profile", async (req, res) => {
    try {
        const userId = req.userId;
        const user = await db.query.users.findFirst({
            where: eq(users.clerkId, userId),
        });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json(user);
    }
    catch (error) {
        console.error("Profile fetch error:", error);
        res.status(500).json({ error: "Failed to fetch profile" });
    }
});
// Get user's cards
app.get("/api/protected/cards", async (req, res) => {
    try {
        const userId = req.userId;
        const userCards = await db.query.cards.findMany({
            where: eq(cards.clerkId, userId),
        });
        res.json({ cards: userCards, count: userCards.length });
    }
    catch (error) {
        console.error("Cards fetch error:", error);
        res.status(500).json({ error: "Failed to fetch cards" });
    }
});
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
