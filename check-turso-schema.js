const { createClient } = require('@libsql/client');

async function checkTursoSchema() {
  console.log('🔍 Checking Turso database schema...');
  
  const tursoUrl = 'libsql://lial-48-7agency.aws-eu-west-1.turso.io';
  const tursoAuthToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTg0ODE2NDYsImlkIjoiNjE2MDY0YmQtYTMzZS00OWE5LWEzYTctMzYyMjRmM2Y3MmJmIiwicmlkIjoiNDIyMzczMzQtYWEzYi00ZmRiLWJhZmMtMTg4MDg5Mjg4OTc5In0.tSV6fuWOGjPplQMN4wE1AB0KexmlRnSKdHLQjU06bHXY0995cftMLpqP1bmIygeERyl14X6bWswSdO7BFqI-CA';
  
  const client = createClient({ url: tursoUrl, authToken: tursoAuthToken });
  
  try {
    // Get all table names
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('📋 Turso Tables found:');
    tables.rows.forEach(row => console.log(`  - ${row.name}`));
    
    // Get schema for each table
    for (const tableRow of tables.rows) {
      const table = tableRow.name;
      console.log(`\n📊 Schema for ${table}:`);
      
      const schema = await client.execute(`PRAGMA table_info(${table})`);
      schema.rows.forEach(col => {
        console.log(`  - ${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
      });
      
      // Get row count
      const count = await client.execute(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`  📈 Row count: ${count.rows[0].count}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkTursoSchema();

