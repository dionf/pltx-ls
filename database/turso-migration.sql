-- Turso database schema migration voor Lial
-- Gebaseerd op bestaande SQLite schema

-- Image fingerprints tabel
CREATE TABLE IF NOT EXISTS image_fingerprints (
  sku TEXT,
  product_id INTEGER,
  url TEXT,
  etag TEXT,
  last_modified TEXT,
  content_length INTEGER,
  sha256 TEXT,
  checked_at TEXT,
  PRIMARY KEY (sku, url)
);

-- Variant lookup tabel
CREATE TABLE IF NOT EXISTS variant_lookup (
  sku TEXT PRIMARY KEY,
  product_id INTEGER,
  variant_id INTEGER
);

-- Brands tabel
CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY,
  name TEXT
);

-- Suppliers tabel
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT
);

-- Exclusions tabel
CREATE TABLE IF NOT EXISTS exclusions (
  sku TEXT PRIMARY KEY,
  reason TEXT,
  created_at TEXT
);

-- Import runs tabel
CREATE TABLE IF NOT EXISTS import_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT,
  finished_at TEXT,
  created INTEGER DEFAULT 0,
  updated INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  triggered_by TEXT
);

-- Import items tabel
CREATE TABLE IF NOT EXISTS import_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER,
  sku TEXT,
  op TEXT,
  status TEXT,
  message TEXT,
  created_at TEXT
);

-- Indexes voor betere performance
CREATE INDEX IF NOT EXISTS idx_image_fingerprints_sku ON image_fingerprints (sku);
CREATE INDEX IF NOT EXISTS idx_image_fingerprints_product_id ON image_fingerprints (product_id);
CREATE INDEX IF NOT EXISTS idx_variant_lookup_product_id ON variant_lookup (product_id);
CREATE INDEX IF NOT EXISTS idx_variant_lookup_variant_id ON variant_lookup (variant_id);
CREATE INDEX IF NOT EXISTS idx_import_runs_started_at ON import_runs (started_at);
CREATE INDEX IF NOT EXISTS idx_import_items_run_id ON import_items (run_id);
CREATE INDEX IF NOT EXISTS idx_import_items_status ON import_items (status);

