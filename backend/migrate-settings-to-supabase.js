#!/usr/bin/env node

/**
 * Migrate settings from SQLite to Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const supabaseUrl = 'https://jeqxbpozjwltiayznxvy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplcXhicG96andsdGlheXpueHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1MjU0MzIsImV4cCI6MjA3NDEwMTQzMn0.1czNWEbKlMabFr9qgN8afLPIylj_fs8rl2FqMiSVRR8';

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateSettings() {
  console.log('🚀 Migrating settings to Supabase...');
  
  try {
    // Check if settings.json exists
    const settingsPath = path.join(__dirname, 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      console.log('⚠️  No settings.json found, creating default settings');
      
      // Create default settings
      const defaultSettings = {
        shopUrl: '',
        storeId: '',
        apiKey: '',
        apiSecret: '',
        mapping: {},
        importUrl: 'https://pim.plytix.com/channels/660288e8a988634e845c47b5/feed',
        lastImport: ''
      };
      
      // Save to Supabase
      for (const [key, value] of Object.entries(defaultSettings)) {
        const { error } = await supabase
          .from('settings')
          .upsert({ key, value: JSON.stringify(value) });
        
        if (error) {
          console.log(`⚠️  Error saving ${key}:`, error.message);
        } else {
          console.log(`✅ Saved ${key}`);
        }
      }
      
      console.log('🎉 Default settings created in Supabase');
      return;
    }
    
    // Read existing settings
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    console.log('📋 Found existing settings:', Object.keys(settings));
    
    // Migrate each setting to Supabase
    for (const [key, value] of Object.entries(settings)) {
      console.log(`📤 Migrating ${key}...`);
      
      const { error } = await supabase
        .from('settings')
        .upsert({ 
          key, 
          value: JSON.stringify(value),
          updated_at: new Date().toISOString()
        });
      
      if (error) {
        console.log(`❌ Error migrating ${key}:`, error.message);
      } else {
        console.log(`✅ Migrated ${key}`);
      }
    }
    
    console.log('');
    console.log('🎉 Settings migration completed!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Update the application to use Supabase for settings');
    console.log('2. Test the application functionality');
    console.log('3. Remove SQLite dependency');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  migrateSettings();
}

module.exports = { migrateSettings };


