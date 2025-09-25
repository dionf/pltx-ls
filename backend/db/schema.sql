-- Supabase PostgreSQL Schema for Lightspeed Import

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Disable RLS for all tables (since this is a backend service, not user-facing)
-- RLS can be enabled later if needed for security

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(255) UNIQUE NOT NULL,
    ean VARCHAR(255),
    title TEXT,
    brand VARCHAR(255),
    supplier VARCHAR(255),
    price_excl DECIMAL(10,2),
    price_incl DECIMAL(10,2),
    stock_level INTEGER DEFAULT 0,
    weight DECIMAL(8,3),
    volume DECIMAL(8,3),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Variants table
CREATE TABLE IF NOT EXISTS variants (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(255) UNIQUE NOT NULL,
    ean VARCHAR(255),
    title TEXT,
    price_excl DECIMAL(10,2),
    price_incl DECIMAL(10,2),
    stock_level INTEGER DEFAULT 0,
    weight DECIMAL(8,3),
    volume DECIMAL(8,3),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Brands table
CREATE TABLE IF NOT EXISTS brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Image tracking table
CREATE TABLE IF NOT EXISTS image_tracking (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    variant_id INTEGER REFERENCES variants(id) ON DELETE CASCADE,
    sku TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL,
    filename VARCHAR(255),
    file_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Import runs table
CREATE TABLE IF NOT EXISTS import_runs (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMP DEFAULT NOW(),
    finished_at TIMESTAMP,
    duration_ms INTEGER,
    created INTEGER DEFAULT 0,
    updated INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'running'
);

-- Import run items table
CREATE TABLE IF NOT EXISTS import_run_items (
    id SERIAL PRIMARY KEY,
    run_id INTEGER REFERENCES import_runs(id) ON DELETE CASCADE,
    sku VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'create', 'update', 'skip', 'error'
    message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Variant lookup table (for Lightspeed integration)
CREATE TABLE IF NOT EXISTS variant_lookup (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(255) UNIQUE NOT NULL,
    product_id INTEGER,
    variant_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Exclusions table (for excluded fields)
CREATE TABLE IF NOT EXISTS exclusions (
    id SERIAL PRIMARY KEY,
    field_name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Import items table (for import tracking)
CREATE TABLE IF NOT EXISTS import_items (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON variants(sku);
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_image_tracking_product_id ON image_tracking(product_id);
CREATE INDEX IF NOT EXISTS idx_image_tracking_variant_id ON image_tracking(variant_id);
CREATE INDEX IF NOT EXISTS idx_image_tracking_sku ON image_tracking(sku);
CREATE INDEX IF NOT EXISTS idx_import_run_items_run_id ON import_run_items(run_id);
CREATE INDEX IF NOT EXISTS idx_import_run_items_sku ON import_run_items(sku);
CREATE INDEX IF NOT EXISTS idx_variant_lookup_sku ON variant_lookup(sku);
CREATE INDEX IF NOT EXISTS idx_exclusions_field_name ON exclusions(field_name);
CREATE INDEX IF NOT EXISTS idx_import_items_sku ON import_items(sku);

-- Create function to execute raw SQL (for compatibility)
CREATE OR REPLACE FUNCTION execute_sql(query TEXT, params TEXT[] DEFAULT '{}')
RETURNS TABLE(result JSON)
LANGUAGE plpgsql
AS $$
BEGIN
    -- This function allows executing raw SQL queries
    -- Note: This is a simplified implementation for compatibility
    -- In production, you should use proper parameterized queries
    RETURN QUERY EXECUTE 'SELECT row_to_json(t) FROM (' || query || ') t';
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'SQL execution error: %', SQLERRM;
END;
$$;

-- Disable RLS for all tables (backend service doesn't need RLS)
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE variants DISABLE ROW LEVEL SECURITY;
ALTER TABLE brands DISABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE image_tracking DISABLE ROW LEVEL SECURITY;
ALTER TABLE import_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE import_run_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE variant_lookup DISABLE ROW LEVEL SECURITY;
ALTER TABLE exclusions DISABLE ROW LEVEL SECURITY;
ALTER TABLE import_items DISABLE ROW LEVEL SECURITY;
