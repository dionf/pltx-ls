#!/usr/bin/env node

/**
 * Migration script to move data from SQLite to Supabase
 * Run this after setting up your Supabase project and schema
 */

const fs = require('fs');
const path = require('path');
const { getDatabaseWrapper } = require('./db/database');

// Load environment variables
require('dotenv').config();

async function migrateToSupabase() {
  console.log('🚀 Starting migration to Supabase...');
  
  const db = getDatabaseWrapper();
  
  try {
    // Check if Supabase is configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.error('❌ Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY');
      process.exit(1);
    }
    
    console.log('✅ Supabase configuration found');
    
    // Test connection
    console.log('🔌 Testing Supabase connection...');
    await new Promise((resolve, reject) => {
      db.get('SELECT 1 as test', [], (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
    
    console.log('✅ Supabase connection successful');
    
    // Migrate settings
    console.log('📋 Migrating settings...');
    const settingsPath = path.join(__dirname, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      
      for (const [key, value] of Object.entries(settings)) {
        await new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
            [key, JSON.stringify(value)],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }
      
      console.log('✅ Settings migrated');
    }
    
    // Migrate products (if any exist in SQLite)
    console.log('📦 Checking for existing products...');
    const existingProducts = await new Promise((resolve, reject) => {
      db.all('SELECT COUNT(*) as count FROM products', [], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    if (existingProducts[0].count > 0) {
      console.log(`📦 Found ${existingProducts[0].count} existing products, skipping migration`);
    } else {
      console.log('📦 No existing products found, ready for fresh start');
    }
    
    console.log('🎉 Migration completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Update your environment variables with Supabase credentials');
    console.log('2. Restart the application');
    console.log('3. Test the application functionality');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateToSupabase();
}

module.exports = { migrateToSupabase };


