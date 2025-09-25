const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://jeqxbpozjwltiayznxvy.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplcXhicG96andsdGlheXpueHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1MjU0MzIsImV4cCI6MjA3NDEwMTQzMn0.1czNWEbKlMabFr9qgN8afLPIylj_fs8rl2FqMiSVRR8';

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

class SupabaseSettings {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  // Get all settings
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value');

      if (error) {
        console.error('Error fetching settings:', error);
        return {};
      }

      const settings = {};
      data.forEach(row => {
        try {
          settings[row.key] = JSON.parse(row.value);
        } catch (e) {
          settings[row.key] = row.value;
        }
      });

      return settings;
    } catch (error) {
      console.error('Error in getAll:', error);
      return {};
    }
  }

  // Get a specific setting
  async get(key) {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', key)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Setting not found
        }
        console.error('Error fetching setting:', error);
        return null;
      }

      try {
        return JSON.parse(data.value);
      } catch (e) {
        return data.value;
      }
    } catch (error) {
      console.error('Error in get:', error);
      return null;
    }
  }

  // Set a specific setting
  async set(key, value) {
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({
          key,
          value: JSON.stringify(value),
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error saving setting:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in set:', error);
      return false;
    }
  }

  // Set multiple settings at once
  async setAll(settings) {
    try {
      const settingsArray = Object.entries(settings).map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('settings')
        .upsert(settingsArray, { onConflict: 'key' });

      if (error) {
        console.error('Error saving settings:', { code: error.code, details: error.details, hint: error.hint, message: error.message });
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in setAll:', error);
      return false;
    }
  }

  // Delete a setting
  async delete(key) {
    try {
      const { error } = await supabase
        .from('settings')
        .delete()
        .eq('key', key);

      if (error) {
        console.error('Error deleting setting:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in delete:', error);
      return false;
    }
  }
}

// Create singleton instance
let settingsInstance = null;

function getSupabaseSettings() {
  if (!settingsInstance) {
    settingsInstance = new SupabaseSettings();
  }
  return settingsInstance;
}

module.exports = { SupabaseSettings, getSupabaseSettings };

