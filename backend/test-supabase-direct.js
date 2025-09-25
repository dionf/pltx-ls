#!/usr/bin/env node

/**
 * Test script using direct Supabase client (not SQLite wrapper)
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = 'https://jeqxbpozjwltiayznxvy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplcXhicG96andsdGlheXpueHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1MjU0MzIsImV4cCI6MjA3NDEwMTQzMn0.1czNWEbKlMabFr9qgN8afLPIylj_fs8rl2FqMiSVRR8';

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

async function testDirectSupabase() {
  console.log('🧪 Testing direct Supabase connection...');
  
  try {
    // Test basic connection with products table
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .limit(1);
    
    if (productsError) {
      console.log('❌ Products table error:', productsError.message);
      return false;
    }
    
    console.log('✅ Products table accessible');
    console.log('📦 Products count:', products.length);
    
    // Test brands table
    const { data: brands, error: brandsError } = await supabase
      .from('brands')
      .select('*')
      .limit(5);
    
    if (brandsError) {
      console.log('❌ Brands table error:', brandsError.message);
      return false;
    }
    
    console.log('✅ Brands table accessible');
    console.log('🏷️  Brands count:', brands.length);
    
    // Test settings table
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .limit(5);
    
    if (settingsError) {
      console.log('❌ Settings table error:', settingsError.message);
      return false;
    }
    
    console.log('✅ Settings table accessible');
    console.log('⚙️  Settings count:', settings.length);
    
    // Test inserting a test setting
    const { data: insertData, error: insertError } = await supabase
      .from('settings')
      .insert([
        { key: 'test_key', value: 'test_value' }
      ])
      .select();
    
    if (insertError) {
      console.log('⚠️  Insert test failed:', insertError.message);
    } else {
      console.log('✅ Insert test successful');
      
      // Clean up test data
      await supabase
        .from('settings')
        .delete()
        .eq('key', 'test_key');
      console.log('🧹 Test data cleaned up');
    }
    
    console.log('');
    console.log('🎉 Direct Supabase connection test successful!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Update the application to use direct Supabase client');
    console.log('2. Migrate existing settings from SQLite to Supabase');
    console.log('3. Test the full application');
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Run test
if (require.main === module) {
  testDirectSupabase();
}

module.exports = { testDirectSupabase };


