const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkSQLite() {
  console.log('🔍 Checking SQLite database...');
  
  const dbPath = path.join(__dirname, '..', 'backend', 'lookup.db');
  const db = new sqlite3.Database(dbPath);

  try {
    // Check brands
    const brands = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM brands LIMIT 5', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`📊 Brands in SQLite: ${brands.length} records`);
    console.log('Sample brands:', brands);

    // Check suppliers
    const suppliers = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM suppliers LIMIT 5', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`📊 Suppliers in SQLite: ${suppliers.length} records`);
    console.log('Sample suppliers:', suppliers);

    // Check variant_lookup
    const variants = await new Promise((resolve, reject) => {
      db.all('SELECT COUNT(*) as count FROM variant_lookup', (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0].count);
      });
    });
    
    console.log(`📊 Variant lookups in SQLite: ${variants} records`);

  } catch (error) {
    console.error('❌ Error checking SQLite:', error);
  } finally {
    db.close();
  }
}

checkSQLite();

