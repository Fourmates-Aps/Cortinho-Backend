import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import crypto from "crypto";
let cachedJwks = null;
let cachedJwksTime = 0;
const JWKS_CACHE_TTL = 3600000; // 1 hour
async function getClerkJwks() {
    const now = Date.now();
    if (cachedJwks && now - cachedJwksTime < JWKS_CACHE_TTL) {
        return cachedJwks;
    }
    const clerkInstance = process.env.CLERK_INSTANCE;
    if (!clerkInstance) {
        throw new Error("CLERK_INSTANCE environment variable is not set");
    }
    const jwksUrl = `https://${clerkInstance}/.well-known/jwks.json`;
    const response = await fetch(jwksUrl);
    cachedJwks = await response.json();
    cachedJwksTime = now;
    return cachedJwks;
}
function jwkToPem(jwk) {
    const publicKeyObject = crypto.createPublicKey({
        key: jwk,
        format: "jwk",
    });
    return publicKeyObject.export({ format: "pem", type: "spki" }).toString();
}
export async function verifyClerkToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid authorization header" });
    }
    const token = authHeader.slice(7);
    try {
        const jwks = await getClerkJwks();
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded) {
            return res.status(401).json({ error: "Invalid token format" });
        }
        const header = decoded.header;
        const jwk = jwks.keys.find((key) => key.kid === header.kid);
        if (!jwk) {
            return res.status(401).json({ error: "Unable to find matching key" });
        }
        const publicKey = jwkToPem(jwk);
        const clerkInstance = process.env.CLERK_INSTANCE;
        const verified = jwt.verify(token, publicKey, {
            algorithms: ["RS256"],
            issuer: `https://${clerkInstance}`,
        });
        req.userId = verified.sub;
        req.clerkToken = token;
        next();
    }
    catch (error) {
        console.error("Token validation error:", error);
        return res.status(401).json({ error: "Invalid token" });
    }
}
