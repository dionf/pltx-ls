const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { getSupabaseDatabase } = require('./db/supabase');

// Lightspeed API base
const apiBase = 'https://api.webshopapp.com/en/variants.json';

const SETTINGS_PATH = path.join(__dirname, 'settings.json');

async function createTable() {
  // Ensure table exists in Supabase: create if not exists via executeQuery
  const db = getSupabaseDatabase();
  await db.executeQuery(
    `CREATE TABLE IF NOT EXISTS variant_lookup (
      sku TEXT PRIMARY KEY,
      product_id BIGINT,
      variant_id BIGINT
    )`
  );
}

async function createBrandTable() {
  const db = getSupabaseDatabase();
  await db.executeQuery(
    `CREATE TABLE IF NOT EXISTS brands (
      id BIGINT PRIMARY KEY,
      name TEXT
    )`
  );
}

async function clearTables() {
  const db = getSupabaseDatabase();
  await db.from('variant_lookup').delete().neq('sku', null);
  await db.from('brands').delete().neq('id', null);
  await db.from('suppliers').delete().neq('id', null);
}

async function createSupplierTable() {
  const db = getSupabaseDatabase();
  await db.executeQuery(
    `CREATE TABLE IF NOT EXISTS suppliers (
      id BIGINT PRIMARY KEY,
      name TEXT
    )`
  );
}

async function upsertVariant({ sku, product_id, variant_id }) {
  const db = getSupabaseDatabase();
  const { error } = await db.from('variant_lookup').upsert({ sku, product_id, variant_id });
  if (error) throw error;
}

async function upsertBrand({ id, name }) {
  const db = getSupabaseDatabase();
  const { error } = await db.from('brands').upsert({ id, name });
  if (error) throw error;
}

async function upsertSupplier({ id, name }) {
  const db = getSupabaseDatabase();
  const { error } = await db.from('suppliers').upsert({ id, name });
  if (error) throw error;
}

async function fetchAllVariants({ apiKey, apiSecret }) {
  let page = 1;
  let totalVariants = 0;
  const pageSize = 250;
  let hasMore = true;
  while (hasMore) {
    const url = `${apiBase}?page=${page}&limit=${pageSize}`;
    console.log(`[LS] Ophalen varianten: ${url}`);
    try {
      const res = await axios.get(url, {
        auth: { username: apiKey, password: apiSecret },
        headers: { 'Accept': 'application/json' }
      });
      const variants = res.data.variants || [];
      for (const v of variants) {
        if (v.sku && v.id && v.product && v.product.resource && v.product.resource.id) {
          await upsertVariant({ sku: v.sku, product_id: v.product.resource.id, variant_id: v.id });
          totalVariants++;
        }
      }
      hasMore = variants.length === pageSize;
      page++;
      if (variants.length === 0) break;
      // Rate limiting: pauze tussen API calls
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      console.error(`[LS] Fout bij ophalen varianten op pagina ${page}:`, err.message);
      break;
    }
  }
  console.log(`[LS] Import voltooid. Totaal varianten opgeslagen: ${totalVariants}`);
  return { totalVariants };
}

async function fetchAllBrands({ apiKey, apiSecret }) {
  let page = 1;
  const pageSize = 250;
  let hasMore = true;
  let total = 0;
  while (hasMore) {
    const url = `https://api.webshopapp.com/en/brands.json?page=${page}&limit=${pageSize}`;
    console.log(`[LS] Ophalen brands: ${url}`);
    try {
      const res = await axios.get(url, {
        auth: { username: apiKey, password: apiSecret },
        headers: { 'Accept': 'application/json' }
      });
      const brands = res.data.brands || [];
      for (const b of brands) {
        if (b.id && b.title) {
          await upsertBrand({ id: b.id, name: b.title });
          total++;
        }
      }
      hasMore = brands.length === pageSize;
      page++;
      if (brands.length === 0) break;
      // Rate limiting: pauze tussen API calls
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      console.error(`[LS] Fout bij ophalen brands op pagina ${page}:`, err.message);
      break;
    }
  }
  console.log(`[LS] Brands import voltooid. Totaal brands opgeslagen: ${total}`);
  return { totalBrands: total };
}

async function fetchAllSuppliers({ apiKey, apiSecret }) {
  let page = 1;
  const pageSize = 250;
  let hasMore = true;
  let total = 0;
  while (hasMore) {
    const url = `https://api.webshopapp.com/en/suppliers.json?page=${page}&limit=${pageSize}`;
    console.log(`[LS] Ophalen suppliers: ${url}`);
    try {
      const res = await axios.get(url, {
        auth: { username: apiKey, password: apiSecret },
        headers: { 'Accept': 'application/json' }
      });
      const suppliers = res.data.suppliers || [];
      for (const s of suppliers) {
        if (s.id && s.title) {
          await upsertSupplier({ id: s.id, name: s.title });
          total++;
        }
      }
      hasMore = suppliers.length === pageSize;
      page++;
      if (suppliers.length === 0) break;
      // Rate limiting: pauze tussen API calls
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      console.error(`[LS] Fout bij ophalen suppliers op pagina ${page}:`, err.message);
      break;
    }
  }
  console.log(`[LS] Suppliers import voltooid. Totaal suppliers opgeslagen: ${total}`);
  return { totalSuppliers: total };
}

async function rebuildLookup(options = {}) {
  // Lees API credentials uit settings.json als niet meegegeven
  let apiKey = options.apiKey;
  let apiSecret = options.apiSecret;
  if (!apiKey || !apiSecret) {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      apiKey = settings.apiKey;
      apiSecret = settings.apiSecret;
    } catch (e) {
      throw new Error('Kon settings.json niet lezen voor API credentials');
    }
  }
  if (!apiKey || !apiSecret) {
    throw new Error('API credentials ontbreken');
  }
  await createTable();
  await createBrandTable();
  await createSupplierTable();
  await clearTables();
  const a = await fetchAllVariants({ apiKey, apiSecret });
  const b = await fetchAllBrands({ apiKey, apiSecret });
  const c = await fetchAllSuppliers({ apiKey, apiSecret });
  return { ...a, ...b, ...c };
}

module.exports = { rebuildLookup };

if (require.main === module) {
  (async () => {
    try {
      const totals = await rebuildLookup();
      console.log('[Lookup] Rebuild voltooid:', totals);
    } catch (e) {
      console.error('[Lookup] Rebuild mislukt:', e.message);
      process.exitCode = 1;
    } finally {
      // Database wrapper handles closing automatically
    }
  })();
}