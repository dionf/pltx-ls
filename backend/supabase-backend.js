const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Webshop configuratie
const WEBSHOP_ID = process.env.WEBSHOP_ID || 'lial';

app.use(cors());
app.use(express.json());

// Helper functie om webshop settings op te halen
async function getWebshopSettings() {
  const { data, error } = await supabase
    .from('webshops')
    .select('*')
    .eq('id', WEBSHOP_ID)
    .single();
  
  if (error) {
    throw new Error(`Webshop settings not found: ${error.message}`);
  }
  
  return data;
}

// Helper functie om variant lookup op te halen
async function getVariantLookup(sku) {
  const { data, error } = await supabase
    .from('variant_lookup')
    .select('product_id, variant_id')
    .eq('webshop_id', WEBSHOP_ID)
    .eq('sku', sku)
    .single();
  
  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    throw new Error(`Variant lookup failed: ${error.message}`);
  }
  
  return data;
}

// Helper functie om brand op te halen
async function getBrand(brandId) {
  const { data, error } = await supabase
    .from('brands')
    .select('title')
    .eq('webshop_id', WEBSHOP_ID)
    .eq('id', brandId)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Brand lookup failed: ${error.message}`);
  }
  
  return data;
}

// Helper functie om supplier op te halen
async function getSupplier(supplierId) {
  const { data, error } = await supabase
    .from('suppliers')
    .select('title')
    .eq('webshop_id', WEBSHOP_ID)
    .eq('id', supplierId)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Supplier lookup failed: ${error.message}`);
  }
  
  return data;
}

// Helper functie om image fingerprint op te halen
async function getImageFingerprint(url) {
  const { data, error } = await supabase
    .from('image_fingerprints')
    .select('*')
    .eq('webshop_id', WEBSHOP_ID)
    .eq('url', url)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Image fingerprint lookup failed: ${error.message}`);
  }
  
  return data;
}

// Helper functie om image fingerprint op te slaan
async function saveImageFingerprint(fingerprint) {
  const { error } = await supabase
    .from('image_fingerprints')
    .upsert({
      webshop_id: WEBSHOP_ID,
      ...fingerprint
    });
  
  if (error) {
    throw new Error(`Image fingerprint save failed: ${error.message}`);
  }
}

// Helper functie om sync log op te slaan
async function saveSyncLog(logData) {
  const { error } = await supabase
    .from('sync_logs')
    .insert({
      webshop_id: WEBSHOP_ID,
      ...logData
    });
  
  if (error) {
    throw new Error(`Sync log save failed: ${error.message}`);
  }
}

// API endpoint om webshop settings op te halen
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await getWebshopSettings();
    res.json(settings);
  } catch (error) {
    console.error('Settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint om PIM data te vergelijken met Lightspeed
app.post('/api/pim-lightspeed', async (req, res) => {
  try {
    console.log('🔄 Starting PIM vs Lightspeed comparison...');
    
    const settings = await getWebshopSettings();
    const { importUrl, apiKey, apiSecret, shopUrl } = settings;
    
    // Haal PIM data op
    console.log('📥 Fetching PIM data...');
    const csvResponse = await axios.get(importUrl);
    const csvLines = csvResponse.data.split('\n');
    const headers = csvLines[0].split(';').map(h => h.replace(/"/g, ''));
    
    const results = [];
    
    for (let i = 1; i < csvLines.length; i++) {
      const line = csvLines[i];
      if (!line.trim()) continue;
      
      const values = line.split(';').map(v => v.replace(/"/g, ''));
      const pim = {};
      headers.forEach((header, index) => {
        pim[header] = values[index] || '';
      });
      
      const sku = pim.SKU || pim.sku;
      if (!sku) continue;
      
      console.log(`🔍 Processing SKU: ${sku}`);
      
      // Zoek variant in Supabase
      const variantLookup = await getVariantLookup(sku);
      
      if (variantLookup) {
        // Bestaand product - haal Lightspeed data op
        console.log(`✅ Found existing product: ${sku}`);
        
        // Hier zou je de Lightspeed API aanroepen om de huidige data op te halen
        // Voor nu simuleren we dit
        const lsData = {
          product_id: variantLookup.product_id,
          variant_id: variantLookup.variant_id,
          // ... andere Lightspeed data
        };
        
        results.push({
          exists: true,
          differences: {}, // Hier zou je de verschillen berekenen
          pim,
          ls: lsData,
          product: lsData
        });
      } else {
        // Nieuw product
        console.log(`🆕 New product: ${sku}`);
        results.push({
          exists: false,
          differences: {},
          pim,
          ls: null,
          product: null
        });
      }
    }
    
    console.log(`✅ Comparison complete: ${results.length} products processed`);
    res.json({ results });
    
  } catch (error) {
    console.error('Comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    webshop: WEBSHOP_ID,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Supabase backend running on port ${PORT}`);
  console.log(`🏪 Webshop: ${WEBSHOP_ID}`);
  console.log(`📊 Database: Supabase`);
});

