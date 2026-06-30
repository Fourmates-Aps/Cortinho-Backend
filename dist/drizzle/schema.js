import { pgTable, serial, text, varchar, integer, decimal, timestamp, boolean, index, } from "drizzle-orm/pg-core";
// Users table - synced with Clerk
export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    clerkId: varchar("clerk_id", { length: 256 }).unique().notNull(),
    email: varchar("email", { length: 256 }).notNull(),
    firstName: varchar("first_name", { length: 256 }),
    lastName: varchar("last_name", { length: 256 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
    clerkIdIdx: index("clerk_id_idx").on(table.clerkId),
}));
// Cards table
export const cards = pgTable("cards", {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    clerkId: varchar("clerk_id", { length: 256 }).notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    set: varchar("set", { length: 256 }),
    cardNumber: varchar("card_number", { length: 64 }),
    sport: varchar("sport", { length: 64 }), // Pokémon, Soccer, Basketball, Football
    grade: varchar("grade", { length: 64 }), // PSA, BGS, CGC, SGC
    gradeScore: decimal("grade_score", { precision: 3, scale: 1 }),
    purchasePrice: decimal("purchase_price", { precision: 10, scale: 2 }),
    currentPrice: decimal("current_price", { precision: 10, scale: 2 }),
    priceSource: varchar("price_source", { length: 256 }), // Pricecharting, etc
    isRookie: boolean("is_rookie").default(false),
    isAutographed: boolean("is_autographed").default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
    userIdIdx: index("user_id_idx").on(table.userId),
    clerkIdIdx: index("cards_clerk_id_idx").on(table.clerkId),
}));
// Collection stats (denormalized for performance)
export const collectionStats = pgTable("collection_stats", {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    clerkId: varchar("clerk_id", { length: 256 }).notNull(),
    totalCards: integer("total_cards").default(0),
    totalValue: decimal("total_value", { precision: 12, scale: 2 }).default("0"),
    gradedCards: integer("graded_cards").default(0),
    pokemonCards: integer("pokemon_cards").default(0),
    sportsCards: integer("sports_cards").default(0),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
    userIdIdx: index("stats_user_id_idx").on(table.userId),
    clerkIdIdx: index("stats_clerk_id_idx").on(table.clerkId),
}));
