const { createClient } = require('@libsql/client');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Turso credentials
const tursoUrl = 'libsql://lial-48-7agency.aws-eu-west-1.turso.io';
const tursoAuthToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTg0ODE2NDYsImlkIjoiNjE2MDY0YmQtYTMzZS00OWE5LWEzYTctMzYyMjRmM2Y3MmJmIiwicmlkIjoiNDIyMzczMzQtYWEzYi00ZmRiLWJhZmMtMTg4MDg5Mjg4OTc5In0.tSV6fuWOGjPplQMN4wE1AB0KexmlRnSKdHLQjU06bHXY0995cftMLpqP1bmIygeERyl14X6bWswSdO7BFqI-CA';

async function migrateData() {
  console.log('🔄 Starting data migration from SQLite to Turso...');
  
  // Turso client
  const turso = createClient({ url: tursoUrl, authToken: tursoAuthToken });
  
  // SQLite database
  const sqlitePath = path.join(__dirname, 'backend', 'lookup.db');
  const sqlite = new sqlite3.Database(sqlitePath);
  
  try {
    // Migrate brands
    console.log('📦 Migrating brands...');
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
    console.log('📦 Migrating suppliers...');
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
    console.log('📦 Migrating variant lookups...');
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
    console.log('📦 Migrating image fingerprints...');
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
    
    // Verify migration
    console.log('🔍 Verifying migration...');
    const tursoBrands = await turso.execute('SELECT COUNT(*) as count FROM brands');
    const tursoSuppliers = await turso.execute('SELECT COUNT(*) as count FROM suppliers');
    const tursoVariants = await turso.execute('SELECT COUNT(*) as count FROM variant_lookup');
    
    console.log(`📊 Turso data counts:`);
    console.log(`  - Brands: ${tursoBrands.rows[0].count}`);
    console.log(`  - Suppliers: ${tursoSuppliers.rows[0].count}`);
    console.log(`  - Variants: ${tursoVariants.rows[0].count}`);
    
    console.log('🎉 Data migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    sqlite.close();
  }
}

migrateData();

