#!/usr/bin/env node

/**
 * Test script to verify Supabase connection and basic functionality
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = 'https://jeqxbpozjwltiayznxvy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplcXhicG96andsdGlheXpueHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1MjU0MzIsImV4cCI6MjA3NDEwMTQzMn0.1czNWEbKlMabFr9qgN8afLPIylj_fs8rl2FqMiSVRR8';

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSupabase() {
  console.log('🧪 Testing Supabase connection...');
  
  try {
    // Test basic connection
    const { data, error } = await supabase
      .from('products')
      .select('count')
      .limit(1);
    
    if (error) {
      console.log('⚠️  Products table not found, this is expected for first setup');
      console.log('Error:', error.message);
    } else {
      console.log('✅ Products table exists');
    }
    
    // Test with a simple query that should work
    const { data: testData, error: testError } = await supabase
      .rpc('version');
    
    if (testError) {
      console.log('⚠️  RPC not available, trying alternative test');
      
      // Try a simple select from information_schema
      const { data: schemaData, error: schemaError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .limit(1);
      
      if (schemaError) {
        console.log('❌ Database connection failed:', schemaError.message);
        return false;
      } else {
        console.log('✅ Database connection successful');
        console.log('📋 Available tables:', schemaData);
      }
    } else {
      console.log('✅ Database connection successful');
      console.log('📋 Database version:', testData);
    }
    
    console.log('');
    console.log('🎉 Supabase connection test completed!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Go to your Supabase dashboard: https://supabase.com/dashboard');
    console.log('2. Select your project');
    console.log('3. Go to "SQL Editor"');
    console.log('4. Create a new query');
    console.log('5. Copy and paste the schema from backend/db/schema.sql');
    console.log('6. Click "Run" to create the tables');
    console.log('7. Then run: node migrate-to-supabase.js');
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Run test
if (require.main === module) {
  testSupabase();
}

module.exports = { testSupabase };


