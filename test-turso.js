const { createClient } = require('@libsql/client');

// Turso credentials
const tursoUrl = 'libsql://lial-48-7agency.aws-eu-west-1.turso.io';
const tursoAuthToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTg0ODE2NDYsImlkIjoiNjE2MDY0YmQtYTMzZS00OWE5LWEzYTctMzYyMjRmM2Y3MmJmIiwicmlkIjoiNDIyMzczMzQtYWEzYi00ZmRiLWJhZmMtMTg4MDg5Mjg4OTc5In0.tSV6fuWOGjPplQMN4wE1AB0KexmlRnSKdHLQjU06bHXY0995cftMLpqP1bmIygeERyl14X6bWswSdO7BFqI-CA';

async function testTursoConnection() {
  console.log('🔍 Testing Turso connection...');
  
  try {
    const client = createClient({ url: tursoUrl, authToken: tursoAuthToken });
    
    // Test connection
    const result = await client.execute('SELECT 1 as test');
    console.log('✅ Turso connection successful!');
    console.log('📊 Test query result:', result);
    
    // Create schema
    console.log('📋 Creating schema...');
    
    const tables = [
      `CREATE TABLE IF NOT EXISTS image_fingerprints (
        sku TEXT,
        product_id INTEGER,
        url TEXT,
        etag TEXT,
        last_modified TEXT,
        content_length INTEGER,
        sha256 TEXT,
        checked_at TEXT,
        PRIMARY KEY (sku, url)
      )`,
      
      `CREATE TABLE IF NOT EXISTS variant_lookup (
        sku TEXT PRIMARY KEY,
        product_id INTEGER,
        variant_id INTEGER
      )`,
      
      `CREATE TABLE IF NOT EXISTS brands (
        id INTEGER PRIMARY KEY,
        name TEXT
      )`,
      
      `CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY,
        name TEXT
      )`,
      
      `CREATE TABLE IF NOT EXISTS exclusions (
        sku TEXT PRIMARY KEY,
        reason TEXT,
        created_at TEXT
      )`,
      
      `CREATE TABLE IF NOT EXISTS import_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT,
        finished_at TEXT,
        created INTEGER DEFAULT 0,
        updated INTEGER DEFAULT 0,
        failed INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        triggered_by TEXT
      )`,
      
      `CREATE TABLE IF NOT EXISTS import_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER,
        sku TEXT,
        op TEXT,
        status TEXT,
        message TEXT,
        created_at TEXT
      )`
    ];
    
    for (const table of tables) {
      await client.execute(table);
      console.log(`✅ Created table: ${table.split(' ')[5]}`);
    }
    console.log('✅ Schema created successfully!');
    
    // Test insert
    console.log('🧪 Testing insert...');
    await client.execute({
      sql: 'INSERT INTO brands (id, name) VALUES (?, ?)',
      args: [999999, 'Test Brand']
    });
    console.log('✅ Test insert successful!');
    
    // Test select
    const brands = await client.execute('SELECT * FROM brands WHERE id = ?', [999999]);
    console.log('✅ Test select successful!');
    console.log('📊 Test data:', brands.rows);
    
    // Cleanup test data
    await client.execute('DELETE FROM brands WHERE id = ?', [999999]);
    console.log('✅ Test cleanup successful!');
    
    console.log('🎉 All tests passed! Turso is ready to use.');
    
  } catch (error) {
    console.error('❌ Turso connection failed:', error.message);
    console.error('Full error:', error);
  }
}

testTursoConnection();
