import express from "express";
import dotenv from "dotenv";
import { verifyClerkToken } from "./middleware/clerkAuth";
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
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
