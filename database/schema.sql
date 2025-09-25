-- Supabase database schema voor Plytix > Lightspeed sync
-- Multi-tenant database voor meerdere webshops

-- Webshops tabel
CREATE TABLE webshops (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  lightspeed_url VARCHAR(255) NOT NULL,
  api_key VARCHAR(255) NOT NULL,
  api_secret VARCHAR(255) NOT NULL,
  mapping JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Variant lookup per webshop
CREATE TABLE variant_lookup (
  webshop_id VARCHAR(50) REFERENCES webshops(id) ON DELETE CASCADE,
  sku VARCHAR(100) NOT NULL,
  product_id INTEGER NOT NULL,
  variant_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (webshop_id, sku)
);

-- Brands per webshop
CREATE TABLE brands (
  webshop_id VARCHAR(50) REFERENCES webshops(id) ON DELETE CASCADE,
  id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (webshop_id, id)
);

-- Suppliers per webshop
CREATE TABLE suppliers (
  webshop_id VARCHAR(50) REFERENCES webshops(id) ON DELETE CASCADE,
  id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (webshop_id, id)
);

-- Image fingerprints per webshop
CREATE TABLE image_fingerprints (
  webshop_id VARCHAR(50) REFERENCES webshops(id) ON DELETE CASCADE,
  url VARCHAR(500) NOT NULL,
  etag VARCHAR(255),
  last_modified VARCHAR(255),
  content_length INTEGER,
  sha256_hash VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (webshop_id, url)
);

-- Sync logs per webshop
CREATE TABLE sync_logs (
  id SERIAL PRIMARY KEY,
  webshop_id VARCHAR(50) REFERENCES webshops(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL, -- 'full', 'incremental', 'manual'
  status VARCHAR(20) NOT NULL, -- 'running', 'completed', 'failed'
  products_processed INTEGER DEFAULT 0,
  products_created INTEGER DEFAULT 0,
  products_updated INTEGER DEFAULT 0,
  products_failed INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes voor performance
CREATE INDEX idx_variant_lookup_sku ON variant_lookup(sku);
CREATE INDEX idx_variant_lookup_webshop ON variant_lookup(webshop_id);
CREATE INDEX idx_brands_webshop ON brands(webshop_id);
CREATE INDEX idx_suppliers_webshop ON suppliers(webshop_id);
CREATE INDEX idx_image_fingerprints_webshop ON image_fingerprints(webshop_id);
CREATE INDEX idx_sync_logs_webshop ON sync_logs(webshop_id);
CREATE INDEX idx_sync_logs_created_at ON sync_logs(created_at);

-- RLS (Row Level Security) policies
ALTER TABLE webshops ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_lookup ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Voor nu: allow all (later kunnen we per webshop restricties toevoegen)
CREATE POLICY "Allow all operations" ON webshops FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON variant_lookup FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON brands FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON suppliers FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON image_fingerprints FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON sync_logs FOR ALL USING (true);

