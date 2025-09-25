const sqlite3 = require('sqlite3').verbose();
const { getSupabaseDatabase } = require('./db/supabase');

async function migrateData() {
  console.log('🚀 Starting SQLite to Supabase migration...');
  
  // Connect to SQLite
  const sqliteDb = new sqlite3.Database('lookup.db');
  const supabaseDb = getSupabaseDatabase();
  
  try {
    // 1. Migrate brands
    console.log('📦 Migrating brands...');
    const brands = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM brands', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    for (const brand of brands) {
      try {
        await supabaseDb.executeQuery(
          'INSERT INTO brands (id, name) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name',
          [brand.id, brand.name]
        );
      } catch (error) {
        console.log(`⚠️  Brand ${brand.id} already exists or error:`, error.message);
      }
    }
    console.log(`✅ Migrated ${brands.length} brands`);
    
    // 2. Migrate suppliers
    console.log('🏢 Migrating suppliers...');
    const suppliers = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM suppliers', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    for (const supplier of suppliers) {
      try {
        await supabaseDb.executeQuery(
          'INSERT INTO suppliers (id, name) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name',
          [supplier.id, supplier.name]
        );
      } catch (error) {
        console.log(`⚠️  Supplier ${supplier.id} already exists or error:`, error.message);
      }
    }
    console.log(`✅ Migrated ${suppliers.length} suppliers`);
    
    // 3. Migrate variant_lookup
    console.log('🔗 Migrating variant lookups...');
    const variants = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM variant_lookup', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    let migratedCount = 0;
    for (const variant of variants) {
      try {
        await supabaseDb.executeQuery(
          'INSERT INTO variant_lookup (sku, product_id, variant_id) VALUES (?, ?, ?) ON CONFLICT (sku) DO UPDATE SET product_id = EXCLUDED.product_id, variant_id = EXCLUDED.variant_id',
          [variant.sku, variant.product_id, variant.variant_id]
        );
        migratedCount++;
      } catch (error) {
        console.log(`⚠️  Variant ${variant.sku} error:`, error.message);
      }
    }
    console.log(`✅ Migrated ${migratedCount} variant lookups`);
    
    // 4. Check if there are import_runs and import_items
    console.log('📊 Checking for import data...');
    const importRuns = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM import_runs ORDER BY id DESC LIMIT 5', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    if (importRuns.length > 0) {
      console.log(`📈 Found ${importRuns.length} import runs in SQLite`);
      for (const run of importRuns) {
        console.log(`  - Run ${run.id}: ${run.created || 0} created, ${run.updated || 0} updated, ${run.failed || 0} failed`);
      }
    }
    
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    sqliteDb.close();
  }
}

migrateData();


