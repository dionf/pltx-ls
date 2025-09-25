const { createClient } = require('@libsql/client');
const { getSupabaseDatabase } = require('./supabase');

// Turso database connection (deprecated)
function createTursoClient() {
  const url = process.env.TURSO_DATABASE_URL || 'libsql://lial-48-7agency.aws-eu-west-1.turso.io';
  const authToken = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTg0ODE2NDYsImlkIjoiNjE2MDY0YmQtYTMzZS00OWE5LWEzYTctMzYyMjRmM2Y3MmJmIiwicmlkIjoiNDIyMzczMzQtYWEzYi00ZmRiLWJhZmMtMTg4MDg5Mjg4OTc5In0.tSV6fuWOGjPplQMN4wE1AB0KexmlRnSKHHLQjU06bHXY0995cftMLpqP1bmIygeERyl14X6bWswSdO7BFqI-CA';
  
  return createClient({ url, authToken });
}

// Fallback to SQLite for local development
function createSQLiteClient() {
  const sqlite3 = require('sqlite3').verbose();
  const path = require('path');
  const lookupDbPath = path.join(__dirname, '..', 'lookup.db');
  return new sqlite3.Database(lookupDbPath);
}

// Main database client - Supabase preferred, SQLite fallback
function getDatabase() {
  // Set environment variables if not already set
  if (!process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = 'https://jeqxbpozjwltiayznxvy.supabase.co';
  }
  if (!process.env.SUPABASE_ANON_KEY) {
    process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplcXhicG96andsdGlheXpueHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1MjU0MzIsImV4cCI6MjA3NDEwMTQzMn0.1czNWEbKlMabFr9qgN8afLPIylj_fs8rl2FqMiSVRR8';
  }
  
  // Use Supabase if configured, otherwise fallback to SQLite
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    console.log('✅ Using Supabase database');
    return getSupabaseDatabase();
  } else {
    console.log('⚠️  Supabase not configured, using SQLite fallback');
    return createSQLiteClient();
  }
}

module.exports = {
  createTursoClient,
  createSQLiteClient,
  getDatabase
};
