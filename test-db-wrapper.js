const { getDatabaseWrapper } = require('./backend/db/database');

async function testDatabaseWrapper() {
  console.log('🔍 Testing database wrapper...');
  
  try {
    const db = getDatabaseWrapper();
    
    // Test get method
    console.log('📋 Testing get method...');
    await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM brands', [], (err, row) => {
        if (err) {
          console.error('❌ Get method failed:', err.message);
          reject(err);
        } else {
          console.log('✅ Get method successful:', row);
          resolve();
        }
      });
    });
    
    // Test all method
    console.log('📋 Testing all method...');
    await new Promise((resolve, reject) => {
      db.all('SELECT * FROM brands LIMIT 3', [], (err, rows) => {
        if (err) {
          console.error('❌ All method failed:', err.message);
          reject(err);
        } else {
          console.log('✅ All method successful:', rows);
          resolve();
        }
      });
    });
    
    // Test run method
    console.log('📋 Testing run method...');
    await new Promise((resolve, reject) => {
      db.run('INSERT OR IGNORE INTO brands (id, name) VALUES (?, ?)', [999998, 'Test Brand 2'], (err, result) => {
        if (err) {
          console.error('❌ Run method failed:', err.message);
          reject(err);
        } else {
          console.log('✅ Run method successful:', result);
          resolve();
        }
      });
    });
    
    // Cleanup test data
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM brands WHERE id = ?', [999998], (err, result) => {
        if (err) {
          console.error('❌ Cleanup failed:', err.message);
          reject(err);
        } else {
          console.log('✅ Cleanup successful');
          resolve();
        }
      });
    });
    
    console.log('🎉 Database wrapper test successful!');
    
  } catch (error) {
    console.error('❌ Database wrapper test failed:', error.message);
  }
}

testDatabaseWrapper();

