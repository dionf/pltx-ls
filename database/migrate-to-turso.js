const { createClient } = require('@libsql/client');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

async function migrateToTurso() {
  console.log('🔄 Starting migration from SQLite to Turso...');
  
  // Turso client
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;
  
  if (!tursoUrl || !tursoAuthToken) {
    console.error('❌ TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables are required');
    process.exit(1);
  }
  
  const turso = createClient({ url: tursoUrl, authToken: tursoAuthToken });
  
  // SQLite database
  const sqlitePath = path.join(__dirname, '..', 'backend', 'lookup.db');
  const sqlite = new sqlite3.Database(sqlitePath);
  
  try {
    // Test Turso connection
    console.log('🔍 Testing Turso connection...');
    await turso.execute('SELECT 1');
    console.log('✅ Turso connection successful');
    
    // Create schema in Turso
    console.log('📋 Creating schema in Turso...');
    const schema = `
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
      
      CREATE TABLE IF NOT EXISTS variant_lookup (
        sku TEXT PRIMARY KEY,
        product_id INTEGER,
        variant_id INTEGER
      );
      
      CREATE TABLE IF NOT EXISTS brands (
        id INTEGER PRIMARY KEY,
        name TEXT
      );
      
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY,
        name TEXT
      );
      
      CREATE TABLE IF NOT EXISTS exclusions (
        sku TEXT PRIMARY KEY,
        reason TEXT,
        created_at TEXT
      );
      
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
      
      CREATE TABLE IF NOT EXISTS import_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER,
        sku TEXT,
        op TEXT,
        status TEXT,
        message TEXT,
        created_at TEXT
      );
    `;
    
    await turso.execute(schema);
    console.log('✅ Schema created in Turso');
    
    // Migrate data from SQLite to Turso
    console.log('📦 Migrating data...');
    
    // Migrate brands
    const brands = await new Promise((resolve, reject) => {
      sqlite.all('SELECT * FROM brands', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    for (const brand of brands) {
      await turso.execute({
        sql: 'INSERT OR REPLACE INTO brands (id, name) VALUES (?, ?)',
        args: [brand.id, brand.name]
      });
    }
    console.log(`✅ Migrated ${brands.length} brands`);
    
    // Migrate suppliers
    const suppliers = await new Promise((resolve, reject) => {
      sqlite.all('SELECT * FROM suppliers', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    for (const supplier of suppliers) {
      await turso.execute({
        sql: 'INSERT OR REPLACE INTO suppliers (id, name) VALUES (?, ?)',
        args: [supplier.id, supplier.name]
      });
    }
    console.log(`✅ Migrated ${suppliers.length} suppliers`);
    
    // Migrate variant lookups
    const variants = await new Promise((resolve, reject) => {
      sqlite.all('SELECT * FROM variant_lookup', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    for (const variant of variants) {
      await turso.execute({
        sql: 'INSERT OR REPLACE INTO variant_lookup (sku, product_id, variant_id) VALUES (?, ?, ?)',
        args: [variant.sku, variant.product_id, variant.variant_id]
      });
    }
    console.log(`✅ Migrated ${variants.length} variant lookups`);
    
    // Migrate image fingerprints
    const images = await new Promise((resolve, reject) => {
      sqlite.all('SELECT * FROM image_fingerprints', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    for (const image of images) {
      await turso.execute({
        sql: 'INSERT OR REPLACE INTO image_fingerprints (sku, product_id, url, etag, last_modified, content_length, sha256, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [image.sku, image.product_id, image.url, image.etag, image.last_modified, image.content_length, image.sha256, image.checked_at]
      });
    }
    console.log(`✅ Migrated ${images.length} image fingerprints`);
    
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    sqlite.close();
  }
}

migrateToTurso();

