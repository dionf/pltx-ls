const { createClient } = require('@supabase/supabase-js');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

// Supabase configuratie
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Webshop configuratie
const WEBSHOP_ID = process.env.WEBSHOP_ID || 'lial';
const WEBSHOP_NAME = process.env.WEBSHOP_NAME || 'Lial';

async function migrateToSupabase() {
  console.log('🚀 Starting migration to Supabase...');
  
  try {
    // 1. Maak webshop aan in Supabase
    console.log('📝 Creating webshop in Supabase...');
    const { data: webshop, error: webshopError } = await supabase
      .from('webshops')
      .upsert({
        id: WEBSHOP_ID,
        name: WEBSHOP_NAME,
        lightspeed_url: process.env.LIGHTSPEED_URL || 'https://lial.webshopapp.com/',
        api_key: process.env.LIGHTSPEED_API_KEY || '',
        api_secret: process.env.LIGHTSPEED_API_SECRET || '',
        mapping: {
          brand: 'Brand',
          supplier: 'Supplier',
          price: 'Price',
          visibility: 'Visibility'
        },
        settings: {
          languages: ['nl', 'de', 'en'],
          sync_frequency: 'hourly',
          enabled: true
        }
      })
      .select()
      .single();

    if (webshopError) {
      throw new Error(`Webshop creation failed: ${webshopError.message}`);
    }
    console.log('✅ Webshop created:', webshop.name);

    // 2. Open SQLite database
    console.log('📂 Opening SQLite database...');
    const dbPath = path.join(__dirname, '..', 'backend', 'lookup.db');
    const db = new sqlite3.Database(dbPath);

    // 3. Migreer variant_lookup
    console.log('🔄 Migrating variant_lookup...');
    const variants = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM variant_lookup', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (variants.length > 0) {
      const variantData = variants.map(v => ({
        webshop_id: WEBSHOP_ID,
        sku: v.sku,
        product_id: v.product_id,
        variant_id: v.variant_id
      }));

      const { error: variantError } = await supabase
        .from('variant_lookup')
        .upsert(variantData);

      if (variantError) {
        throw new Error(`Variant lookup migration failed: ${variantError.message}`);
      }
      console.log(`✅ Migrated ${variants.length} variant lookups`);
    }

    // 4. Migreer brands
    console.log('🔄 Migrating brands...');
    const brands = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM brands', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (brands.length > 0) {
      const brandData = brands
        .filter(b => b.name && b.name.trim() !== '') // Filter out null/empty names
        .map(b => ({
          webshop_id: WEBSHOP_ID,
          id: b.id,
          title: b.name.trim() // Map name to title
        }));

      const { error: brandError } = await supabase
        .from('brands')
        .upsert(brandData);

      if (brandError) {
        throw new Error(`Brands migration failed: ${brandError.message}`);
      }
      console.log(`✅ Migrated ${brands.length} brands`);
    }

    // 5. Migreer suppliers
    console.log('🔄 Migrating suppliers...');
    const suppliers = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM suppliers', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (suppliers.length > 0) {
      const supplierData = suppliers
        .filter(s => s.name && s.name.trim() !== '') // Filter out null/empty names
        .map(s => ({
          webshop_id: WEBSHOP_ID,
          id: s.id,
          title: s.name.trim() // Map name to title
        }));

      const { error: supplierError } = await supabase
        .from('suppliers')
        .upsert(supplierData);

      if (supplierError) {
        throw new Error(`Suppliers migration failed: ${supplierError.message}`);
      }
      console.log(`✅ Migrated ${suppliers.length} suppliers`);
    }

    // 6. Migreer image_fingerprints
    console.log('🔄 Migrating image_fingerprints...');
    const images = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM image_fingerprints', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (images.length > 0) {
      const imageData = images.map(i => ({
        webshop_id: WEBSHOP_ID,
        url: i.url,
        etag: i.etag,
        last_modified: i.last_modified,
        content_length: i.content_length,
        sha256_hash: i.sha256_hash
      }));

      const { error: imageError } = await supabase
        .from('image_fingerprints')
        .upsert(imageData);

      if (imageError) {
        throw new Error(`Image fingerprints migration failed: ${imageError.message}`);
      }
      console.log(`✅ Migrated ${images.length} image fingerprints`);
    }

    // 7. Sluit SQLite database
    db.close();

    console.log('🎉 Migration completed successfully!');
    console.log(`📊 Migrated data for webshop: ${WEBSHOP_NAME} (${WEBSHOP_ID})`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  migrateToSupabase();
}

module.exports = { migrateToSupabase };
