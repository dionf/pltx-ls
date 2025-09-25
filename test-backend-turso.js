const { getDatabase } = require('./backend/db/connection');

async function testBackendWithTurso() {
  console.log('🔍 Testing backend with Turso...');
  
  try {
    const db = getDatabase();
    
    // Test health check logic
    console.log('📋 Testing database connection...');
    await db.execute('SELECT 1');
    console.log('✅ Database connection successful!');
    
    // Test some common queries
    console.log('📊 Testing queries...');
    
    // Test brands query
    const brands = await db.execute('SELECT COUNT(*) as count FROM brands');
    console.log(`✅ Brands count: ${brands.rows[0].count}`);
    
    // Test suppliers query
    const suppliers = await db.execute('SELECT COUNT(*) as count FROM suppliers');
    console.log(`✅ Suppliers count: ${suppliers.rows[0].count}`);
    
    // Test variant lookups
    const variants = await db.execute('SELECT COUNT(*) as count FROM variant_lookup');
    console.log(`✅ Variants count: ${variants.rows[0].count}`);
    
    // Test a sample brand query
    const sampleBrands = await db.execute('SELECT * FROM brands LIMIT 3');
    console.log('✅ Sample brands:', sampleBrands.rows);
    
    console.log('🎉 Backend Turso integration test successful!');
    
  } catch (error) {
    console.error('❌ Backend Turso test failed:', error.message);
    console.error('Full error:', error);
  }
}

testBackendWithTurso();

