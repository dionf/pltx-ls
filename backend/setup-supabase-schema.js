#!/usr/bin/env node

/**
 * Script to setup Supabase database schema
 * This will create all necessary tables and functions
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const supabaseUrl = 'https://jeqxbpozjwltiayznxvy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplcXhicG96andsdGlheXpueHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1MjU0MzIsImV4cCI6MjA3NDEwMTQzMn0.1czNWEbKlMabFr9qgN8afLPIylj_fs8rl2FqMiSVRR8';

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

async function setupSchema() {
  console.log('🚀 Setting up Supabase database schema...');
  
  try {
    // Read the schema file
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    console.log('📋 Schema file loaded');
    
    // Split schema into individual statements
    const statements = schema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        const { data, error } = await supabase.rpc('exec_sql', {
          query: statement
        });
        
        if (error) {
          console.log(`⚠️  Statement ${i + 1} warning:`, error.message);
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
        }
      } catch (err) {
        console.log(`❌ Statement ${i + 1} failed:`, err.message);
        // Continue with next statement
      }
    }
    
    console.log('🎉 Schema setup completed!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Check your Supabase dashboard to verify tables were created');
    console.log('2. Test the application with: node migrate-to-supabase.js');
    console.log('3. Start the application with: node start-app.js');
    
  } catch (error) {
    console.error('❌ Schema setup failed:', error.message);
    process.exit(1);
  }
}

// Alternative method using direct SQL execution
async function setupSchemaDirect() {
  console.log('🚀 Setting up Supabase database schema (direct method)...');
  
  try {
    // Read the schema file
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    console.log('📋 Schema file loaded');
    
    // Execute the entire schema at once
    const { data, error } = await supabase
      .from('pg_stat_activity')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Database connection failed:', error.message);
      return;
    }
    
    console.log('✅ Database connection successful');
    console.log('⚠️  Please manually execute the schema in Supabase SQL Editor:');
    console.log('');
    console.log('1. Go to your Supabase dashboard');
    console.log('2. Click on "SQL Editor"');
    console.log('3. Click "New query"');
    console.log('4. Copy and paste the contents of backend/db/schema.sql');
    console.log('5. Click "Run" to execute');
    console.log('');
    console.log('Schema content:');
    console.log('─'.repeat(50));
    console.log(schema);
    console.log('─'.repeat(50));
    
  } catch (error) {
    console.error('❌ Schema setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup
if (require.main === module) {
  setupSchemaDirect();
}

module.exports = { setupSchema, setupSchemaDirect };


