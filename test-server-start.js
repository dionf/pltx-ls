// Test server startup
console.log('🔍 Testing server startup...');

try {
  // Test database wrapper
  console.log('📋 Testing database wrapper...');
  const { getDatabaseWrapper } = require('./backend/db/database');
  const db = getDatabaseWrapper();
  console.log('✅ Database wrapper loaded');
  
  // Test a simple query
  console.log('📋 Testing database query...');
  db.get('SELECT 1 as test', [], (err, row) => {
    if (err) {
      console.error('❌ Database query failed:', err.message);
      process.exit(1);
    } else {
      console.log('✅ Database query successful:', row);
      
      // Test express app
      console.log('📋 Testing express app...');
      const express = require('express');
      const app = express();
      
      app.get('/test', (req, res) => {
        res.json({ status: 'ok' });
      });
      
      const server = app.listen(4001, () => {
        console.log('✅ Express server started on port 4001');
        
        // Test health endpoint
        const http = require('http');
        const req = http.get('http://localhost:4001/test', (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            console.log('✅ Health endpoint test successful:', data);
            server.close();
            console.log('🎉 All tests passed!');
          });
        });
        
        req.on('error', (err) => {
          console.error('❌ Health endpoint test failed:', err.message);
          server.close();
          process.exit(1);
        });
      });
    }
  });
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

