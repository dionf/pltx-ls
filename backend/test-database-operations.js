#!/usr/bin/env node

/**
 * Test database operations with Supabase
 */

const { getDatabaseWrapper } = require('./db/database');

async function testDatabaseOperations() {
  console.log('🧪 Testing database operations with Supabase...');
  
  try {
    const db = getDatabaseWrapper();
    
    // Test 1: Insert a test product
    console.log('📦 Testing INSERT operation...');
    const testSku = `TEST_SKU_${Date.now()}`;
    db.run(
      'INSERT INTO products (sku, title, brand, price_incl) VALUES (?, ?, ?, ?)',
      [testSku, 'Test Product', 'Test Brand', 29.99],
      function(err, result) {
        if (err) {
          console.error('❌ INSERT failed:', err.message);
        } else {
          console.log('✅ INSERT successful, ID:', result.lastID);
          
          // Test 2: Select the product
          console.log('🔍 Testing SELECT operation...');
          db.get(
            'SELECT * FROM products WHERE sku = ?',
            [testSku],
            function(err, row) {
              if (err) {
                console.error('❌ SELECT failed:', err.message);
              } else if (row) {
                console.log('✅ SELECT successful:', row);
                
                // Test 3: Update the product
                console.log('🔄 Testing UPDATE operation...');
                db.run(
                  'UPDATE products SET title = ? WHERE sku = ?',
                  ['Updated Test Product', testSku],
                  function(err, result) {
                    if (err) {
                      console.error('❌ UPDATE failed:', err.message);
                    } else {
                      console.log('✅ UPDATE successful, changes:', result.changes);
                      
                      // Test 4: Delete the product
                      console.log('🗑️  Testing DELETE operation...');
                      db.run(
                        'DELETE FROM products WHERE sku = ?',
                        [testSku],
                        function(err, result) {
                          if (err) {
                            console.error('❌ DELETE failed:', err.message);
                          } else {
                            console.log('✅ DELETE successful, changes:', result.changes);
                            console.log('');
                            console.log('🎉 All database operations successful with Supabase!');
                          }
                        }
                      );
                    }
                  }
                );
              } else {
                console.log('❌ SELECT returned no results');
              }
            }
          );
        }
      }
    );
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
  }
}

// Run test
if (require.main === module) {
  testDatabaseOperations();
}

module.exports = { testDatabaseOperations };
