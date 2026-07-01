-- ============================================================
-- CORTINHO — ENTERPRISE DATABASE SCHEMA
-- PostgreSQL 15+   |   BCNF Normalized
-- ============================================================
--
-- BCNF REMINDER: Every non-trivial functional dependency X → Y
-- must have X as a superkey.  Violations corrected below are noted.
--
-- Key design decisions:
--   1. clerk_id is REMOVED from cards/transactions (was transitively
--      dependent: cards.user_id → users.clerk_id).  Always JOIN users.
--   2. grading_companies & platforms extracted to lookup tables because
--      their attributes (abbr, name) form non-trivial FDs inside cards
--      if left as plain varchars with duplicated data.
--   3. collectionStats denorm TABLE dropped → replaced by VIEW.
--   4. Soft-delete (deleted_at) on cards & sealed_products so that
--      transaction history retains card references after logical deletion.
--   5. Full-text GIN index on cards for single-query search across
--      name / player / set_name / team / card_number.
-- ============================================================

-- ── EXTENSIONS ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid() if needed later

-- ─────────────────────────────────────────────────────────────
-- SECTION 1: LOOKUP / REFERENCE TABLES
-- ─────────────────────────────────────────────────────────────

-- 1a. grading_companies
-- Reason to normalize: company name/abbr are multi-valued facts about the company,
-- not about the card.  If stored in cards as varchar, name→abbr is a non-trivial FD
-- with a non-superkey determinant → BCNF violation.
CREATE TABLE grading_companies (
  id   SMALLSERIAL PRIMARY KEY,
  name VARCHAR(64)  NOT NULL UNIQUE,
  abbr VARCHAR(8)   NOT NULL UNIQUE
);

INSERT INTO grading_companies (name, abbr) VALUES
  ('Professional Sports Authenticator', 'PSA'),
  ('Beckett Grading Services',          'BGS'),
  ('Certified Guaranty Company',        'CGC'),
  ('Sportscard Guaranty Corporation',   'SGC'),
  ('Other',                             'OTH');

-- 1b. platforms
-- Referenced by both transactions and cards (price_source context).
-- Normalised because platform.name → platform display_url is a non-trivial FD.
CREATE TABLE platforms (
  id          SMALLSERIAL PRIMARY KEY,
  name        VARCHAR(64) NOT NULL UNIQUE,
  display_url VARCHAR(256)
);

INSERT INTO platforms (name, display_url) VALUES
  ('eBay',          'https://www.ebay.com'),
  ('TCGPlayer',     'https://www.tcgplayer.com'),
  ('PriceCharting', 'https://www.pricecharting.com'),
  ('Local',         NULL),
  ('Other',         NULL);

-- ─────────────────────────────────────────────────────────────
-- SECTION 2: CORE ENTITY TABLES
-- ─────────────────────────────────────────────────────────────

-- 2a. users
-- Candidate keys: {id}, {clerk_id}, {email}
-- All non-key attrs (first_name, last_name, role, currency) → PK only ✓
CREATE TABLE users (
  id         SERIAL       PRIMARY KEY,
  clerk_id   VARCHAR(256) NOT NULL UNIQUE,
  email      VARCHAR(256) NOT NULL UNIQUE,
  first_name VARCHAR(128),
  last_name  VARCHAR(128),
  role       VARCHAR(16)  NOT NULL DEFAULT 'user'
               CHECK (role IN ('user', 'admin')),
  currency   CHAR(3)      NOT NULL DEFAULT 'USD'
               CHECK (currency IN ('USD', 'EUR', 'GBP', 'DKK')),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2b. cards
-- PK: {id}
-- Potential alt CK: {user_id, set_name, card_number} — NOT enforced as unique
--   because the system intentionally allows duplicate ownership (two copies of same card).
-- cert_number is externally assigned by grading authorities; cert_number → grade_company_id
--   is an external-world FD, not one we enforce in our schema.  No BCNF violation.
-- All non-key attributes depend solely on {id} ✓
CREATE TABLE cards (
  id                 SERIAL        PRIMARY KEY,
  user_id            INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- ── Card Identity ──────────────────────────────────────────
  name               VARCHAR(256)  NOT NULL,
  category           VARCHAR(16)   NOT NULL DEFAULT 'other'
                       CHECK (category IN ('pokemon','soccer','basketball','football','other')),
  player             VARCHAR(256),
  team               VARCHAR(256),
  year               SMALLINT,
  set_name           VARCHAR(256),
  card_number        VARCHAR(64),
  parallel           VARCHAR(128),
  serial_number      VARCHAR(64),          -- e.g. 047/100 for numbered cards

  -- ── Attributes ─────────────────────────────────────────────
  is_rookie          BOOLEAN       NOT NULL DEFAULT FALSE,
  is_autographed     BOOLEAN       NOT NULL DEFAULT FALSE,
  is_patch           BOOLEAN       NOT NULL DEFAULT FALSE,
  is_graded          BOOLEAN       NOT NULL DEFAULT FALSE,
  grade_company_id   SMALLINT      REFERENCES grading_companies(id),
  grade_value        NUMERIC(4,1),                  -- e.g. 10.0, 9.5
  cert_number        VARCHAR(64),
  condition          VARCHAR(16)
                       CHECK (condition IN (
                         'poor','fair','good','very_good',
                         'excellent','near_mint','mint','gem_mint'
                       )),

  -- ── Acquisition / Valuation ────────────────────────────────
  purchase_price     NUMERIC(12,2),
  current_value      NUMERIC(12,2),
  purchase_date      DATE,
  acquisition_method VARCHAR(16)
                       CHECK (acquisition_method IN ('bought','pulled','trade','gift','other')),
  price_source       VARCHAR(256),                  -- e.g. PriceCharting URL

  -- ── Media ──────────────────────────────────────────────────
  image_url          TEXT,
  image_back_url     TEXT,

  -- ── Status / Meta ──────────────────────────────────────────
  notes              TEXT,
  status             VARCHAR(16)   NOT NULL DEFAULT 'collection'
                       CHECK (status IN (
                         'collection','wishlist','for_sale','sold','traded','draft'
                       )),
  deleted_at         TIMESTAMPTZ,          -- soft-delete; NULL = active
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- ── Constraints ────────────────────────────────────────────
  CONSTRAINT chk_graded_fields CHECK (
    is_graded = FALSE OR (grade_company_id IS NOT NULL AND grade_value IS NOT NULL)
  )
);

-- 2c. price_history
-- PK: {id}; natural CK: {card_id, recorded_at} (one snapshot per card per moment)
-- All non-key attrs (value, source, note) depend solely on {id} ✓
CREATE TABLE price_history (
  id          SERIAL      PRIMARY KEY,
  card_id     INTEGER     NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  value       NUMERIC(12,2) NOT NULL,
  source      VARCHAR(16) NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','pricecharting','ebay_lookup','import','ai_scan')),
  note        VARCHAR(256),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (card_id, recorded_at)
);

-- 2d. transactions
-- PK: {id}
-- card_id is nullable: card may be soft-deleted after the transaction is logged.
-- platform_id references lookup; platform_custom allows free-text when platform
--   is not in our list — these are mutually exclusive (enforced by check constraint).
-- BCNF: all attributes depend only on {id} ✓
CREATE TABLE transactions (
  id               SERIAL       PRIMARY KEY,
  user_id          INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id          INTEGER      REFERENCES cards(id) ON DELETE SET NULL,
  type             VARCHAR(8)   NOT NULL
                     CHECK (type IN ('buy','sell','trade','pull','gift')),
  price            NUMERIC(12,2) NOT NULL DEFAULT 0,
  counterparty     VARCHAR(256),
  platform_id      SMALLINT     REFERENCES platforms(id),
  platform_custom  VARCHAR(128),
  traded_for       VARCHAR(256),  -- description when type = 'trade'
  note             TEXT,
  transaction_date DATE         NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_platform_xor CHECK (
    NOT (platform_id IS NOT NULL AND platform_custom IS NOT NULL)
  )
);

-- 2e. sealed_products
-- Parallel domain to cards for booster boxes, ETBs, etc.
-- BCNF: all non-key attrs depend only on {id} ✓
CREATE TABLE sealed_products (
  id             SERIAL       PRIMARY KEY,
  user_id        INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           VARCHAR(256) NOT NULL,
  category       VARCHAR(16)  NOT NULL DEFAULT 'other'
                   CHECK (category IN ('pokemon','soccer','basketball','football','other')),
  set_name       VARCHAR(256),
  product_type   VARCHAR(128),           -- e.g. "Booster Box", "ETB"
  language       VARCHAR(64),
  year           SMALLINT,
  quantity       SMALLINT     NOT NULL DEFAULT 1,
  purchase_price NUMERIC(12,2),
  current_value  NUMERIC(12,2),
  purchase_date  DATE,
  image_url      TEXT,
  notes          TEXT,
  status         VARCHAR(16)  NOT NULL DEFAULT 'collection'
                   CHECK (status IN ('collection','for_sale','sold')),
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2f. sealed_price_history
CREATE TABLE sealed_price_history (
  id                SERIAL        PRIMARY KEY,
  sealed_product_id INTEGER       NOT NULL REFERENCES sealed_products(id) ON DELETE CASCADE,
  value             NUMERIC(12,2) NOT NULL,
  source            VARCHAR(16)   NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual','pricecharting','import')),
  note              VARCHAR(256),
  recorded_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (sealed_product_id, recorded_at)
);

-- 2g. psa_cert_cache
-- PK: {cert_number} (naturally unique — PSA assigns one cert per slab)
-- result_json → all fields: determinant is the PK ✓
-- Requires periodic cleanup (no TTL enforced in schema; handle via cron).
CREATE TABLE psa_cert_cache (
  cert_number VARCHAR(64)  PRIMARY KEY,
  result_json JSONB        NOT NULL,
  fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- SECTION 3: INDEXES
-- ─────────────────────────────────────────────────────────────

-- users
CREATE UNIQUE INDEX uq_users_clerk_id ON users(clerk_id);
CREATE UNIQUE INDEX uq_users_email    ON users(email);

-- cards — primary access patterns ─────────────────────────────

-- list cards by owner
CREATE INDEX idx_cards_user_id
  ON cards(user_id)
  WHERE deleted_at IS NULL;

-- filter by (owner, status) — most common query in CollectionPage tabs
CREATE INDEX idx_cards_user_status
  ON cards(user_id, status)
  WHERE deleted_at IS NULL;

-- filter by (owner, category) — category filter pill
CREATE INDEX idx_cards_user_category
  ON cards(user_id, category)
  WHERE deleted_at IS NULL;

-- sort by date added — default grid ordering
CREATE INDEX idx_cards_user_created
  ON cards(user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- sort by current value — for portfolio view
CREATE INDEX idx_cards_user_value
  ON cards(user_id, current_value DESC)
  WHERE deleted_at IS NULL;

-- graded-card lookups
CREATE INDEX idx_cards_graded
  ON cards(user_id, grade_company_id, grade_value)
  WHERE is_graded = TRUE AND deleted_at IS NULL;

-- PSA/BGS cert lookup for duplicate detection + cert cache
CREATE INDEX idx_cards_cert
  ON cards(cert_number)
  WHERE cert_number IS NOT NULL;

-- full-text search across name, player, team, set_name, card_number
CREATE INDEX idx_cards_fts
  ON cards
  USING GIN (
    to_tsvector('english',
      COALESCE(name,        '') || ' ' ||
      COALESCE(player,      '') || ' ' ||
      COALESCE(team,        '') || ' ' ||
      COALESCE(set_name,    '') || ' ' ||
      COALESCE(card_number, '')
    )
  )
  WHERE deleted_at IS NULL;

-- price_history ───────────────────────────────────────────────

-- latest price lookup (used by v_latest_price view)
CREATE INDEX idx_ph_card_date
  ON price_history(card_id, recorded_at DESC);

-- transactions ────────────────────────────────────────────────

-- list by owner, descending date — TransactionsPage default
CREATE INDEX idx_tx_user_date
  ON transactions(user_id, transaction_date DESC);

-- filter by type within user scope — P&L calculation (buy/sell split)
CREATE INDEX idx_tx_user_type
  ON transactions(user_id, type);

-- card → transaction join (reverse lookup on card detail page)
CREATE INDEX idx_tx_card
  ON transactions(card_id)
  WHERE card_id IS NOT NULL;

-- sealed products ─────────────────────────────────────────────
CREATE INDEX idx_sealed_user_status
  ON sealed_products(user_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_sph_product_date
  ON sealed_price_history(sealed_product_id, recorded_at DESC);

-- PSA cert cache ──────────────────────────────────────────────
-- Allows scheduled cleanup: DELETE FROM psa_cert_cache WHERE fetched_at < NOW()-'30d'
CREATE INDEX idx_psa_fetched ON psa_cert_cache(fetched_at);

-- ─────────────────────────────────────────────────────────────
-- SECTION 4: VIEWS
-- ─────────────────────────────────────────────────────────────

-- V1. Card P&L — per-card purchase/current/gain-loss
-- Replaces the old collectionStats denorm table for card-level reads.
CREATE VIEW v_card_pl AS
SELECT
  c.id                                                              AS card_id,
  c.user_id,
  c.name,
  c.category,
  c.status,
  c.is_rookie,
  c.is_autographed,
  c.is_graded,
  gc.abbr                                                           AS grade_company,
  c.grade_value,
  c.purchase_price,
  c.current_value,
  ROUND(c.current_value - c.purchase_price, 2)                      AS pl_abs,
  CASE
    WHEN c.purchase_price > 0
      THEN ROUND(((c.current_value - c.purchase_price) / c.purchase_price) * 100, 2)
    ELSE NULL
  END                                                               AS pl_pct,
  c.created_at
FROM cards c
LEFT JOIN grading_companies gc ON gc.id = c.grade_company_id
WHERE c.deleted_at IS NULL;

-- V2. Collection summary — per-user aggregate (replaces collectionStats table)
-- Materialized manually via REFRESH MATERIALIZED VIEW when write load justifies it.
CREATE VIEW v_collection_summary AS
SELECT
  user_id,
  COUNT(*)                                                          AS total_cards,
  COUNT(*) FILTER (WHERE status = 'collection')                     AS collection_count,
  COUNT(*) FILTER (WHERE status = 'wishlist')                       AS wishlist_count,
  COUNT(*) FILTER (WHERE status = 'for_sale')                       AS for_sale_count,
  COUNT(*) FILTER (WHERE status = 'sold')                           AS sold_count,
  COUNT(*) FILTER (WHERE status = 'traded')                         AS traded_count,
  COUNT(*) FILTER (WHERE is_graded = TRUE)                          AS graded_count,
  COUNT(*) FILTER (WHERE is_rookie = TRUE)                          AS rookie_count,
  ROUND(SUM(current_value)  FILTER (WHERE status = 'collection'), 2) AS total_value,
  ROUND(SUM(purchase_price) FILTER (WHERE status = 'collection'), 2) AS total_cost,
  ROUND(
    SUM(current_value - purchase_price)
      FILTER (WHERE status = 'collection'
                AND purchase_price IS NOT NULL
                AND current_value  IS NOT NULL), 2
  )                                                                 AS total_pl
FROM cards
WHERE deleted_at IS NULL
GROUP BY user_id;

-- V3. Category breakdown — used in dashboard pie chart
CREATE VIEW v_category_breakdown AS
SELECT
  user_id,
  category,
  COUNT(*)                         AS card_count,
  ROUND(SUM(current_value),  2)    AS total_value,
  ROUND(SUM(purchase_price), 2)    AS total_cost
FROM cards
WHERE deleted_at IS NULL
  AND status = 'collection'
GROUP BY user_id, category;

-- V4. Transaction P&L summary — Transactions page header stats
CREATE VIEW v_transaction_summary AS
SELECT
  user_id,
  COUNT(*)                                                          AS total_transactions,
  ROUND(SUM(price) FILTER (WHERE type = 'buy'),  2)                AS total_spent,
  ROUND(SUM(price) FILTER (WHERE type = 'sell'), 2)                AS total_earned,
  ROUND(
    COALESCE(SUM(price) FILTER (WHERE type = 'sell'), 0) -
    COALESCE(SUM(price) FILTER (WHERE type = 'buy'),  0), 2
  )                                                                 AS net_pl
FROM transactions
GROUP BY user_id;

-- V5. Latest price per card — used on collection grid tiles (price trend arrow)
CREATE VIEW v_latest_price AS
SELECT DISTINCT ON (card_id)
  card_id,
  value        AS latest_value,
  source       AS latest_source,
  recorded_at  AS latest_price_at
FROM price_history
ORDER BY card_id, recorded_at DESC;

-- V6. Previous price per card — enables trend arrow (up/down/neutral)
CREATE VIEW v_previous_price AS
SELECT card_id, value AS prev_value, recorded_at AS prev_price_at
FROM (
  SELECT card_id, value, recorded_at,
         ROW_NUMBER() OVER (PARTITION BY card_id ORDER BY recorded_at DESC) AS rn
  FROM price_history
) ranked
WHERE rn = 2;

-- V7. Portfolio timeline — 90-day rolling, one row per user per day
-- Powers the Dashboard area chart.
CREATE VIEW v_portfolio_timeline AS
SELECT
  c.user_id,
  DATE_TRUNC('day', ph.recorded_at)::DATE  AS snapshot_date,
  ROUND(SUM(ph.value), 2)                  AS portfolio_value
FROM price_history ph
JOIN cards c ON c.id = ph.card_id
WHERE c.deleted_at IS NULL
  AND c.status = 'collection'
  AND ph.recorded_at >= NOW() - INTERVAL '90 days'
GROUP BY c.user_id, DATE_TRUNC('day', ph.recorded_at)
ORDER BY c.user_id, snapshot_date;

-- V8. Graded card registry — for the graded-slab management view
CREATE VIEW v_graded_cards AS
SELECT
  c.id          AS card_id,
  c.user_id,
  c.name,
  c.set_name,
  c.card_number,
  gc.abbr       AS grade_company,
  c.grade_value,
  c.cert_number,
  c.current_value,
  c.status
FROM cards c
JOIN grading_companies gc ON gc.id = c.grade_company_id
WHERE c.is_graded = TRUE
  AND c.deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- SECTION 5: MATERIALIZED VIEWS (for high-read, low-write paths)
-- ─────────────────────────────────────────────────────────────
-- Refresh strategy: call REFRESH MATERIALIZED VIEW CONCURRENTLY after
-- any bulk import or when scheduled (e.g. nightly cron).

CREATE MATERIALIZED VIEW mv_collection_summary AS
  SELECT * FROM v_collection_summary
WITH DATA;

CREATE UNIQUE INDEX ON mv_collection_summary(user_id);

CREATE MATERIALIZED VIEW mv_category_breakdown AS
  SELECT * FROM v_category_breakdown
WITH DATA;

CREATE UNIQUE INDEX ON mv_category_breakdown(user_id, category);

-- ─────────────────────────────────────────────────────────────
-- SECTION 6: TRIGGERS (auto-maintain updated_at)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cards_updated_at
  BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sealed_updated_at
  BEFORE UPDATE ON sealed_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- SECTION 7: AUTO price_history ON current_value CHANGE
-- ─────────────────────────────────────────────────────────────
-- When a card's current_value is updated and the value actually changed,
-- automatically insert a price_history row so charts stay accurate without
-- requiring callers to remember to do it manually.

CREATE OR REPLACE FUNCTION auto_price_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.current_value IS DISTINCT FROM OLD.current_value
     AND NEW.current_value IS NOT NULL
  THEN
    INSERT INTO price_history (card_id, value, source)
    VALUES (NEW.id, NEW.current_value, 'manual');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cards_price_history
  AFTER UPDATE OF current_value ON cards
  FOR EACH ROW EXECUTE FUNCTION auto_price_history();

-- ─────────────────────────────────────────────────────────────
-- SECTION 8: PSA CERT CACHE CLEANUP FUNCTION
-- ─────────────────────────────────────────────────────────────
-- Call from a scheduled job: SELECT purge_psa_cert_cache(30);
CREATE OR REPLACE FUNCTION purge_psa_cert_cache(days_old INTEGER DEFAULT 30)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM psa_cert_cache
  WHERE fetched_at < NOW() - (days_old || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 9: ROW-LEVEL SECURITY (future-proofing multi-tenant)
-- ─────────────────────────────────────────────────────────────
-- Uncomment when moving to a pooled connection model where the
-- app passes clerk_id as a session variable.
--
-- ALTER TABLE cards          ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transactions   ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sealed_products ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE price_history   ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY cards_user_isolation ON cards
--   USING (user_id = (SELECT id FROM users WHERE clerk_id = current_setting('app.clerk_id')));

-- ─────────────────────────────────────────────────────────────
-- END OF SCHEMA
-- ─────────────────────────────────────────────────────────────
