const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkSQLiteSchema() {
  console.log('🔍 Checking SQLite database schema...');
  
  const dbPath = path.join(__dirname, 'backend', 'lookup.db');
  const db = new sqlite3.Database(dbPath);
  
  try {
    // Get all table names
    const tables = await new Promise((resolve, reject) => {
      db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.name));
      });
    });
    
    console.log('📋 SQLite Tables found:');
    tables.forEach(table => console.log(`  - ${table}`));
    
    // Get schema for each table
    for (const table of tables) {
      console.log(`\n📊 Schema for ${table}:`);
      const schema = await new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${table})`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      schema.forEach(col => {
        console.log(`  - ${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
      });
      
      // Get row count
      const count = await new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      console.log(`  📈 Row count: ${count}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    db.close();
  }
}

checkSQLiteSchema();

