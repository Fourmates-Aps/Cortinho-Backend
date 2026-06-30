# Database Setup - Supabase PostgreSQL

## 1. Create Supabase Project

1. Go to https://supabase.com
2. Sign up or log in
3. Create a new project
4. Choose region (e.g., ap-northeast-1 for Asia)
5. Set a strong database password

## 2. Get Connection String

From Supabase dashboard:
1. Go to Settings → Database
2. Find "Connection pooling" section
3. Copy the connection string (transaction-mode pooler)
4. It will look like:
```
postgresql://postgres.YOUR_PROJECT_ID:YOUR_PASSWORD@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres
```

## 3. Configure Backend

Update `.env` with your connection string:
```
DATABASE_URL="postgresql://postgres.YOUR_PROJECT_ID:YOUR_PASSWORD@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres"
```

## 4. Create Tables

Run migrations to set up the database:

```bash
# Generate migration files from schema
npm run db:generate

# Push schema to database
npm run db:push
```

This creates:
- `users` - Synced with Clerk auth
- `cards` - Trading cards in collection
- `collection_stats` - Portfolio stats (denormalized)

## 5. Verify Connection

Start the backend:
```bash
npm run dev
```

Test the connection:
```bash
curl http://localhost:3001/api/protected/profile \
  -H "Authorization: Bearer YOUR_CLERK_JWT_TOKEN"
```

Should return your user profile if database is connected.

## Schema

### Users Table
- `id` - Primary key
- `clerkId` - Links to Clerk authentication
- `email` - User email
- `firstName`, `lastName` - User name
- `createdAt`, `updatedAt` - Timestamps

### Cards Table
- `id` - Primary key
- `userId` - Foreign key to users
- `clerkId` - Links to Clerk user
- `name` - Card name (e.g., "Charizard")
- `set` - Card set (e.g., "Base Set")
- `cardNumber` - Card number in set (e.g., "4/102")
- `sport` - Pokémon, Soccer, Basketball, Football
- `grade` - PSA, BGS, CGC, SGC
- `gradeScore` - Grade score (e.g., 10, 9.5)
- `purchasePrice` - What you paid
- `currentPrice` - Current market value
- `priceSource` - Where price comes from (Pricecharting)
- `isRookie`, `isAutographed` - Tag cards
- `notes` - Additional notes
- `createdAt`, `updatedAt` - Timestamps

### Collection Stats Table
- `userId` - Foreign key to users
- `clerkId` - Links to Clerk user
- `totalCards` - Total cards in collection
- `totalValue` - Sum of all card values
- `gradedCards` - Count of graded cards
- `pokemonCards` - Count of Pokémon cards
- `sportsCards` - Count of sports cards

## Drizzle Kit Commands

```bash
# Generate SQL migration files
npm run db:generate

# Push schema to database (recommended for development)
npm run db:push

# Run migrations (if using migration files)
npm run db:migrate

# Open Drizzle Studio (web UI)
npm run db:studio
```

## Backend Routes

### Protected Routes (require Clerk JWT token)

```
GET /api/protected/profile
- Get user profile synced from Clerk

GET /api/protected/cards
- Get all cards in user's collection

POST /api/protected/cards
- Add a new card (not yet implemented)

PUT /api/protected/cards/:id
- Update card (not yet implemented)

DELETE /api/protected/cards/:id
- Delete card (not yet implemented)
```

## Troubleshooting

**"Cannot connect to database"**
- Verify DATABASE_URL is correct
- Check Supabase project is active
- Ensure IP is not blocked (Supabase Network settings)

**"Table does not exist"**
- Run `npm run db:push` to create tables
- Check migrations ran successfully

**"Permission denied"**
- Verify the postgres user password is correct
- Check connection string has correct format

## Next Steps

1. ✅ Create Supabase project
2. ✅ Add DATABASE_URL to .env
3. ✅ Run `npm run db:push` to create tables
4. Start backend with `npm run dev`
5. Integrate card scanning endpoint
6. Add card management endpoints (create, update, delete)
7. Add collection stats calculation
