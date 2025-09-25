const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FormData = require('form-data');
const axios = require('axios');
const https = require('https');
const http = require('http');
// const sqlite3 = require('sqlite3').verbose(); // Removed - using database wrapper
// const lookupDbPath = path.join(__dirname, 'lookup.db'); // Removed - using database wrapper
const { rebuildLookup } = require('./init_lightspeed_lookup');
// const { getDatabaseWrapper } = require('./db/database'); // Replaced with Supabase
const { getSupabaseSettings } = require('./services/supabase-settings');
const { getSupabaseDatabase } = require('./db/supabase');

// Helper function to get settings (Supabase first, env fallback, no file IO on Vercel)
async function getSettings() {
  try {
    const settings = getSupabaseSettings();
    const fromDb = await settings.getAll();
    if (fromDb && Object.keys(fromDb).length > 0) return fromDb;
  } catch (_) {}
  // Fallback to environment variables only
  return {
    importUrl: process.env.IMPORT_URL || '',
    apiKey: process.env.LIGHTSPEED_API_KEY || process.env.apiKey || '',
    apiSecret: process.env.LIGHTSPEED_API_SECRET || process.env.apiSecret || '',
    mapping: process.env.MAPPING ? JSON.parse(process.env.MAPPING) : undefined,
  };
}

const app = express();
const upload = multer({ dest: 'uploads/' });
const SETTINGS_PATH = path.join(__dirname, 'settings.json');

// Tenant and console prefixing
const TENANT = process.env.TENANT || 'unknown';
try {
  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };
  ['log', 'info', 'warn', 'error'].forEach((method) => {
    console[method] = (...args) => originalConsole[method](`tenant=${TENANT}`, ...args);
  });
} catch (_) {}

// Disable file-based settings in serverless (Vercel): always fall back to Supabase/env
try {
  if (process.env.VERCEL) {
    const originalExistsSync = fs.existsSync.bind(fs);
    const originalReadFileSync = fs.readFileSync.bind(fs);
    fs.existsSync = (p) => (p === SETTINGS_PATH ? false : originalExistsSync(p));
    fs.readFileSync = (p, enc) => (p === SETTINGS_PATH ? '{}' : originalReadFileSync(p, enc));
  }
} catch (_) {}

app.use(cors());
app.use(express.json({ limit: '100mb' }));
// Basic request logger
app.use((req, _res, next) => {
  try { console.info('HTTP', req.method, req.originalUrl || req.url); } catch (_) {}
  next();
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const db = getSupabaseDatabase();
    
    // Test Supabase connection by querying a small count on a known table
    let dbStatus = 'unknown';
    try {
      const { count, error } = await db.client
        .from('variant_lookup')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      dbStatus = 'supabase_ok';
    } catch (error) {
      dbStatus = 'supabase_error';
      console.error('Supabase connection error:', error.message);
    }
    
    res.json({ 
      status: 'ok',
      version: '1.0.0',
      database: dbStatus,
      databaseProvider: 'supabase',
      environment: process.env.NODE_ENV || 'development',
      tenant: process.env.TENANT || 'unknown',
      webshop: process.env.WEBSHOP_ID || 'unknown',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Utility: logs test
app.get('/api/logs/test', async (req, res) => {
  try {
    console.info('logs/test endpoint hit');
    res.json({ ok: true, tenant: TENANT });
  } catch (e) {
    console.error('logs/test error', e?.message || e);
    res.status(500).json({ ok: false, message: e?.message || String(e) });
  }
});

// Skeleton sync endpoints (idempotent, respect DRY_RUN)
app.get('/api/sync/run', async (req, res) => {
  const dryRun = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';
  try {
    if (dryRun) {
      console.info('sync/run DRY RUN');
    } else {
      console.info('sync/run started');
    }
    res.json({ ok: true, dryRun });
  } catch (e) {
    console.error('sync/run error', e?.message || e);
    res.status(500).json({ ok: false, message: e?.message || String(e) });
  }
});

app.get('/api/sync/images', async (req, res) => {
  const dryRun = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';
  try {
    if (dryRun) {
      console.info('sync/images DRY RUN');
    } else {
      console.info('sync/images started');
    }
    res.json({ ok: true, dryRun });
  } catch (e) {
    console.error('sync/images error', e?.message || e);
    res.status(500).json({ ok: false, message: e?.message || String(e) });
  }
});

// Rebuild lookup database (variants, brands, suppliers)
app.post('/api/lookup/rebuild', async (req, res) => {
  try {
    const settings = await getSettings();
    const { apiKey, apiSecret } = settings || {};
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'API credentials missing' });
    }
    const totals = await rebuildLookup({ apiKey, apiSecret });
    res.json({ status: 'ok', totals });
  } catch (e) {
    console.error('❌ Fout bij rebuild lookup:', e);
    res.status(500).json({ error: e.message });
  }
});

// Import runs API
app.post('/api/import-runs/start', async (req, res) => {
  try {
    const { triggeredBy } = req.body || {};
    const db = getSupabaseDatabase();
    const startedAt = new Date().toISOString();
    const { data, error } = await db
      .from('import_runs')
      .insert({ started_at: startedAt, triggered_by: triggeredBy || 'manual', created: 0, updated: 0, failed: 0, duration_ms: 0 })
      .select('id')
      .limit(1);
    if (error) {
      console.error('❌ import-runs/start supabase error', { code: error.code, details: error.details, hint: error.hint, message: error.message });
      return res.status(500).json({ ok: false, code: error.code, details: error.details, hint: error.hint, message: error.message });
    }
    const runId = Array.isArray(data) ? (data[0]?.id ?? null) : null;
    if (!runId) {
      return res.status(500).json({ ok: false, message: 'No run id returned' });
    }
    res.json({ runId, startedAt });
  } catch (e) {
    console.error('❌ import-runs/start failed:', e?.message || e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post('/api/import-runs/:runId/item', async (req, res) => {
  try {
    const { runId } = req.params;
    const { sku, op, status, message } = req.body || {};
    const db = getSupabaseDatabase();
    const createdAt = new Date().toISOString();
    const { error: insertErr } = await db
      .from('import_items')
      .insert({ run_id: runId, sku: sku || '', op: op || '', status: status || '', message: message || '', created_at: createdAt });
    if (insertErr) {
      console.error('❌ import-runs/item insert error', { code: insertErr.code, details: insertErr.details, hint: insertErr.hint, message: insertErr.message });
      return res.status(500).json({ ok: false, code: insertErr.code, details: insertErr.details, hint: insertErr.hint, message: insertErr.message });
    }
    // Update counters
    const counterCol = status === 'ok' ? (op === 'create' ? 'created' : 'updated') : 'failed';
    const { data: curr, error: selErr } = await db
      .from('import_runs')
      .select('created,updated,failed')
      .eq('id', runId)
      .single();
    if (selErr) {
      console.error('❌ import-runs/item select counters error', { code: selErr.code, details: selErr.details, hint: selErr.hint, message: selErr.message });
      return res.status(500).json({ ok: false, code: selErr.code, details: selErr.details, hint: selErr.hint, message: selErr.message });
    }
    const next = { created: curr?.created || 0, updated: curr?.updated || 0, failed: curr?.failed || 0 };
    next[counterCol] = (next[counterCol] || 0) + 1;
    const { error: updErr } = await db
      .from('import_runs')
      .update({ created: next.created, updated: next.updated, failed: next.failed })
      .eq('id', runId);
    if (updErr) {
      console.error('❌ import-runs/item update counters error', { code: updErr.code, details: updErr.details, hint: updErr.hint, message: updErr.message });
      return res.status(500).json({ ok: false, code: updErr.code, details: updErr.details, hint: updErr.hint, message: updErr.message });
    }
    res.json({ status: 'logged' });
  } catch (e) {
    console.error('❌ import-runs/item failed:', e?.message || e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post('/api/import-runs/:runId/finish', async (req, res) => {
  try {
    const { runId } = req.params;
    const db = getSupabaseDatabase();
    const { data: row, error } = await db
      .from('import_runs')
      .select('started_at')
      .eq('id', runId)
      .single();
    if (error) {
      console.error('❌ import-runs/finish select error', { code: error.code, details: error.details, hint: error.hint, message: error.message });
      return res.status(500).json({ ok: false, code: error.code, details: error.details, hint: error.hint, message: error.message });
    }
    const finishedAt = new Date().toISOString();
    const durationMs = row && row.started_at ? (new Date(finishedAt) - new Date(row.started_at)) : 0;
    const { error: updErr } = await db
      .from('import_runs')
      .update({ finished_at: finishedAt, duration_ms: durationMs })
      .eq('id', runId);
    if (updErr) {
      console.error('❌ import-runs/finish update error', { code: updErr.code, details: updErr.details, hint: updErr.hint, message: updErr.message });
      return res.status(500).json({ ok: false, code: updErr.code, details: updErr.details, hint: updErr.hint, message: updErr.message });
    }
    res.json({ status: 'finished', finishedAt, durationMs });
  } catch (e) {
    console.error('❌ import-runs/finish failed:', e?.message || e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// Recent runs (latest N) with summaries
app.get('/api/import-runs/recent', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '3', 10), 20));
    const db = getSupabaseDatabase();
    // Haal laatste runs op via Supabase query builder (met order/limit)
    const { data: runs, error: runsError } = await db
      .from('import_runs')
      .select('*')
      .order('id', { ascending: false })
      .limit(limit);
    if (runsError) throw runsError;
    // Voor elke run: tel items per status/op
    const withSummaries = [];
    for (const run of runs) {
      const { data: items, error: itemsError } = await db
        .from('import_items')
        .select('op,status')
        .eq('run_id', run.id);
      if (itemsError) throw itemsError;
      const summary = {
        total: items.length,
        created: items.filter(i => i.status === 'ok' && i.op === 'create').length,
        updated: items.filter(i => i.status === 'ok' && i.op === 'update').length,
        failed: items.filter(i => i.status === 'fail').length
      };
      withSummaries.push({ ...run, summary });
    }
    res.json({ runs: withSummaries });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/dashboard/overview', async (req, res) => {
  try {
    const db = getSupabaseDatabase();

    console.log('🔍 Fetching dashboard data from Supabase...');
    
    // Get counts from Supabase tables (tolerant for missing tables)
    let variantsCount = 0, brandsCount = 0, suppliersCount = 0, exclusionsCount = 0;
    try {
      const r = await db.executeQuery('SELECT COUNT(*) AS c FROM variant_lookup');
      variantsCount = r.rows?.[0]?.c || 0;
    } catch (err) {
      console.warn('variant_lookup count failed:', err.message);
    }
    try {
      const r = await db.executeQuery('SELECT COUNT(*) AS c FROM brands');
      brandsCount = r.rows?.[0]?.c || 0;
    } catch (err) {
      console.warn('brands count failed:', err.message);
    }
    try {
      const r = await db.executeQuery('SELECT COUNT(*) AS c FROM suppliers');
      suppliersCount = r.rows?.[0]?.c || 0;
    } catch (err) {
      console.warn('suppliers count failed:', err.message);
    }
    try {
      const r = await db.executeQuery('SELECT COUNT(*) AS c FROM exclusions');
      exclusionsCount = r.rows?.[0]?.c || 0;
    } catch (err) {
      console.warn('exclusions count failed:', err.message);
    }

    // Live Lightspeed counts (preferred for dashboard)
    let lsProductsCount = null;
    let lsVariantsCount = null;
    try {
      let settings = {};
      if (fs.existsSync(SETTINGS_PATH)) {
        settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      }
      const { apiKey, apiSecret } = settings;
      if (apiKey && apiSecret) {
        const lang = 'nl';
        const base = `https://api.webshopapp.com/${lang}`;
        const getCount = async (path) => {
          try {
            const res = await axios.get(`${base}/${path}/count.json`, {
              auth: { username: apiKey, password: apiSecret },
              headers: { 'Accept': 'application/json' }
            });
            return res.data?.count ?? null;
          } catch (err) {
            console.warn(`LS count failed for ${path}:`, err.message);
            return null;
          }
        };
        lsProductsCount = await getCount('products');
        lsVariantsCount = await getCount('variants');
      }
    } catch (err) {
      console.warn('Live LS counts error:', err.message);
    }

    // Fallback products count - derive from variants if LS counts not available
    const productsCount = lsProductsCount ?? variantsCount;

    // Get last import run
    let lastRun = null;
    try {
      const lastRunResult = await db.executeQuery('SELECT * FROM import_runs ORDER BY id DESC LIMIT 1');
      lastRun = lastRunResult.rows?.[0] || null;
    } catch (err) {
      console.warn('lastRun query failed:', err.message);
      lastRun = null;
    }

    // Get last errors
    let lastErrors = [];
    try {
      const lastErrorsResult = await db.executeQuery('SELECT * FROM import_items WHERE status = ? ORDER BY id DESC LIMIT 10', ['fail']);
      lastErrors = lastErrorsResult.rows || [];
    } catch (err) {
      console.warn('lastErrors query failed:', err.message);
      lastErrors = [];
    }

    // Get last import details (alleen laatste run)
    let lastImportDetails = null;
    if (lastRun && lastRun.id) {
      const { data: importItems, error: itemsErr } = await db
        .from('import_items')
        .select('*')
        .eq('run_id', lastRun.id)
        .order('id', { ascending: false })
        .limit(200);

      let lastItems = importItems || [];
      if (itemsErr) {
        // fallback op executeQuery indien nodig
        const importItemsResult = await db.executeQuery('SELECT * FROM import_items WHERE run_id = ? ORDER BY id DESC LIMIT 200', [lastRun.id]);
        lastItems = importItemsResult.rows || [];
      }

      lastImportDetails = {
        created: lastItems.filter(item => item.op === 'create' && item.status === 'ok'),
        updated: lastItems.filter(item => item.op === 'update' && item.status === 'ok'),
        failed: lastItems.filter(item => item.status === 'fail')
      };
    }
    
    const counts = {
      variants: lsVariantsCount ?? variantsCount,
      brands: brandsCount,
      suppliers: suppliersCount,
      exclusions: exclusionsCount,
      products: productsCount
    };

    // recent runs
    let recentRuns = [];
    try {
      const resp = await axios.get('http://localhost:4000/api/import-runs/recent?limit=3');
      recentRuns = resp.data?.runs || [];
    } catch (_) {}

    console.log('✅ Dashboard data retrieved successfully:', counts);
    res.json({ counts, lastRun, lastErrors, lastImportDetails, recentRuns });
  } catch (e) {
    console.error('Dashboard overview error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Convenience GET endpoint for triggering a rebuild from the browser
app.get('/api/lookup/rebuild', async (req, res) => {
  try {
    let settings = {};
    if (fs.existsSync(SETTINGS_PATH)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
    const { apiKey, apiSecret } = settings;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'API credentials missing' });
    }
    const totals = await rebuildLookup({ apiKey, apiSecret });
    res.json({ status: 'ok', totals });
  } catch (e) {
    console.error('❌ Fout bij rebuild lookup (GET):', e);
    res.status(500).json({ error: e.message });
  }
});

// Zorg dat benodigde tabellen bestaan
(function ensureLookupTables() {
  try {
    const db = getSupabaseDatabase();
    db.run(
      'CREATE TABLE IF NOT EXISTS image_fingerprints (sku TEXT, product_id INTEGER, url TEXT, etag TEXT, last_modified TEXT, content_length INTEGER, sha256 TEXT, checked_at TEXT, PRIMARY KEY (sku, url))'
    );
    db.run('CREATE TABLE IF NOT EXISTS variant_lookup (sku TEXT PRIMARY KEY, product_id INTEGER, variant_id INTEGER)');
    db.run('CREATE TABLE IF NOT EXISTS brands (id INTEGER PRIMARY KEY, name TEXT)');
    db.run('CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY, name TEXT)');
    db.run('CREATE TABLE IF NOT EXISTS exclusions (sku TEXT PRIMARY KEY, reason TEXT, created_at TEXT)');
    db.run('CREATE TABLE IF NOT EXISTS import_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT, finished_at TEXT, created INTEGER DEFAULT 0, updated INTEGER DEFAULT 0, failed INTEGER DEFAULT 0, duration_ms INTEGER DEFAULT 0, triggered_by TEXT)');
    db.run('CREATE TABLE IF NOT EXISTS import_items (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER, sku TEXT, op TEXT, status TEXT, message TEXT, created_at TEXT)');
  } catch (e) {
    console.warn('Kon image_fingerprints tabel niet aanmaken:', e.message);
  }
})();

// In-memory opslag voor demo (vervang later door echte opslag)
let lastCsvData = [];

// Endpoint om producten uit de laatste CSV op te halen
app.get('/api/products', (req, res) => {
  res.json({ products: lastCsvData });
});

// Hulp: saniteer image URL uit CSV (verwijder @, quotes, whitespace)
function sanitizeImageUrl(raw) {
  if (!raw) return '';
  let url = String(raw).trim();
  if (url.startsWith('@')) url = url.slice(1);
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1);
  }
  return url.trim();
}

// Helper function to compare arrays
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, index) => val === sortedB[index]);
}

// Extract filename from URL
const getFilename = (url) => {
  try {
    return url.split('/').pop().split('?')[0].toLowerCase();
  } catch {
    return url.toLowerCase();
  }
};

// Database-gebaseerde image tracking met complete replacement
async function syncProductImages(productId, imageUrls, apiKey, apiSecret, skuForFingerprint = null) {
  try {
    const distinctUrls = Array.from(
      new Set(
        (imageUrls || [])
          .map((u) => sanitizeImageUrl(u))
          .filter((u) => typeof u === 'string' && u.length > 0 && /^https?:\/\//i.test(u))
      )
    );
    if (distinctUrls.length === 0) {
      return;
    }
    
    console.log(`🖼️ PIM afbeeldingen om te verwerken: ${distinctUrls.length}`);
    console.log('🖼️ PIM afbeelding URLs:', distinctUrls);

    const db = getSupabaseDatabase();
    
    // Get current tracked images from database
    const { data: trackedImages, error: trackingError } = await db.from('image_tracking').select('*').eq('sku', skuForFingerprint || '');
    if (trackingError) {
      console.error('Error fetching tracked images:', trackingError);
      return;
    }

    // Get current filenames from PIM
    const currentPimFilenames = new Set(distinctUrls.map(url => getFilename(url)));
    
    // Get tracked filenames from database
    const trackedFilenames = new Set(trackedImages.map(img => img.pim_filename));
    
    console.log('📊 Database tracking:');
    console.log(`  - Tracked images: ${trackedImages.length}`);
    console.log(`  - Current PIM filenames: ${Array.from(currentPimFilenames).join(', ')}`);
    console.log(`  - Tracked filenames: ${Array.from(trackedFilenames).join(', ')}`);
    
    // Check if images have changed (different filenames)
    const imagesChanged = !arraysEqual(Array.from(currentPimFilenames), Array.from(trackedFilenames));
    
    if (!imagesChanged && trackedImages.length > 0) {
      console.log('✅ Afbeeldingen zijn niet gewijzigd, geen update nodig');
      return;
    }
    
    console.log('🔄 Afbeeldingen zijn gewijzigd, volledige vervanging uitvoeren...');
    
    // Step 1: Delete all existing images in Lightspeed
    let existingImages = [];
    try {
      const existingRes = await axios.get(
        `https://api.webshopapp.com/nl/products/${productId}/images.json`,
        {
          auth: { username: apiKey, password: apiSecret },
          headers: { Accept: 'application/json' }
        }
      );
      existingImages = (existingRes.data && (existingRes.data.productImages || existingRes.data.images || existingRes.data.data || existingRes.data)) || [];
      console.log(`🗑️ Bestaande afbeeldingen gevonden voor verwijdering: ${existingImages.length}`);
    } catch (err) {
      console.warn('⚠️ Kon bestaande afbeeldingen niet ophalen:', err.response?.data || err.message);
    }

    // Delete existing images
    for (const img of existingImages) {
      const imageId = img.id || img.imageId;
      if (imageId) {
        try {
          await axios.delete(
            `https://api.webshopapp.com/nl/products/${productId}/images/${imageId}.json`,
            {
              auth: { username: apiKey, password: apiSecret }
            }
          );
          console.log(`🗑️ Afbeelding verwijderd: ${imageId}`);
        } catch (err) {
          console.warn(`⚠️ Kon afbeelding ${imageId} niet verwijderen:`, err.response?.data || err.message);
        }
      }
    }

    // Step 2: Clear database tracking for this SKU
    await db.from('image_tracking').delete().eq('sku', skuForFingerprint || '');
    console.log(`🗑️ Database tracking gewist voor SKU: ${skuForFingerprint}`);

    // Step 3: Upload all new images and track them
    let uploadedCount = 0;
    let skippedCount = 0;

    for (const url of distinctUrls) {
      try {
        // Download image
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000, maxRedirects: 5 });
        const downloadedBuffer = Buffer.from(resp.data);
        
        const filename = getFilename(url);
        const base64 = downloadedBuffer.toString('base64');

        // Upload to Lightspeed
        try {
          const uploadResponse = await axios.post(
            `https://api.webshopapp.com/nl/products/${productId}/images.json`,
            { productImage: { attachment: base64, filename } },
            {
              auth: { username: apiKey, password: apiSecret },
              headers: { 'Content-Type': 'application/json' }
            }
          );
          
          const lightspeedImage = uploadResponse.data.productImage || uploadResponse.data;
          console.log(`✅ Afbeelding geüpload: ${filename}`);
          
          // Track in database
          await db.from('image_tracking').insert({
            sku: skuForFingerprint || '',
            product_id: productId,
            pim_image_url: url,
            pim_filename: filename,
            lightspeed_image_url: lightspeedImage.src || lightspeedImage.url,
            lightspeed_image_id: lightspeedImage.id
          });
          
          uploadedCount++;
        } catch (postErr) {
          console.error('❌ Afbeelding upload mislukt:', url, postErr.response?.data || postErr.message);
          skippedCount++;
        }
      } catch (downloadErr) {
        console.error('❌ Afbeelding download mislukt:', url, downloadErr.message);
        skippedCount++;
      }
    }
    
    console.log(`📊 Afbeelding sync voltooid: ${uploadedCount} geüpload, ${skippedCount} overgeslagen`);
  } catch (e) {
    console.error('❌ syncProductImages fout:', e.message);
  }
}

// Helper: resolve product/variant by SKU using lookup, fallback to LS API; upsert into lookup when found
async function resolveSku(db, sku, apiKey, apiSecret) {
  try {
    // Zoek eerst in Supabase lookup
    const { data: rows, error } = await db.from('variant_lookup').select('product_id, variant_id').eq('sku', sku);
    if (error) {
      console.error('Supabase error in resolveSku:', error);
      return null;
    }
    
    const row = rows && rows[0];
      if (row && row.product_id) {
      return { productId: row.product_id, variantId: row.variant_id || null, source: 'lookup' };
      }
    
      // Fallback: query Lightspeed API by SKU
      try {
        const resp = await axios.get(`https://api.webshopapp.com/en/variants.json?sku=${encodeURIComponent(sku)}`,
          { auth: { username: apiKey, password: apiSecret }, headers: { Accept: 'application/json' } });
        const variants = resp.data && (resp.data.variants || resp.data.data) || [];
        if (variants && variants.length > 0) {
          const v = variants[0];
          const productId = v?.product?.resource?.id || v?.product?.id || v?.product_id;
          const variantId = v?.id || null;
          if (productId) {
          // Insert into Supabase lookup
          await db.from('variant_lookup').upsert({
            sku: sku,
            product_id: productId,
            variant_id: variantId
          });
          return { productId, variantId, source: 'api' };
          }
        }
      } catch (_) {}
    return null;
  } catch (error) {
    console.error('Error in resolveSku:', error);
    return null;
  }
}

// Endpoint om CSV te uploaden en in memory op te slaan (voor demo)
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv({ separator: ';' }))
    .on('data', (data) => results.push(data))
    .on('end', () => {
      fs.unlinkSync(req.file.path);
      lastCsvData = results;
      res.json({ data: results });
    });
});

// Haal Lightspeed productvelden op (inclusief variant-velden zoals SKU/EAN)
app.get('/api/lightspeed/fields', async (req, res) => {
  console.log('==> /api/lightspeed/fields endpoint aangeroepen (multi-lang + variants)');
  // Haal credentials uit Supabase, met fallback naar settings.json
  let fileSettings = {};
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      fileSettings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) || {};
    }
  } catch (_) {}
  let dbSettings = {};
  try {
    const settingsSvc = getSupabaseSettings();
    dbSettings = await settingsSvc.getAll();
  } catch (_) {}
  const merged = { ...fileSettings, ...dbSettings };
  const { apiKey, apiSecret } = merged;
  if (!apiKey || !apiSecret) {
    console.log('API credentials missing');
    return res.status(400).json({ error: 'API credentials missing' });
  }
  const LANGS = [
    { code: 'nl', label: 'NL' },
    { code: 'en', label: 'EN' },
    { code: 'de', label: 'DE' }
  ];
  try {
    let allFields = [];
    
    // Haal eerst een product op om product-velden te krijgen
    const productUrl = `https://api.webshopapp.com/nl/products.json?limit=1`;
    const productResponse = await axios.get(productUrl, {
      auth: { username: apiKey, password: apiSecret },
      headers: { 'Accept': 'application/json' }
    });
    
    const products = productResponse.data && productResponse.data.products ? productResponse.data.products : [];
    if (!products.length) {
      console.log('Geen producten gevonden in Lightspeed');
      return res.status(404).json({ error: 'Geen producten gevonden' });
    }
    
    const product = products[0];
    console.log('Product ID voor variant lookup:', product.id);
    
    // Haal varianten op voor dit product
    const variantsUrl = `https://api.webshopapp.com/nl/variants.json?product=${product.id}`;
    const variantsResponse = await axios.get(variantsUrl, {
      auth: { username: apiKey, password: apiSecret },
      headers: { 'Accept': 'application/json' }
    });
    
    const variants = variantsResponse.data && variantsResponse.data.variants ? variantsResponse.data.variants : [];
    console.log('Aantal varianten gevonden:', variants.length);
    
    if (variants.length > 0) {
      const variant = variants[0];
      console.log('Variant data:', JSON.stringify(variant, null, 2));
      
      // Functie om velden uit object te extraheren
      function extractFields(obj, prefix = '') {
        let fields = [];
        for (const key in obj) {
          if (!obj.hasOwnProperty(key)) continue;
          const value = obj[key];
          const path = prefix ? `${prefix}.${key}` : key;
          if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) {
            fields = fields.concat(extractFields(value, path));
          } else {
            fields.push(path);
          }
        }
        return fields;
      }
      
      // Voeg product-velden toe (voor alle talen)
      for (const lang of LANGS) {
        const langProductUrl = `https://api.webshopapp.com/nl/products/${products[0].id}.json?language=${lang.code}`;
        try {
          const langResponse = await axios.get(langProductUrl, {
            auth: { username: apiKey, password: apiSecret },
            headers: { 'Accept': 'application/json' }
          });
          const langProduct = langResponse.data && langResponse.data.product ? langResponse.data.product : products[0];
          console.log(`Product velden (${lang.label}):`, JSON.stringify(langProduct, null, 2));
          
          const productFieldNames = extractFields(langProduct);
          console.log(`Extracted product veldnamen (${lang.label}):`, productFieldNames);
          
          // Voeg product-velden toe met prefix "product."
          allFields = allFields.concat(productFieldNames.map(f => ({ 
            key: `product.${f} (${lang.label})`, 
            label: `Product: ${f} (${lang.label})`, 
            type: 'text', 
            lang: lang.code,
            category: 'product'
          })));
        } catch (langError) {
          console.log(`Fout bij ophalen product velden voor ${lang.label}:`, langError.message);
        }
      }
      
      // Voeg variant-velden toe (voor alle talen)
      for (const lang of LANGS) {
        const langVariantUrl = `https://api.webshopapp.com/nl/variants/${variant.id}.json?language=${lang.code}`;
        try {
          const langVariantResponse = await axios.get(langVariantUrl, {
            auth: { username: apiKey, password: apiSecret },
            headers: { 'Accept': 'application/json' }
          });
          const langVariant = langVariantResponse.data && langVariantResponse.data.variant ? langVariantResponse.data.variant : variant;
          console.log(`Variant velden (${lang.label}):`, JSON.stringify(langVariant, null, 2));
          
          const variantFieldNames = extractFields(langVariant);
          console.log(`Extracted variant veldnamen (${lang.label}):`, variantFieldNames);
          
          // Voeg variant-velden toe met prefix "variant."
          allFields = allFields.concat(variantFieldNames.map(f => ({ 
            key: `variant.${f} (${lang.label})`, 
            label: `Variant: ${f} (${lang.label})`, 
            type: 'text', 
            lang: lang.code,
            category: 'variant'
          })));
        } catch (langError) {
          console.log(`Fout bij ophalen variant velden voor ${lang.label}:`, langError.message);
        }
      }
    } else {
      console.log('Geen varianten gevonden, alleen product-velden toevoegen');
      // Fallback: alleen product-velden
      for (const lang of LANGS) {
        const langProductUrl = `https://api.webshopapp.com/nl/products/${product.id}.json?language=${lang.code}`;
        try {
          const langResponse = await axios.get(langProductUrl, {
            auth: { username: apiKey, password: apiSecret },
            headers: { 'Accept': 'application/json' }
          });
          const langProduct = langResponse.data && langResponse.data.product ? langResponse.data.product : product;
          
          function extractFields(obj, prefix = '') {
            let fields = [];
            for (const key in obj) {
              if (!obj.hasOwnProperty(key)) continue;
              const value = obj[key];
              const path = prefix ? `${prefix}.${key}` : key;
              if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) {
                fields = fields.concat(extractFields(value, path));
              } else {
                fields.push(path);
              }
            }
            return fields;
          }
          
          const productFieldNames = extractFields(langProduct);
          allFields = allFields.concat(productFieldNames.map(f => ({ 
            key: `product.${f} (${lang.label})`, 
            label: `Product: ${f} (${lang.label})`, 
            type: 'text', 
            lang: lang.code,
            category: 'product'
          })));
        } catch (langError) {
          console.log(`Fout bij ophalen product velden voor ${lang.label}:`, langError.message);
        }
      }
    }
    
    // Uniek maken op key
    const uniqueFields = Array.from(new Map(allFields.map(f => [f.key, f])).values());
    console.log('Totaal aantal unieke velden:', uniqueFields.length);
    res.json({ fields: uniqueFields });
  } catch (e) {
    console.error('Fout in /api/lightspeed/fields:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Placeholder: mapping opslaan
app.post('/api/mapping', (req, res) => {
  // TODO: mapping opslaan
  res.json({ status: 'saved' });
});

// Placeholder: producten checken/importeren
app.post('/api/products/check', (req, res) => {
  // TODO: check of product bestaat
  res.json({ exists: false });
});

// Endpoint om een product te importeren naar Lightspeed
app.post('/api/products/import', async (req, res) => {
  const { product, differences, lightspeedData } = req.body;
  
  console.log(`🚀 Starting import for product SKU: ${product.SKU || product.sku}`);
  console.log('📥 Received data:', {
    product: product ? 'Present' : 'Missing',
    differences: differences ? Object.keys(differences).length + ' differences' : 'No differences',
    lightspeedData: lightspeedData ? {
      variant: lightspeedData.variant ? `ID ${lightspeedData.variant.id}` : 'Missing',
      product: lightspeedData.product ? `ID ${lightspeedData.product.id}` : 'Missing'
    } : 'Missing'
  });
  
  // Haal settings op
  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  }
  const { apiKey, apiSecret, mapping } = settings;
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'API credentials missing' });
  }
  
  // Controleer of we bestaande Lightspeed data hebben
  if (!lightspeedData || !lightspeedData.product || !lightspeedData.variant) {
    return res.status(400).json({ error: 'Lightspeed product and variant data required for import' });
  }
  
  let runId = null;
  try {
    // Start logging run for update
    try {
      const start = await axios.post('http://localhost:4000/api/import-runs/start', { triggeredBy: 'ui-update' });
      runId = start.data?.runId || null;
    } catch (_) {}
    const { variant, product: lsProduct } = lightspeedData;
    
    if (!variant || !lsProduct) {
      return res.status(400).json({ error: 'Lightspeed product/variant data missing' });
    }
    
    console.log('Differences ontvangen:', JSON.stringify(differences, null, 2));
    
    console.log(`📝 Updating variant ${variant.id} and product ${lsProduct.id}`);
    
    // Bereid variant updates voor
    const variantUpdates = {};
    const productUpdates = {};
    
    // Verwerk verschillen en bepaal wat geüpdatet moet worden
    const multiLangUpdates = {};
    Object.entries(differences).forEach(([lsKey, diffData]) => {
      const { pim: pimValue, field: lsField } = diffData;
      if (lsField.startsWith('Variant: ')) {
        const cleanKey = lsField.replace('Variant: ', '').replace(/ \(.*\)$/, '');
        variantUpdates[cleanKey] = pimValue;
      } else if (lsField.startsWith('Product: ')) {
        const cleanKey = lsField.replace('Product: ', '').replace(/ \(.*\)$/, '');
        const langMatch = lsField.match(/\((\w{2})\)$/);
        // Verzamel multi-language velden
        if (['fulltitle', 'content', 'description', 'title'].includes(cleanKey) && langMatch) {
          const lang = langMatch[1].toLowerCase();
          if (!multiLangUpdates[cleanKey]) multiLangUpdates[cleanKey] = {};
          multiLangUpdates[cleanKey][lang] = pimValue;
                  } else {
            // Speciale behandeling voor images
            if (cleanKey === 'images.resource.url') {
              const imageUrls = pimValue.split(',').map(url => url.trim()).filter(url => url);
              if (imageUrls.length > 0) {
                // Eerste afbeelding als hoofdafbeelding
                productUpdates.image = { src: imageUrls[0] };
                // Alle afbeeldingen als images array
                productUpdates.images = imageUrls.map(url => ({ src: url }));
                console.log(`🖼️ Images configured for update: ${imageUrls.length} image(s)`);
              }
            } else if (cleanKey === 'brand.title' || cleanKey === 'brand' || cleanKey === 'Brand') {
              // Brand wordt later verwerkt met ID lookup
              productUpdates.brandTitle = pimValue;
            } else if (cleanKey === 'supplier.title' || cleanKey === 'supplier' || cleanKey === 'Supplier') {
              // Supplier wordt later verwerkt met ID lookup
              productUpdates.supplierTitle = pimValue;
            } else {
              productUpdates[cleanKey] = pimValue;
            }
          }
      }
    });
    // Voeg multi-language velden toe aan productUpdates
    Object.entries(multiLangUpdates).forEach(([key, value]) => {
      productUpdates[key] = value;
    });
    
    console.log('📦 Variant updates:', JSON.stringify(variantUpdates, null, 2));
    console.log('📦 Product updates:', JSON.stringify(productUpdates, null, 2));
    
    // Update variant als er wijzigingen zijn
    if (Object.keys(variantUpdates).length > 0) {
      console.log(`🔄 Updating variant ${variant.id} with data:`, variantUpdates);
      try {
        const variantResponse = await axios.put(
          `https://api.webshopapp.com/nl/variants/${variant.id}.json`,
          { variant: variantUpdates },
          {
            auth: { username: apiKey, password: apiSecret },
            headers: { 'Content-Type': 'application/json' }
          }
        );
        console.log('✅ Variant updated successfully:', variantResponse.status);
        try { if (runId) await axios.post(`http://localhost:4000/api/import-runs/${runId}/item`, { sku: product.SKU || product.sku, op: 'update', status: 'ok', message: '' }); } catch (_) {}
      } catch (variantError) {
        console.error('❌ Variant update failed:', variantError.response?.data || variantError.message);
        throw new Error(`Variant update failed: ${variantError.response?.data?.message || variantError.message}`);
      }
    } else {
      console.log('ℹ️ No variant updates needed');
    }
    
    // Verzamel per taal de gewijzigde productvelden
    const langUpdates = { nl: {}, de: {}, en: {} };
    Object.entries(differences).forEach(([lsKey, diffData]) => {
      const { pim: pimValue, field: lsField } = diffData;
      
      // Zorg ervoor dat pimValue altijd een string is
      let stringValue = pimValue;
      if (typeof pimValue === 'object' && pimValue !== null) {
        // Als het een object is, probeer de juiste taal te vinden
        const langMatch = lsField.match(/\((\w{2})\)$/);
        if (langMatch) {
          const lang = langMatch[1].toLowerCase();
          stringValue = pimValue[lang] || pimValue[lang.toUpperCase()] || Object.values(pimValue)[0] || '';
        } else {
          // Geen specifieke taal, neem eerste waarde
          stringValue = Object.values(pimValue)[0] || '';
        }
        // Zorg ervoor dat het een string wordt
        stringValue = String(stringValue);
      } else {
        stringValue = String(pimValue || '');
      }
      
      if (lsField.startsWith('Variant: ')) {
        const cleanKey = lsField.replace('Variant: ', '').replace(/ \(.*\)$/, '');
        variantUpdates[cleanKey] = stringValue;
      } else if (lsField.startsWith('Product: ')) {
        const cleanKey = lsField.replace('Product: ', '').replace(/ \(.*\)$/, '');
        const langMatch = lsField.match(/\((\w{2})\)$/);
        if (langMatch) {
          const lang = langMatch[1].toLowerCase();
          if (langUpdates[lang]) {
            langUpdates[lang][cleanKey] = stringValue; // altijd string!
          }
        } else {
          productUpdates[cleanKey] = stringValue;
        }
      }
    });
    // Update product per taal
    const langMap = { nl: 'nl', de: 'de', en: 'en' };
    for (const lang of Object.keys(langUpdates)) {
      const fields = langUpdates[lang];
      // Filter alleen niet-lege waarden
      const nonEmptyFields = {};
      Object.entries(fields).forEach(([key, value]) => {
        if (value && value !== '' && value !== null && value !== undefined) {
          nonEmptyFields[key] = value;
        }
      });
      
      if (Object.keys(nonEmptyFields).length > 0) {
        const url = `https://api.webshopapp.com/${langMap[lang]}/products/${lsProduct.id}.json`;
        console.log(`🔄 [${lang}] URL: ${url}`);
        console.log(`🔄 [${lang}] Payload:`, JSON.stringify(nonEmptyFields));
        try {
          const resp = await axios.put(
            url,
            { product: nonEmptyFields },
            {
              auth: { username: apiKey, password: apiSecret },
              headers: { 'Content-Type': 'application/json' }
            }
          );
          console.log(`✅ [${lang}] Product updated. Status:`, resp.status);
        } catch (err) {
          console.error(`❌ [${lang}] Error:`, err.response?.data || err.message);
        }
      } else {
        console.log(`⏩ [${lang}] Geen velden om te updaten, sla PUT over.`);
      }
    }
    // Update product zonder taalsuffix (alleen velden die niet per taal zijn)
    // Filter alleen velden die niet al per taal zijn geüpdatet
    const nonLangFields = {};
    
    // Brand en supplier ID lookup
    let brandId = null;
    let supplierId = null;
    
    // Probeer brand uit productUpdates
    if (productUpdates.brandTitle) {
      // Gebruik Supabase database voor brand lookup
      const db = getSupabaseDatabase();
      brandId = await new Promise((resolve, reject) => {
        if (!productUpdates.brandTitle) return resolve(null);
        db.get('SELECT id FROM brands WHERE name = ? COLLATE NOCASE', [productUpdates.brandTitle], (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.id : null);
        });
      });
      console.log(`🏷️ Brand lookup: "${productUpdates.brandTitle}" → ID: ${brandId}`);
    }
    
    // Probeer supplier uit productUpdates
    if (productUpdates.supplierTitle) {
      // Gebruik Supabase database voor supplier lookup
      const db = getSupabaseDatabase();
      supplierId = await new Promise((resolve, reject) => {
        if (!productUpdates.supplierTitle) return resolve(null);
        db.get('SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE', [productUpdates.supplierTitle], (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.id : null);
        });
      });
      console.log(`🏢 Supplier lookup: "${productUpdates.supplierTitle}" → ID: ${supplierId}`);
    }
    
    // Als brand/supplier niet via differences zijn gevonden, probeer direct uit PIM data
    if (!brandId && product.Brand) {
      const db = getSupabaseDatabase();
      brandId = await new Promise((resolve, reject) => {
        db.get('SELECT id FROM brands WHERE name = ? COLLATE NOCASE', [product.Brand], (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.id : null);
        });
      });
      console.log(`🏷️ Direct brand lookup: "${product.Brand}" → ID: ${brandId}`);
    }
    
    if (!supplierId && product.Supplier) {
      const db = getSupabaseDatabase();
      supplierId = await new Promise((resolve, reject) => {
        db.get('SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE', [product.Supplier], (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.id : null);
        });
      });
      console.log(`🏢 Direct supplier lookup: "${product.Supplier}" → ID: ${supplierId}`);
    }
    
    console.log(`🔍 Debug: productUpdates keys:`, Object.keys(productUpdates));
    Object.entries(productUpdates).forEach(([key, value]) => {
      // Skip velden die al per taal zijn geüpdatet
      const isLangField = ['title', 'fulltitle', 'description', 'content'].includes(key);
      if (!isLangField && value && value !== '') {
        // Skip brandTitle, supplierTitle en brand.title, supplier.title - die worden apart verwerkt
        if (key !== 'brandTitle' && key !== 'supplierTitle' && key !== 'brand.title' && key !== 'supplier.title') {
          nonLangFields[key] = value;
          console.log(`✅ Added ${key} to nonLangFields`);
        } else {
          console.log(`🚫 Skipping ${key} field - wordt apart verwerkt`);
        }
      } else {
        console.log(`⏩ Skipping ${key} (lang field or empty)`);
      }
    });
    console.log(`🔍 Debug: nonLangFields after filtering:`, Object.keys(nonLangFields));
    
    // Voeg brand en supplier toe als ze gevonden zijn
    if (brandId) {
      nonLangFields.brand = brandId;
      console.log(`🏷️ Brand ID ${brandId} toegevoegd aan product update`);
    }
    if (supplierId) {
      nonLangFields.supplier = supplierId;
      console.log(`🏢 Supplier ID ${supplierId} toegevoegd aan product update`);
    }
    
    // Zorg ervoor dat product altijd zichtbaar is
    nonLangFields.visibility = "visible";
    console.log(`👁️ Visibility toegevoegd aan product update`);
    
    // Voeg images toe als ze bestaan
    if (productUpdates.image) {
      nonLangFields.image = productUpdates.image;
      console.log(`🖼️ Image toegevoegd aan product update`);
    }
    if (productUpdates.images) {
      nonLangFields.images = productUpdates.images;
      console.log(`🖼️ ${productUpdates.images.length} images toegevoegd aan product update`);
    }
    
    // Zorg ervoor dat we altijd een update doen voor visibility, brand en supplier
    // Zelfs als er geen andere velden zijn, moet visibility altijd worden bijgewerkt
    if (Object.keys(nonLangFields).length > 0) {
      console.log(`🔄 Updating product ${lsProduct.id} with non-language fields:`, JSON.stringify(nonLangFields, null, 2));
      try {
        const productResponse = await axios.put(
          `https://api.webshopapp.com/nl/products/${lsProduct.id}.json`,
          { product: nonLangFields },
          {
            auth: { username: apiKey, password: apiSecret },
            headers: { 'Content-Type': 'application/json' }
          }
        );
        console.log('✅ Product updated successfully:', productResponse.status);
        try { if (runId) await axios.post(`http://localhost:4000/api/import-runs/${runId}/item`, { sku: product.SKU || product.sku, op: 'update', status: 'ok', message: '' }); } catch (_) {}
      } catch (productError) {
        console.error('❌ Product update failed:', productError.response?.data || productError.message);
        throw new Error(`Product update failed: ${productError.response?.data?.message || productError.message}`);
      }
    }
    
    // Altijd een aparte visibility update forceren om er zeker van te zijn dat het werkt
    console.log(`🔄 Forcing separate visibility update for product ${lsProduct.id}`);
    try {
      const visibilityResponse = await axios.put(
        `https://api.webshopapp.com/nl/products/${lsProduct.id}.json`,
        { product: { visibility: "visible" } },
        {
          auth: { username: apiKey, password: apiSecret },
          headers: { 'Content-Type': 'application/json' }
        }
      );
      console.log('✅ Separate visibility update successful:', visibilityResponse.status);
    } catch (visibilityError) {
      console.error('❌ Separate visibility update failed:', visibilityError.response?.data || visibilityError.message);
      // Dit is geen fatale fout, dus we gooien geen error
    }

    // Probeer afbeeldingen via dedicated endpoint toe te voegen als er image-urls zijn gemapt
    try {
      const mappedImageField = Object.entries(differences || {}).length === 0 ? null : null; // placeholder zodat linter niet klaagt
      const possibleUrls = [];
      if (productUpdates && productUpdates.images) {
        for (const obj of productUpdates.images) {
          if (obj && obj.src) possibleUrls.push(obj.src);
        }
      }
      if (productUpdates && productUpdates.image && productUpdates.image.src) {
        possibleUrls.push(productUpdates.image.src);
      }
      // Als er in differences alleen 'images.resource.url (NL)' stond: parse die ook hier
      try {
        const diffImg = differences && differences['images.resource.url (NL)'];
        if (diffImg && diffImg.pim) {
          const extra = String(diffImg.pim)
            .split(',')
            .map(url => sanitizeImageUrl(url))
            .filter(url => url && /^https?:\/\//i.test(url));
          for (const u of extra) if (!possibleUrls.includes(u)) possibleUrls.push(u);
        }
      } catch (_) {}
      // Extra robuustheid: haal ook afbeeldingen direct uit PIM op basis van mapping als die niet in differences zaten
      try {
        let settingsForImages = {};
        if (fs.existsSync(SETTINGS_PATH)) {
          settingsForImages = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) || {};
        }
        const mappingForImages = settingsForImages.mapping || {};
        const pimImagesField = Object.entries(mappingForImages).find(([_pimField, lsField]) =>
          typeof lsField === 'string' && lsField.toLowerCase().startsWith('product: images.resource.url')
        );
        if (pimImagesField) {
          const [pimFieldName] = pimImagesField;
          const raw = product[pimFieldName];
          if (raw && typeof raw === 'string') {
            const extraUrls = raw
              .split(',')
              .map((u) => sanitizeImageUrl(u))
              .filter((u) => u && /^https?:\/\//i.test(u));
            for (const u of extraUrls) {
              if (!possibleUrls.includes(u)) possibleUrls.push(u);
            }
          }
        }
      } catch (_) {}

      if (possibleUrls.length > 0) {
        console.log(`🖼️ Afbeeldingen gevonden voor update: ${possibleUrls.length} URLs`);
        await syncProductImages(lsProduct.id, possibleUrls, apiKey, apiSecret, product.SKU || product.sku || '');
      } else {
        console.log(`ℹ️ Geen nieuwe afbeeldingen gevonden voor update van SKU ${product.SKU || product.sku}, syncProductImages wordt overgeslagen`);
      }
    } catch (imgErr) {
      console.warn('⚠️ Fout bij synchroniseren van afbeeldingen:', imgErr.message);
    }
    
    try { if (runId) await axios.post(`http://localhost:4000/api/import-runs/${runId}/finish`); } catch (_) {}
    res.json({ 
      status: 'imported', 
      sku: product.SKU || product.sku,
      variantUpdates: Object.keys(variantUpdates),
      productUpdates: Object.keys(productUpdates)
    });
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    try { if (runId) await axios.post(`http://localhost:4000/api/import-runs/${runId}/item`, { sku: product?.SKU || product?.sku || '', op: 'update', status: 'fail', message: error.message || 'Update failed' }); } catch (_) {}
    try { if (runId) await axios.post(`http://localhost:4000/api/import-runs/${runId}/finish`); } catch (_) {}
    res.status(500).json({ 
      error: error.message,
      sku: product.SKU || product.sku 
    });
  }
});

// Endpoint om ALLEEN een nieuw product aan te maken in Lightspeed (stap 1)
app.post('/api/products/create', async (req, res) => {
  const { product, mapping: productMapping, sku, data } = req.body;
  
  // Handle different request formats
  const productData = product || data;
  const productSku = sku || productData?.SKU || productData?.sku;
  
  console.log(`🆕 Starting PRODUCT ONLY create for SKU: ${productSku}`);
  console.log('📥 Received product data:', productData);
  
  // Haal settings op
  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  }
  const { apiKey, apiSecret, mapping } = settings;
  const finalMapping = productMapping || mapping;
  
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'API credentials missing' });
  }
  
  let runId = null;
  try {
    // Start single-item run for logging
    try {
      const start = await axios.post('http://localhost:4000/api/import-runs/start', { triggeredBy: 'ui-create' });
      runId = start.data?.runId || null;
    } catch (_) {}
    const sku = productSku || productData?.Article_Code;
    if (!sku) {
      return res.status(400).json({ error: 'SKU is required for creating new products' });
    }
    // DUPLICATE GUARD: if SKU already exists in Lightspeed, skip create and return info
    const dbGuard = getSupabaseDatabase();
    const dup = await resolveSku(dbGuard, sku, apiKey, apiSecret);
    if (dup && dup.productId) {
      return res.status(409).json({ error: 'SKU already exists in Lightspeed', sku, productId: dup.productId, variantId: dup.variantId });
    }

    console.log('🔄 Starting product creation process (product only)...');
    
    // Stap 1: Verzamel alleen product data per taal
    const productDataByLang = { nl: {}, de: {}, en: {} };
    let brandId = null;
    let supplierId = null;
    
    // Gebruik Supabase database voor brand en supplier lookup
    const db = getSupabaseDatabase();
    
    // Helper functie om brand ID op te halen
    const getBrandId = (brandName) => {
      return new Promise((resolve, reject) => {
        if (!brandName) return resolve(null);
        db.get('SELECT id FROM brands WHERE name = ? COLLATE NOCASE', [brandName], (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.id : null);
        });
      });
    };
    
    // Helper functie om supplier ID op te halen
    const getSupplierId = (supplierName) => {
      return new Promise((resolve, reject) => {
        if (!supplierName) return resolve(null);
        db.get('SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE', [supplierName], (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.id : null);
        });
      });
    };
    
    // Verwerk mapping om alleen PRODUCT data te verzamelen
    for (const [pimField, lsField] of Object.entries(finalMapping)) {
      const pimValue = productData[pimField];
      if (!pimValue || !lsField) continue;
      
      // Skip variant fields - die doen we in stap 2
      if (lsField.startsWith('Variant: ')) {
        continue;
      }
      
      if (lsField.startsWith('Product: ')) {
        const cleanKey = lsField.replace('Product: ', '').replace(/ \(.*\)$/, '');
        const langMatch = lsField.match(/\((\w{2})\)$/);
        
        if (langMatch) {
          // Taal-specifiek veld
          const lang = langMatch[1].toLowerCase();
          if (productDataByLang[lang]) {
            productDataByLang[lang][cleanKey] = pimValue;
          }
          // Speciale behandeling voor images: ook als er (NL/DE/EN) staat, split en prepareer upload
          if (cleanKey === 'images.resource.url') {
            const imageUrls = String(pimValue || '')
              .split(',')
              .map(url => sanitizeImageUrl(url))
              .filter(url => url);
            if (imageUrls.length > 0) {
              // Neem de eerste als hoofdafbeelding
              productDataByLang.nl.image = { src: imageUrls[0] };
              // Voeg alle afbeeldingen toe
              productDataByLang.nl.images = imageUrls.map(url => ({ src: url }));
              console.log(`🖼️ Images configured (lang ${lang}): ${imageUrls.length} image(s)`);
            }
          }
        } else {
          // Taal-onafhankelijk veld
          if (cleanKey === 'brand.title') {
            brandId = await getBrandId(pimValue);
            console.log(`🏷️ Brand lookup: "${pimValue}" → ID: ${brandId}`);
          } else if (cleanKey === 'supplier.title') {
            supplierId = await getSupplierId(pimValue);
            console.log(`🏢 Supplier lookup: "${pimValue}" → ID: ${supplierId}`);
          } else if (cleanKey === 'images.resource.url') {
            // Speciale behandeling voor images - ondersteun meerdere URLs gescheiden door komma's
            const imageUrls = pimValue
              .split(',')
              .map(url => sanitizeImageUrl(url))
              .filter(url => url);
            if (imageUrls.length > 0) {
              // Neem de eerste afbeelding als hoofdafbeelding
              productDataByLang.nl.image = { src: imageUrls[0] };
              // Als er meerdere afbeeldingen zijn, voeg ze toe als images array
              if (imageUrls.length > 1) {
                productDataByLang.nl.images = imageUrls.map(url => ({ src: url }));
              }
              console.log(`🖼️ Images configured: ${imageUrls.length} image(s)`);
            }
          } else {
            // Andere algemene product velden
            productDataByLang.nl[cleanKey] = pimValue;
          }
        }
      }
    }
    
    
    console.log('📦 Product data per taal:', productDataByLang);
    console.log('🏷️ Brand ID:', brandId);
    console.log('🏢 Supplier ID:', supplierId);
    
    // Stap 2: Maak product aan (start met Nederlandse versie)
    const baseProductData = {
      ...productDataByLang.nl,
      isVisible: true,
      visibility: "visible",
      data01: productDataByLang.nl.data01 || '',
    };
    
    // Voeg brand en supplier toe als ze gevonden zijn
    if (brandId) {
      baseProductData.brand = { resource: { id: brandId } };
    }
    if (supplierId) {
      baseProductData.supplier = { resource: { id: supplierId } };
    }
    
    console.log('🔄 Creating product with base data:', baseProductData);
    
    let createProductResponse;
    try {
      createProductResponse = await axios.post(
        'https://api.webshopapp.com/nl/products.json',
        { product: baseProductData },
        {
          auth: { username: apiKey, password: apiSecret },
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (e) {
      // Als create faalt (bijv. door bestaande SKU), resolve product via SKU en geef 409 terug
      const dbDup = getSupabaseDatabase();
      const resolved = await resolveSku(dbDup, sku, apiKey, apiSecret);
      dbDup.close();
      if (resolved && resolved.productId) {
        console.log(`ℹ️ SKU ${sku} bestaat al in Lightspeed (Product ID: ${resolved.productId}, Variant ID: ${resolved.variantId})`);
        return res.status(409).json({ 
          error: 'SKU already exists in Lightspeed', 
          sku, 
          productId: resolved.productId, 
          variantId: resolved.variantId,
          message: 'Product bestaat al en kan worden bijgewerkt'
        });
      }
      throw e;
    }
    
    const createdProduct = createProductResponse.data.product;
    const productId = createdProduct.id;
    
    console.log(`✅ Product created with ID: ${productId}`);
    
    // Stap 3: Update product voor andere talen (DE en EN) en voeg brand/supplier toe
    const langMap = { de: 'de', en: 'en' };
    
    // Eerst brand, supplier en visibility instellen via Nederlandse update
    if (brandId || supplierId) {
      const updateData = {
        visibility: "visible" // Zorg ervoor dat product altijd zichtbaar is
      };
      if (brandId) updateData.brand = brandId;
      if (supplierId) updateData.supplier = supplierId;
      
      console.log(`🔄 Updating product ${productId} with brand/supplier/visibility:`, updateData);
      try {
        await axios.put(
          'https://api.webshopapp.com/nl/products/' + productId + '.json',
          { product: updateData },
          {
            auth: { username: apiKey, password: apiSecret },
            headers: { 'Content-Type': 'application/json' }
          }
        );
        console.log(`✅ Brand/supplier/visibility updated successfully`);
      } catch (brandSupplierError) {
        console.error(`❌ Brand/supplier/visibility update failed:`, brandSupplierError.response?.data || brandSupplierError.message);
      }
    }
    
    for (const [lang, langCode] of Object.entries(langMap)) {
      const langData = productDataByLang[lang] || {};

      // Detecteer of er in de mapping velden expliciet voor deze taal gemapt zijn
      const hasExplicitMappingForLang = Object.values(finalMapping || {}).some((lsField) => {
        if (typeof lsField !== 'string') return false;
        const m = lsField.match(/Product:\s*(title|fulltitle|description|content)\s*\((\w{2})\)/i);
        return !!(m && m[2] && m[2].toLowerCase() === lang);
      });

      // Lightspeed kopieert soms NL naar EN/DE wanneer die velden leeg zijn.
      // Om dat te voorkomen, pushen we expliciet lege strings wanneer er géén mapping is voor die taal.
      const contentKeys = ['title', 'fulltitle', 'description', 'content'];
      const finalLangData = { ...langData };
      if (!hasExplicitMappingForLang) {
        for (const key of contentKeys) {
          if (finalLangData[key] === undefined) {
            finalLangData[key] = '';
          }
        }
      }

      if (Object.keys(finalLangData).length > 0) {
        console.log(`🔄 Updating product ${productId} for language ${lang}:`, finalLangData);
        try {
          await axios.put(
            `https://api.webshopapp.com/${langCode}/products/${productId}.json`,
            { product: finalLangData },
            {
              auth: { username: apiKey, password: apiSecret },
              headers: { 'Content-Type': 'application/json' }
            }
          );
          console.log(`✅ [${lang}] Product updated successfully`);
        } catch (langError) {
          console.error(`❌ [${lang}] Product update failed:`, langError.response?.data || langError.message);
        }
      }
    }
    
    // Afbeeldingen toevoegen via dedicated images-endpoint indien aanwezig
    try {
      const urls = [];
      if (productDataByLang.nl?.image?.src) urls.push(productDataByLang.nl.image.src);
      if (Array.isArray(productDataByLang.nl?.images)) {
        for (const obj of productDataByLang.nl.images) {
          if (obj && obj.src) urls.push(obj.src);
        }
      }
      if (urls.length > 0) {
        await syncProductImages(productId, urls, apiKey, apiSecret, sku);
      }
    } catch (imgErr) {
      console.warn('⚠️ Afbeeldingen toevoegen na product-creatie mislukt:', imgErr.message);
    }

    // Stap 4: Update lookup database met SKU en product ID (nog GEEN variant ID)
    const lookupDb = getSupabaseDatabase();
    lookupDb.run(
      'INSERT OR REPLACE INTO variant_lookup (sku, product_id, variant_id) VALUES (?, ?, ?)',
      [sku, productId, null], // variant_id is nog NULL
      (err) => {
        if (err) {
          console.error('❌ Failed to update lookup database:', err);
        } else {
          console.log('✅ Lookup database updated with product ID');
        }
        // lookupDb.close(); // Removed - database wrapper handles connection management
      }
    );
    
    try {
      if (runId) await axios.post(`http://localhost:4000/api/import-runs/${runId}/item`, { sku, op: 'create', status: 'ok', message: '' });
    } catch (_) {}

    try {
      if (runId) await axios.post(`http://localhost:4000/api/import-runs/${runId}/finish`);
    } catch (_) {}
    
    res.json({
      status: 'product_created',
      sku: sku,
      productId: productId,
      brandId: brandId,
      supplierId: supplierId
    });
  } catch (error) {
    console.error('❌ Create product error:', error);
    // Log failure to run if started
    try {
      if (runId) await axios.post(`http://localhost:4000/api/import-runs/${runId}/item`, { sku: productSku || '', op: 'create', status: 'fail', message: error.message || 'Create failed' });
      if (runId) await axios.post(`http://localhost:4000/api/import-runs/${runId}/finish`);
    } catch (_) {}
    if (error.response) {
      console.error('❌ Response status:', error.response.status);
      console.error('❌ Response data:', error.response.data);
    }
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

// Endpoint om ALLEEN een variant aan te maken voor een bestaand product (stap 2)
app.post('/api/variants/create', async (req, res) => {
  const { product, mapping: productMapping } = req.body;
  
  console.log(`🆕 Starting VARIANT ONLY create for SKU: ${product.SKU || product.sku}`);
  
  // Haal settings op
  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  }
  const { apiKey, apiSecret, mapping } = settings;
  const finalMapping = productMapping || mapping;
  
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'API credentials missing' });
  }
  
  try {
    const sku = product.SKU || product.sku || product.Article_Code;
    if (!sku) {
      return res.status(400).json({ error: 'SKU is required for creating variants' });
    }
    
    console.log('🔄 Starting variant creation process...');
    
    // Stap 1: Haal product ID op uit lookup database
    const lookupDb = getSupabaseDatabase();
    
    const getProductId = () => {
      return new Promise((resolve, reject) => {
        lookupDb.get('SELECT product_id FROM variant_lookup WHERE sku = ?', [sku], (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.product_id : null);
        });
      });
    };
    
    let productId = await getProductId();
    if (!productId) {
      // Try resolve via Lightspeed API by SKU (in case lookup not yet populated)
      const resolved = await resolveSku(lookupDb, sku, apiKey, apiSecret);
      if (resolved && resolved.productId) {
        productId = resolved.productId;
      }
    }
    if (!productId) {
      // lookupDb.close(); // Removed - database wrapper handles connection management
      return res.status(400).json({ error: `Product ID not found for SKU ${sku}. Create product first.` });
    }
    
    console.log(`📦 Found product ID: ${productId} for SKU: ${sku}`);
    
    // Stap 2: Verzamel alleen variant data
    const variantData = {};
    
    // Verwerk mapping om alleen VARIANT data te verzamelen
    for (const [pimField, lsField] of Object.entries(finalMapping)) {
      const pimValue = product[pimField];
      if (!pimValue || !lsField) continue;
      
      if (lsField.startsWith('Variant: ')) {
        const cleanKey = lsField.replace('Variant: ', '').replace(/ \(.*\)$/, '');
        variantData[cleanKey] = pimValue;
      }
    }
    
    console.log('📦 Variant data:', variantData);
    
    // Stap 3: Haal bestaande variants op voor dit product (er zou al een default variant moeten zijn)
    console.log('🔍 Looking for existing variants for product:', productId);
    const existingVariantsResponse = await axios.get(
      `https://api.webshopapp.com/nl/variants.json?product=${productId}`,
      {
        auth: { username: apiKey, password: apiSecret },
        headers: { 'Accept': 'application/json' }
      }
    );
    
    const existingVariants = existingVariantsResponse.data.variants || [];
    console.log(`📊 Found ${existingVariants.length} existing variants for product ${productId}`);
    
    let variantId;
    let variantResponse;
    
    if (existingVariants.length > 0) {
      // Update de eerste (default) variant
      const existingVariant = existingVariants[0];
      variantId = existingVariant.id;
      
      console.log(`🔄 Updating existing variant ${variantId} with data`);
      
      // Bereid variant update data voor
      const variantUpdateData = {
        sku: sku,
        title: variantData.title || existingVariant.title || 'Default'
      };
      
      // Voeg alleen geldige variant velden toe
      const validVariantFields = ['priceIncl', 'priceExcl', 'priceCost', 'ean', 'weightValue', 'volumeValue', 'oldPriceIncl', 'oldPriceExcl', 'articleCode'];
      for (const field of validVariantFields) {
        if (variantData[field] !== undefined && variantData[field] !== '') {
          variantUpdateData[field] = variantData[field];
        }
      }
      
      // Automatisch articleCode synchroniseren met SKU
      if (sku) {
        variantUpdateData.articleCode = sku;
      }
      
      // Voeg units toe (gebruik PIM data of standaard waarden)
      if (variantData.weightValue) {
        variantUpdateData.weightUnit = variantData.weightUnit || 'g'; // Gebruik PIM data of standaard (g = gram)
      }
      if (variantData.volumeValue) {
        variantUpdateData.volumeUnit = variantData.volumeUnit || 'ml'; // Gebruik PIM data of standaard
      }
      
      console.log('🔄 Updating variant with data:', variantUpdateData);
      
      variantResponse = await axios.put(
        `https://api.webshopapp.com/nl/variants/${variantId}.json`,
        { variant: variantUpdateData },
        {
          auth: { username: apiKey, password: apiSecret },
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      console.log(`✅ Variant updated with ID: ${variantId}`);
    } else {
      // Fallback: maak nieuwe variant aan als er geen bestaande zijn
      console.log('⚠️ No existing variants found, creating new variant');
      
      const baseVariantData = {
        sku: sku,
        title: variantData.title || 'Default',
        product: productId
      };
      
      // Voeg alleen geldige variant velden toe
      const validVariantFields = ['priceIncl', 'priceExcl', 'priceCost', 'ean', 'weightValue', 'volumeValue', 'oldPriceIncl', 'oldPriceExcl', 'articleCode'];
      for (const field of validVariantFields) {
        if (variantData[field] !== undefined && variantData[field] !== '') {
          baseVariantData[field] = variantData[field];
        }
      }
      
      // Automatisch articleCode synchroniseren met SKU
      if (sku) {
        baseVariantData.articleCode = sku;
      }
      
      // Voeg units toe (gebruik PIM data of standaard waarden)
      if (variantData.weightValue) {
        baseVariantData.weightUnit = variantData.weightUnit || 'g'; // Gebruik PIM data of standaard (g = gram)
      }
      if (variantData.volumeValue) {
        baseVariantData.volumeUnit = variantData.volumeUnit || 'ml'; // Gebruik PIM data of standaard
      }
      
      console.log('🔄 Creating new variant with data:', baseVariantData);
      
      variantResponse = await axios.post(
        'https://api.webshopapp.com/nl/variants.json',
        { variant: baseVariantData },
        {
          auth: { username: apiKey, password: apiSecret },
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      const createdVariant = variantResponse.data.variant;
      variantId = createdVariant.id;
      console.log(`✅ New variant created with ID: ${variantId}`);
    }
    
    // Stap 4: Update lookup database met variant ID
    lookupDb.run(
      'UPDATE variant_lookup SET variant_id = ? WHERE sku = ?',
      [variantId, sku],
      (err) => {
        if (err) {
          console.error('❌ Failed to update lookup database with variant ID:', err);
        } else {
          console.log('✅ Lookup database updated with variant ID');
        }
        // lookupDb.close(); // Removed - database wrapper handles connection management
      }
    );
    
    res.json({
      status: 'variant_created',
      sku: sku,
      productId: productId,
      variantId: variantId
    });
  } catch (error) {
    console.error('❌ Create variant error:', error);
    if (error.response) {
      console.error('❌ Response status:', error.response.status);
      console.error('❌ Response data:', error.response.data);
    }
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

// Exclusions API
app.get('/api/products/exclusions', (req, res) => {
  const db = getSupabaseDatabase();
  db.all('SELECT sku, reason, created_at FROM exclusions', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ exclusions: rows || [] });
  });
});

app.post('/api/products/exclude', (req, res) => {
  const { sku, reason, remember } = req.body || {};
  if (!sku) return res.status(400).json({ error: 'sku is required' });
  if (!remember) return res.json({ status: 'excluded_ephemeral', sku });
  const db = getSupabaseDatabase();
  const createdAt = new Date().toISOString();
  db.run(
    'INSERT OR REPLACE INTO exclusions (sku, reason, created_at) VALUES (?, ?, ?)',
    [sku, reason || '', createdAt],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: 'excluded', sku, reason: reason || null, created_at: createdAt });
    }
  );
});

app.delete('/api/products/exclude/:sku', (req, res) => {
  const { sku } = req.params;
  const db = getSupabaseDatabase();
  db.run('DELETE FROM exclusions WHERE sku = ?', [sku], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'unexcluded', sku });
  });
});

// Dry-run endpoint: vergelijk csvData met mock Lightspeed data
app.post('/api/products/dryrun', (req, res) => {
  const { csvData, mapping } = req.body;
  // Mock: vergelijk alleen op SKU/EAN en geef verschil in prijs terug
  const differences = csvData.map((row, idx) => {
    // Mock bestaande LS data
    const lsProduct = { sku: row.SKU || row.sku, price: '100.00', title: row.Title_EN || row.title_en };
    const changes = {};
    if (lsProduct.sku && row.SKU && lsProduct.sku !== row.SKU) {
      changes.sku = { csv: row.SKU, ls: lsProduct.sku };
    }
    if (lsProduct.price && row.Price && lsProduct.price !== row.Price) {
      changes.price = { csv: row.Price, ls: lsProduct.price };
    }
    if (lsProduct.title && row.EN_Title_Short && lsProduct.title !== row.EN_Title_Short) {
      changes.title = { csv: row.EN_Title_Short, ls: lsProduct.title };
    }
    return { sku: row.SKU || row.sku, ean: row.EAN || row.ean, changes };
  });
  res.json({ differences });
});

// Haal CSV op van een URL en parse (met redirect support)
app.post('/api/fetch-csv-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  console.log('\n==================== BEGIN CSV FETCH ====================');
  console.log('CSV ophalen van URL:', url);

  try {
    // Gebruik axios met redirect support
    const response = await axios.get(url, {
      maxRedirects: 5, // Volg maximaal 5 redirects
      timeout: 30000, // 30 seconden timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const rawData = response.data;
    console.log('Eerste 200 chars van response:', rawData.slice(0, 200));
    
    // Check op HTML response
    if (rawData.trim().toLowerCase().startsWith('<!doctype html') || rawData.trim().toLowerCase().startsWith('<html')) {
      console.log('WAARSCHUWING: Response lijkt HTML, geen CSV!');
      console.log('==================== END CSV FETCH ====================\n');
      return res.status(400).json({ error: 'Response lijkt geen CSV, maar HTML!' });
    }

    // Parse als CSV
    const results = [];
    const Readable = require('stream').Readable;
    const s = new Readable();
    s.push(rawData);
    s.push(null);
    
    s.pipe(csv({ separator: ';' }))
      .on('data', (data) => results.push(data))
      .on('end', () => {
        console.log('Aantal CSV records:', results.length);
        console.log('==================== END CSV FETCH ====================\n');
        res.json({ data: results });
      })
      .on('error', (err) => {
        console.log('CSV parse error:', err.message);
        console.log('==================== END CSV FETCH ====================\n');
        res.status(500).json({ error: err.message });
      });

  } catch (error) {
    console.log('Request error:', error.message);
    console.log('==================== END CSV FETCH ====================\n');
    res.status(500).json({ error: error.message });
  }
});

// Haal beschikbare merken op uit CSV data
app.get('/api/brands', async (req, res) => {
  try {
    // Lees settings om CSV URL te krijgen
    let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
    
    const { importUrl } = settings;
    if (!importUrl) {
      return res.status(400).json({ error: 'No import URL configured' });
    }

    console.log('📋 Ophalen merken van CSV URL:', importUrl);

    // Haal CSV data op
    const response = await axios.get(importUrl, {
      maxRedirects: 5,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const rawData = response.data;
    
    // Parse CSV
    const results = [];
    const Readable = require('stream').Readable;
    const s = new Readable();
    s.push(rawData);
    s.push(null);
    
    s.pipe(csv({ separator: ';' }))
      .on('data', (data) => results.push(data))
      .on('end', () => {
        // Extract unieke merken uit Brand kolom
        const brands = [...new Set(
          results
            .map(row => row.Brand || row.brand || row.Merk || row.merk)
            .filter(brand => brand && brand.trim() !== '')
            .map(brand => brand.trim())
        )].sort();

        console.log(`📋 Gevonden ${brands.length} unieke merken:`, brands);
        res.json({ brands });
      })
      .on('error', (err) => {
        console.log('CSV parse error:', err.message);
        res.status(500).json({ error: err.message });
      });

  } catch (error) {
    console.log('Error fetching brands:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Haal mapping, import-URL en API keys op
app.get('/api/settings', async (req, res) => {
  try {
    const settingsSvc = getSupabaseSettings();
    const dbData = await settingsSvc.getAll();

    // Fallback/migratie: lees eventueel oude settings.json en merge ontbrekende keys
    let fileData = {};
    try {
      if (fs.existsSync(SETTINGS_PATH)) {
        fileData = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) || {};
      }
    } catch (_) {}

    // Kies per sleutel een 'betekenisvolle' waarde; lege DB-waarden overschrijven de file niet
    const pickMeaningful = (key) => {
      const dbVal = dbData[key];
      const fileVal = fileData[key];
      if (key === 'mapping') {
        if (dbVal && typeof dbVal === 'object' && Object.keys(dbVal).length > 0) return dbVal;
        if (fileVal && typeof fileVal === 'object' && Object.keys(fileVal).length > 0) return fileVal;
        return dbVal || fileVal || {};
      }
      // Strings: voorkom dat lege string de file-waarde overschrijft
      if (typeof dbVal === 'string') return dbVal.trim() !== '' ? dbVal : (fileVal || '');
      return dbVal !== undefined ? dbVal : fileVal;
    };

    const merged = {
      mapping: pickMeaningful('mapping'),
      importUrl: pickMeaningful('importUrl'),
      apiKey: pickMeaningful('apiKey'),
      apiSecret: pickMeaningful('apiSecret'),
      lastImport: pickMeaningful('lastImport')
    };

    // Migreer naar Supabase wat ontbreekt of leeg was
    const toMigrate = {};
    Object.keys(merged).forEach((k) => {
      if (dbData[k] === undefined || (k === 'mapping' && (!dbData[k] || Object.keys(dbData[k]||{}).length === 0)) || (typeof dbData[k] === 'string' && dbData[k].trim() === '')) {
        if (merged[k] !== undefined) toMigrate[k] = merged[k];
      }
    });
    if (Object.keys(toMigrate).length > 0) {
      try { await settingsSvc.setAll(toMigrate); } catch (_) {}
    }

    res.json(merged);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Test endpoint voor frontend/backend verbinding
app.get('/api/test-connection', (req, res) => {
  console.log('🧪 Backend test connection called from frontend');
  res.json({ 
    status: 'Backend is running on port 4000',
    timestamp: new Date().toISOString(),
    message: 'Frontend/Backend verbinding werkt!'
  });
});

// Sla mapping, import-URL en API keys op (merge met bestaande settings)
app.post('/api/settings', async (req, res) => {
  try {
    console.log('Ontvangen body:', req.body);
    // Sanitize only allowed keys
    const allowed = ['mapping','importUrl','apiKey','apiSecret','lastImport'];
    const sanitized = {};
    for (const k of allowed) if (Object.prototype.hasOwnProperty.call(req.body || {}, k)) sanitized[k] = req.body[k];

    const settings = getSupabaseSettings();
    const success = await settings.setAll(sanitized);
    if (success) return res.json({ status: 'saved' });
    return res.status(500).json({ error: 'Failed to save settings' });
  } catch (error) {
    console.error('Error saving settings:', error?.message || error);
    res.status(500).json({ error: error?.message || 'Failed to save settings' });
  }
});

// Haal Lightspeed product op basis van SKU of EAN (zoek eerst in varianten)
app.post('/api/lightspeed/product', async (req, res) => {
  const { sku } = req.body;
  console.log('LS Lookup: ontvangen SKU:', sku);
  console.log('LS Lookup: using Supabase database wrapper');
  if (!sku) return res.status(400).json({ error: 'SKU is required' });

  // Haal settings op
  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  }
  const { apiKey, apiSecret } = settings;
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'API credentials missing' });
  }

  // Zoek product_id en variant_id in Supabase lookup
  const db = getSupabaseDatabase();
  try {
    const { data: rows, error } = await db.from('variant_lookup').select('product_id, variant_id').eq('sku', sku);
    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Database error', details: error.message });
    }
    const row = rows && rows[0];
    console.log('LS Lookup: query result:', row);
    
    let product_id = row && row.product_id;
    let variant_id = row && row.variant_id;
    if (!product_id) {
      // Fallback: probeer via Lightspeed API op SKU te vinden en update lookup
      try {
        const resolved = await resolveSku(db, sku, apiKey, apiSecret);
        if (resolved && resolved.productId) {
          product_id = resolved.productId;
          variant_id = resolved.variantId || null;
        }
      } catch (_) {}
    }
    if (!product_id) {
      return res.status(200).json({ variant: null, product: null, isNew: true, message: 'Article not found in Lightspeed - ready for creation' });
    }
    // Haal multi-language productdata op
    const multiLangFields = ['title', 'fulltitle', 'description', 'content'];
    const LANGS = [
      { code: 'nl', key: 'nl' },
      { code: 'de', key: 'de' },
      { code: 'en', key: 'en' }
    ];
    let productMultiLang = {};
    let baseProduct = null;
    for (const lang of LANGS) {
      const detailUrl = `https://api.webshopapp.com/${lang.code}/products/${product_id}.json`;
      try {
        const detailRes = await axios.get(detailUrl, {
          auth: { username: apiKey, password: apiSecret },
          headers: { 'Accept': 'application/json' }
        });
        const prod = detailRes.data && detailRes.data.product;
        if (prod) {
          if (!baseProduct) baseProduct = prod;
          for (const field of multiLangFields) {
            if (!productMultiLang[field]) productMultiLang[field] = {};
            productMultiLang[field][lang.key] = prod[field] || '';
          }
        }
      } catch (err) {
        console.error(`[LS API] Fout bij ophalen product voor taal ${lang.code}:`, err.message);
      }
    }
    // Voeg multi-language velden toe aan baseProduct
    if (baseProduct) {
      for (const field of multiLangFields) {
        if (productMultiLang[field]) {
          baseProduct[field] = productMultiLang[field];
        }
      }
      // Voeg brandName en supplierName toe uit database
      let brandId = null;
      let supplierId = null;
      if (baseProduct.brand && baseProduct.brand.resource && baseProduct.brand.resource.id) {
        brandId = baseProduct.brand.resource.id;
      }
      if (baseProduct.supplier && baseProduct.supplier.resource && baseProduct.supplier.resource.id) {
        supplierId = baseProduct.supplier.resource.id;
      }
      // Haal brand en supplier namen op uit Supabase
      let brandName = '';
      let supplierName = '';
      
      if (brandId) {
        try {
          const { data: brandRows } = await db.from('brands').select('name').eq('id', brandId);
          brandName = brandRows && brandRows[0] ? brandRows[0].name : '';
        } catch (err) {
          console.error('Error fetching brand:', err);
        }
      }
      
          if (supplierId) {
        try {
          const { data: supplierRows } = await db.from('suppliers').select('name').eq('id', supplierId);
          supplierName = supplierRows && supplierRows[0] ? supplierRows[0].name : '';
        } catch (err) {
          console.error('Error fetching supplier:', err);
        }
      }
      
      baseProduct.brandName = brandName;
      baseProduct.supplierName = supplierName;
      
      // Voeg ook brand.title en supplier.title toe voor mapping-compatibiliteit
          if (!baseProduct.brand) baseProduct.brand = {};
      baseProduct.brand.title = brandName;
        if (!baseProduct.supplier) baseProduct.supplier = {};
      baseProduct.supplier.title = supplierName;
      
      // Roep finalize aan om variant data op te halen
      await finalize();
    } else {
      await finalize();
    }
    // Haal variantdata op
    async function finalize() {
      let variant = null;
      try {
        if (variant_id) {
          // Fetch specific variant by id
        const variantRes = await axios.get(`https://api.webshopapp.com/en/variants/${variant_id}.json`, {
          auth: { username: apiKey, password: apiSecret },
          headers: { 'Accept': 'application/json' }
        });
        variant = variantRes.data && variantRes.data.variant;
        } else if (product_id) {
          // Fallback: fetch variants by product and pick the one matching SKU (or first)
          const listRes = await axios.get(`https://api.webshopapp.com/en/variants.json?product=${product_id}`, {
            auth: { username: apiKey, password: apiSecret },
            headers: { 'Accept': 'application/json' }
          });
          const variants = (listRes.data && (listRes.data.variants || listRes.data.data)) || [];
          if (variants && variants.length > 0) {
            variant = variants.find(v => String(v.sku) === String(sku)) || variants[0];
            // Update lookup with discovered variant id
            try {
              await db.from('variant_lookup').upsert({ sku, product_id, variant_id: variant?.id || null });
            } catch (e) {
              console.error('Lookup upsert failed:', e.message || e);
            }
          }
        }
      } catch (err) {
        console.error(`[LS API] Fout bij ophalen variant:`, err.message);
      }
      return res.json({ product: baseProduct, variant });
    }
  } catch (error) {
    console.error('Error in /api/lightspeed/product:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Sync afbeeldingen per SKU met behulp van de lookup-tabel (sku -> product_id)
app.post('/api/lightspeed/images/sync-by-sku', async (req, res) => {
  try {
    const { sku, urls } = req.body || {};
    if (!sku || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'sku en urls[] zijn verplicht' });
    }

    // Haal credentials op
    let settings = {};
    if (fs.existsSync(SETTINGS_PATH)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
    const { apiKey, apiSecret } = settings;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'API credentials missing' });
    }

  // Zoek product_id in Supabase lookup
  const db = getSupabaseDatabase();
    const { data: rows, error } = await db.from('variant_lookup').select('product_id').eq('sku', sku);
    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Database error', details: error.message });
    }
    const productId = rows && rows[0] ? rows[0].product_id : null;

    if (!productId) {
      return res.status(404).json({ error: 'product_id niet gevonden voor SKU', sku });
    }

    await syncProductImages(productId, urls, apiKey, apiSecret, sku);
    res.json({ status: 'ok', productId });
  } catch (e) {
    console.error('❌ /api/lightspeed/images/sync-by-sku fout:', e);
    res.status(500).json({ error: e.message });
  }
});

// Sync afbeeldingen direct op basis van Lightspeed product ID
app.post('/api/lightspeed/images/sync-by-id', async (req, res) => {
  try {
    const { productId, urls } = req.body || {};
    if (!productId || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'productId en urls[] zijn verplicht' });
    }

    // Haal credentials op
    let settings = {};
    if (fs.existsSync(SETTINGS_PATH)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
    const { apiKey, apiSecret } = settings;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'API credentials missing' });
    }

    await syncProductImages(productId, urls, apiKey, apiSecret, null);
    res.json({ status: 'ok', productId });
  } catch (e) {
    console.error('❌ /api/lightspeed/images/sync-by-id fout:', e);
    res.status(500).json({ error: e.message });
  }
});

// Haal alle producten uit Lightspeed (id, sku, ean, title)
app.get('/api/lightspeed/products', async (req, res) => {
  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  }
  const { apiKey, apiSecret, storeId } = settings;
  if (!apiKey || !apiSecret || !storeId) {
    return res.status(400).json({ error: 'API credentials or Store ID missing' });
  }
  try {
    let all = [];
    let page = 1;
    const limit = 250;
    while (true) {
      const url = `https://api.webshopapp.com/nl/products.json?limit=${limit}&page=${page}`;
      const response = await axios.get(url, {
        auth: { username: apiKey, password: apiSecret },
        headers: { 'Accept': 'application/json' }
      });
      const products = response.data && response.data.products ? response.data.products : [];
      all = all.concat(products.map(p => ({ id: p.id, sku: p.sku, ean: p.ean, title: p.title })));
      if (products.length < limit) break;
      page++;
    }
    res.json({ products: all });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Vergelijk PIM-artikelen met Lightspeed-producten (GEBRUIK DEZELFDE LOGICA ALS VERGELIJKING PAGINA)
app.post('/api/pim-lightspeed/compare', async (req, res) => {
  console.log('==> /api/pim-lightspeed/compare endpoint aangeroepen (NIEUWE VERSIE V2)');
  console.log('NIEUWE LOGICA ACTIEF - GEBRUIKT VERGELIJKING PAGINA METHODE');
  const { articles } = req.body;
  if (!articles || !Array.isArray(articles)) {
    return res.status(400).json({ error: 'No articles provided' });
  }
  console.log(`Aantal artikelen ontvangen: ${articles.length}`);
  
  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  }
  const { apiKey, apiSecret, storeId, mapping } = settings;
  if (!apiKey || !apiSecret || !storeId) {
    return res.status(400).json({ error: 'API credentials or Store ID missing' });
  }
  
  // Helper functie (exact zoals in Vergelijking pagina)
  function getBestValue(obj) {
    if (obj && typeof obj === 'object') {
      // Voor multi-language objects, probeer Nederlandse versie eerst
      if (obj.nl || obj.NL || obj.nederlands) {
        return obj.nl || obj.NL || obj.nederlands;
      }
      // Anders probeer standaard velden
      return obj.title || obj.name || obj.value || obj.id || Object.values(obj)[0] || JSON.stringify(obj);
    }
    return obj;
  }

  try {
    // SEQUENTIEEL verwerken om rate limiting te voorkomen
    const results = [];
    for (const [index, pim] of articles.entries()) {
             const sku = pim.SKU || pim.sku || pim.Article_Code;
       const ean = pim.EAN || pim.ean;
      
      console.log(`🔄 Verwerken SKU ${sku}... (${index + 1}/${articles.length})`);
       
       if (sku === '51.144263') {
         console.log(`*** PROCESSING ARTIKEL 51.144263 MET NIEUWE LOGICA ***`);
       }
      
      // Gebruik EXACT dezelfde logica als /api/lightspeed/product endpoint
      let foundVariant = null;
      let page = 1;
      const limit = 250;
      while (!foundVariant) {
        const url = `https://api.webshopapp.com/nl/variants.json?limit=${limit}&page=${page}`;
        const response = await axios.get(url, {
          auth: { username: apiKey, password: apiSecret },
          headers: { 'Accept': 'application/json' }
        });
        // Pauze na elke API call om rate limiting te voorkomen
        await new Promise(resolve => setTimeout(resolve, 200));
        const variants = response.data && response.data.variants ? response.data.variants : [];
        if (variants.length === 0) break;
        foundVariant = variants.find(v => (sku && v.sku === sku) || (ean && v.ean === ean));
        if (foundVariant) {
          try {
            const variantDetailRes = await axios.get(`https://api.webshopapp.com/nl/variants/${foundVariant.id}.json`, {
              auth: { username: apiKey, password: apiSecret },
              headers: { 'Accept': 'application/json' }
            });
            await new Promise(resolve => setTimeout(resolve, 200));
            foundVariant = variantDetailRes.data.variant;
          } catch (e) {
            console.log('Could not get variant details:', e.message);
          }
          break;
        }
        if (variants.length < limit) break;
        page++;
      }
      
      if (!foundVariant) {
        results.push({
          exists: false,
          differences: {},
          pim,
          ls: null,
          product: null
        });
        continue;
      }
      
      // Haal bijbehorend product op (exact zoals /api/lightspeed/product)
      let foundProduct = null;
      let productId = null;
      let productMultiLang = {}; // Initialize here to avoid undefined errors
      
      if (foundVariant.product_id) {
        productId = foundVariant.product_id;
      } else if (foundVariant.product && foundVariant.product.resource && foundVariant.product.resource.id) {
        productId = foundVariant.product.resource.id;
      }
      
      if (productId) {
        // Haal productdata op voor alle talen
        const multiLangFields = ['title', 'fulltitle', 'description', 'content'];
        const LANGS = [
          { code: 'nl', key: 'nl' },
          { code: 'de', key: 'de' },
          { code: 'en', key: 'en' }
        ];
        // Initialize productMultiLang here to ensure it's always defined
        if (!productMultiLang) productMultiLang = {};
        let baseProduct = null;
        for (const lang of LANGS) {
          const detailUrl = `https://api.webshopapp.com/${lang.code}/products/${productId}.json`;
          try {
            const detailRes = await axios.get(detailUrl, {
              auth: { username: apiKey, password: apiSecret },
              headers: { 'Accept': 'application/json' }
            });
            const prod = detailRes.data && detailRes.data.product;
            if (prod) {
              if (!baseProduct) baseProduct = prod;
              for (const field of multiLangFields) {
                if (!productMultiLang[field]) productMultiLang[field] = {};
                productMultiLang[field][lang.key] = prod[field] || '';
              }
            }
          } catch (err) {
            console.error(`[LS API] Fout bij ophalen product voor taal ${lang.code}:`, err.message);
          }
        }
        // Voeg multi-language velden toe aan baseProduct
        if (baseProduct) {
          for (const field of multiLangFields) {
            if (productMultiLang[field]) {
              baseProduct[field] = productMultiLang[field];
            }
          }
        }
        foundProduct = baseProduct;
        
        // Haal brand/supplier namen op (exact zoals /api/lightspeed/product)
        if (foundProduct && foundProduct.brand && foundProduct.brand.resource && foundProduct.brand.resource.id) {
          try {
            const brandRes = await axios.get(`https://api.webshopapp.com/nl/brands/${foundProduct.brand.resource.id}.json`, {
              auth: { username: apiKey, password: apiSecret },
              headers: { 'Accept': 'application/json' }
            });
            await new Promise(resolve => setTimeout(resolve, 50));
            const brandObj = brandRes.data && brandRes.data.brand;
            foundProduct.brandName = brandObj?.title || brandObj?.name || '';
          } catch (e) {
            foundProduct.brandName = '';
          }
        }
        
        if (foundProduct && foundProduct.supplier && foundProduct.supplier.resource && foundProduct.supplier.resource.id) {
          try {
            const supplierRes = await axios.get(`https://api.webshopapp.com/nl/suppliers/${foundProduct.supplier.resource.id}.json`, {
              auth: { username: apiKey, password: apiSecret },
              headers: { 'Accept': 'application/json' }
            });
            await new Promise(resolve => setTimeout(resolve, 50));
            const supplierObj = supplierRes.data && supplierRes.data.supplier;
            foundProduct.supplierName = supplierObj?.title || supplierObj?.name || '';
          } catch (e) {
            foundProduct.supplierName = '';
          }
        }
      }
      
      // Bereken verschillen (EXACT zoals Vergelijking pagina)
      const diffs = {};
      Object.entries(mapping || {}).forEach(([pimField, lsField]) => {
        if (!lsField || typeof lsField !== 'string') return;
        let lsKey = null;
        let lsValue = undefined;
        
        if (lsField.startsWith('Variant: ')) {
          lsKey = lsField.replace('Variant: ', '').replace(/ \(.*\)$/, '');
          lsValue = getBestValue(foundVariant ? foundVariant[lsKey] : undefined);
        } else if (lsField.startsWith('Product: ')) {
          lsKey = lsField.replace('Product: ', '').replace(/ \(.*\)$/, '');
          if (!foundProduct) {
            lsValue = undefined;
          } else {
            // Speciale behandeling voor multi-language velden
            if (['title', 'fulltitle', 'description', 'content'].includes(lsKey)) {
              const langMatch = lsField.match(/\((\w{2})\)$/);
              if (langMatch && productMultiLang[lsKey]) {
                const lang = langMatch[1].toLowerCase();
                lsValue = productMultiLang[lsKey][lang] || productMultiLang[lsKey][lang.toUpperCase()] || '';
              } else if (productMultiLang[lsKey]) {
                lsValue = productMultiLang[lsKey]['nl'] || productMultiLang[lsKey]['NL'] || Object.values(productMultiLang[lsKey])[0] || '';
              } else {
                lsValue = foundProduct[lsKey];
              }
            } else {
              // Bestaande logica voor brand/supplier namen (exact zoals Vergelijking pagina)
              let value = foundProduct[lsKey];
              
              // Speciale behandeling voor brand/supplier namen (exact zoals Vergelijking pagina)
              if (lsKey === 'brand.name' || lsKey === 'brandName' || lsKey === 'brand.resource.id') {
                value = foundProduct.brandName || foundProduct.brand?.name || foundProduct.brand?.title || getBestValue(foundProduct.brand);
              } else if (lsKey === 'supplier.name' || lsKey === 'supplierName' || lsKey === 'supplier.resource.id') {
                value = foundProduct.supplierName || foundProduct.supplier?.name || foundProduct.supplier?.title || getBestValue(foundProduct.supplier);
              } else if (lsKey === 'brand.title' || lsKey === 'brandTitle') {
                value = foundProduct.brandName || foundProduct.brand?.title || foundProduct.brand?.name || getBestValue(foundProduct.brand);
              } else if (lsKey === 'supplier.title' || lsKey === 'supplierTitle') {
                value = foundProduct.supplierName || foundProduct.supplier?.title || foundProduct.supplier?.name || getBestValue(foundProduct.supplier);
              } else if (lsKey === 'title' || lsKey === 'fulltitle' || lsKey === 'description' || lsKey === 'content') {
                // Voor content velden: gebruik originele product data
                let fieldObj = foundProduct[lsKey];
                
                // Probeer taal-specifiek uit het veld te halen (EN), (NL), (DE)
                const langMatch = lsField.match(/\((\w{2})\)$/);
                if (langMatch && fieldObj && typeof fieldObj === 'object') {
                  const lang = langMatch[1].toLowerCase();
                  value = fieldObj[lang] || fieldObj[lang.toUpperCase()];
                  console.log(`🌐 Language-specific lookup for ${lsKey} (${lang}):`, {fieldObj, value});
                } else if (fieldObj && typeof fieldObj === 'object') {
                  // Geen specifieke taal gevraagd, neem Nederlandse/eerste waarde
                  value = fieldObj.nl || fieldObj.NL || fieldObj.nederlands || fieldObj.value || Object.values(fieldObj)[0];
                  console.log(`📝 Multi-language lookup for ${lsKey}:`, {fieldObj, value});
                } else {
                  value = fieldObj;
                  console.log(`📋 Direct lookup for ${lsKey}:`, value);
                }
              } else if (value === undefined && lsKey.includes('.')) {
                // Als lsKey een pad is (bijv. supplier.name), navigeer door object
                const parts = lsKey.split('.');
                let obj = foundProduct;
                for (const part of parts) {
                  if (obj && typeof obj === 'object') {
                    obj = obj[part];
                  } else {
                    obj = undefined;
                    break;
                  }
                }
                value = getBestValue(obj);
              }
              
              lsValue = getBestValue(value);
            }
          }
        } else {
          return;
        }
        
        const pimValue = pim[pimField];
        const pimStr = String(pimValue || '').trim();
        const lsStr = String(lsValue || '').trim();
        
        // Helper functie voor tekst gelijkenis berekening
        const calculateSimilarity = (str1, str2) => {
          if (str1 === str2) return 1.0;
          if (!str1 || !str2) return 0.0;
          
          const words1 = str1.split(/\s+/).filter(w => w.length > 0);
          const words2 = str2.split(/\s+/).filter(w => w.length > 0);
          
          if (words1.length === 0 && words2.length === 0) return 1.0;
          if (words1.length === 0 || words2.length === 0) return 0.0;
          
          const commonWords = words1.filter(word => words2.includes(word));
          const totalWords = Math.max(words1.length, words2.length);
          
          return commonWords.length / totalWords;
        };
        
        // Super eenvoudige vergelijking - alleen echte verschillen
        let isDifferent = false;
        
        // Skip images.resource.url - dit zijn geen echte verschillen
        if (lsKey === 'images.resource.url' || lsField.includes('images.resource.url')) {
          isDifferent = false;
        }
                 // Skip brand.title en supplier.title - deze zijn overbodig
         else if (lsKey === 'brand.title' || lsKey === 'supplier.title') {
           // Skip deze velden volledig - voeg ze niet toe aan diffs
           isDifferent = false;
         }
        // Als beide leeg zijn, geen verschil
        else if (!pimStr && !lsStr) {
          isDifferent = false;
        }
        // Voor getallen (prijs, gewicht, volume), direct vergelijken
        else if (!isNaN(parseFloat(pimStr)) && !isNaN(parseFloat(lsStr))) {
          const pimNum = parseFloat(pimStr);
          const lsNum = parseFloat(lsStr);
          isDifferent = pimNum !== lsNum;
        }
        // Voor strings, direct vergelijken na basis opschoning
        else {
          // Verwijder alleen HTML tags en trim
          const cleanPim = pimStr.replace(/<[^>]*>/g, '').trim();
          const cleanLs = lsStr.replace(/<[^>]*>/g, '').trim();
          
          // Direct vergelijken
          isDifferent = cleanPim !== cleanLs;
        }
        
        if (isDifferent) {
          diffs[lsKey] = { pim: pimValue, ls: lsValue, field: lsField };
        }
               });
         
      // Debug logging removed to prevent errors
         
         results.push({
           exists: true,
           differences: diffs,
           pim,
           ls: foundVariant,
           product: foundProduct
         });
         
      // Pauze tussen artikelen om rate limiting te voorkomen (verhoogd naar 1 seconde)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    res.json({ results });
  } catch (e) {
    console.error('Vergelijkingsfout:', e);
    res.status(500).json({ error: e.message });
  }
});

// TEST ENDPOINT: Vergelijk alleen artikel 51.144263 (om rate limiting te testen)
app.post('/api/pim-lightspeed/test-single', async (req, res) => {
  console.log('==> TEST ENDPOINT: Alleen artikel 51.144263');
  
  // Gebruik de correcte CSV URL
  const csvUrl = 'https://pim.plytix.com/channels/660288e8a988634e845c47b5/feed';
  
  try {
    console.log('*** OPHALEN ECHTE CSV DATA ***');
    const csvResponse = await axios.get(csvUrl);
    console.log('CSV response ontvangen, grootte:', csvResponse.data.length);
    
    // Parse CSV data
    const csvLines = csvResponse.data.split('\n');
    console.log('Aantal CSV regels:', csvLines.length);
    
    if (csvLines.length < 2) {
      return res.status(400).json({ error: 'CSV heeft geen data' });
    }
    
    // Parse header
    const headers = csvLines[0].split(';').map(h => h.replace(/"/g, ''));
    console.log('CSV headers:', headers.slice(0, 10)); // Toon eerste 10 headers
    
    // Zoek artikel 51.144263
    let testArticle = null;
    for (let i = 1; i < csvLines.length; i++) {
      const line = csvLines[i];
      if (line.includes('51.144263')) {
        const values = line.split(';').map(v => v.replace(/"/g, ''));
        testArticle = {};
        headers.forEach((header, index) => {
          testArticle[header] = values[index] || '';
        });
        console.log('*** ARTIKEL 51.144263 GEVONDEN IN CSV ***');
        console.log('SKU:', testArticle.SKU);
        console.log('EAN:', testArticle.EAN);
        console.log('Price:', testArticle.Price);
        console.log('Brand:', testArticle.Brand);
        console.log('Supplier:', testArticle.Supplier);
        console.log('NL_Title_Long:', testArticle.NL_Title_Long);
        break;
      }
    }
    
    if (!testArticle) {
      return res.status(404).json({ error: 'Artikel 51.144263 niet gevonden in CSV' });
    }
    
    console.log('PIM velden:', Object.keys(testArticle).length);
    console.log('PIM data:', testArticle);
    
    let settings = {};
    if (fs.existsSync(SETTINGS_PATH)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
    const { apiKey, apiSecret, storeId, mapping } = settings;
    if (!apiKey || !apiSecret || !storeId) {
      return res.status(400).json({ error: 'API credentials or Store ID missing' });
    }
    
    console.log('Mapping velden:', Object.keys(mapping || {}).length);
    
    // Helper functie (exact zoals in Vergelijking pagina)
    function getBestValue(obj) {
      if (obj && typeof obj === 'object') {
        // Voor multi-language objects, probeer Nederlandse versie eerst
        if (obj.nl || obj.NL || obj.nederlands) {
          return obj.nl || obj.NL || obj.nederlands;
        }
        // Anders probeer standaard velden
        return obj.title || obj.name || obj.value || obj.id || Object.values(obj)[0] || JSON.stringify(obj);
      }
      return obj;
    }

    try {
      const pim = testArticle;
      const sku = pim.SKU || pim.sku || pim.Article_Code;
      const ean = pim.EAN || pim.ean;
      
      console.log(`*** TEST: PROCESSING ARTIKEL ${sku} ***`);
      
      // Gebruik EXACT dezelfde logica als /api/lightspeed/product endpoint
      let foundVariant = null;
      let page = 1;
      const limit = 250;
      
      while (!foundVariant) {
        console.log(`Zoeken op pagina ${page}...`);
        const url = `https://api.webshopapp.com/nl/variants.json?limit=${limit}&page=${page}`;
        const response = await axios.get(url, {
          auth: { username: apiKey, password: apiSecret },
          headers: { 'Accept': 'application/json' }
        });
        
        // Langere pauze voor test
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const variants = response.data && response.data.variants ? response.data.variants : [];
        console.log(`Pagina ${page}: ${variants.length} variants gevonden`);
        
        if (variants.length === 0) break;
        
        foundVariant = variants.find(v => (sku && v.sku === sku) || (ean && v.ean === ean));
        
        if (foundVariant) {
          console.log(`*** VARIANT GEVONDEN: ${foundVariant.id} ***`);
          try {
            const variantDetailRes = await axios.get(`https://api.webshopapp.com/nl/variants/${foundVariant.id}.json`, {
              auth: { username: apiKey, password: apiSecret },
              headers: { 'Accept': 'application/json' }
            });
            await new Promise(resolve => setTimeout(resolve, 200));
            foundVariant = variantDetailRes.data.variant;
            console.log('Variant details opgehaald');
          } catch (e) {
            console.log('Could not get variant details:', e.message);
          }
          break;
        }
        
        if (variants.length < limit) break;
        page++;
      }
      
      if (!foundVariant) {
        console.log('*** ARTIKEL NIET GEVONDEN ***');
        return res.json({
          results: [{
            exists: false,
            differences: {},
            pim,
            ls: null,
            product: null
          }]
        });
      }
      
      // Haal bijbehorend product op
      let foundProduct = null;
      let productId = null;
      let productMultiLang = {}; // Initialize here to avoid undefined errors
      
      if (foundVariant.product_id) {
        productId = foundVariant.product_id;
      } else if (foundVariant.product && foundVariant.product.resource && foundVariant.product.resource.id) {
        productId = foundVariant.product.resource.id;
      }
      
      console.log(`Product ID: ${productId}`);
      
      if (productId) {
        const detailUrl = `https://api.webshopapp.com/nl/products/${productId}.json`;
        const detailRes = await axios.get(detailUrl, {
          auth: { username: apiKey, password: apiSecret },
          headers: { 'Accept': 'application/json' }
        });
        await new Promise(resolve => setTimeout(resolve, 200));
        foundProduct = detailRes.data && detailRes.data.product ? detailRes.data.product : null;
        console.log('Product details opgehaald');
        
        // Haal brand/supplier namen op
        if (foundProduct && foundProduct.brand && foundProduct.brand.resource && foundProduct.brand.resource.id) {
          try {
            console.log(`Brand ID: ${foundProduct.brand.resource.id}`);
            const brandRes = await axios.get(`https://api.webshopapp.com/nl/brands/${foundProduct.brand.resource.id}.json`, {
              auth: { username: apiKey, password: apiSecret },
              headers: { 'Accept': 'application/json' }
            });
            await new Promise(resolve => setTimeout(resolve, 200));
            const brandObj = brandRes.data && brandRes.data.brand;
            foundProduct.brandName = brandObj?.title || brandObj?.name || '';
            console.log(`Brand naam: ${foundProduct.brandName}`);
          } catch (e) {
            foundProduct.brandName = '';
            console.log('Brand ophalen mislukt:', e.message);
          }
        }
        
        if (foundProduct && foundProduct.supplier && foundProduct.supplier.resource && foundProduct.supplier.resource.id) {
          try {
            console.log(`Supplier ID: ${foundProduct.supplier.resource.id}`);
            const supplierRes = await axios.get(`https://api.webshopapp.com/nl/suppliers/${foundProduct.supplier.resource.id}.json`, {
              auth: { username: apiKey, password: apiSecret },
              headers: { 'Accept': 'application/json' }
            });
            await new Promise(resolve => setTimeout(resolve, 200));
            const supplierObj = supplierRes.data && supplierRes.data.supplier;
            foundProduct.supplierName = supplierObj?.title || supplierObj?.name || '';
            console.log(`Supplier naam: ${foundProduct.supplierName}`);
          } catch (e) {
            foundProduct.supplierName = '';
            console.log('Supplier ophalen mislukt:', e.message);
          }
        }
      }
      
      // Bereken verschillen
      const diffs = {};
      console.log('*** BEREKENEN VERSCHILLEN ***');
      
      Object.entries(mapping || {}).forEach(([pimField, lsField]) => {
        if (!lsField || typeof lsField !== 'string') return;
        
        let lsKey = null;
        let lsValue = undefined;
        
        if (lsField.startsWith('Variant: ')) {
          lsKey = lsField.replace('Variant: ', '').replace(/ \(.*\)$/, '');
          lsValue = getBestValue(foundVariant ? foundVariant[lsKey] : undefined);
        } else if (lsField.startsWith('Product: ')) {
          lsKey = lsField.replace('Product: ', '').replace(/ \(.*\)$/, '');
          if (!foundProduct) {
            lsValue = undefined;
          } else {
            let value = foundProduct[lsKey];
            
            // Speciale behandeling voor brand/supplier namen
            if (lsKey === 'brand.name' || lsKey === 'brandName' || lsKey === 'brand.resource.id') {
              value = foundProduct.brandName || foundProduct.brand?.name || foundProduct.brand?.title || getBestValue(foundProduct.brand);
            } else if (lsKey === 'supplier.name' || lsKey === 'supplierName' || lsKey === 'supplier.resource.id') {
              value = foundProduct.supplierName || foundProduct.supplier?.name || foundProduct.supplier?.title || getBestValue(foundProduct.supplier);
            } else if (lsKey === 'brand.title' || lsKey === 'brandTitle') {
              value = foundProduct.brandName || foundProduct.brand?.title || foundProduct.brand?.name || getBestValue(foundProduct.brand);
            } else if (lsKey === 'supplier.title' || lsKey === 'supplierTitle') {
              value = foundProduct.supplierName || foundProduct.supplier?.title || foundProduct.supplier?.name || getBestValue(foundProduct.supplier);
            } else if (lsKey === 'title' || lsKey === 'fulltitle') {
              value = foundProduct[lsKey];
            }
            
            lsValue = getBestValue(value);
          }
        } else {
          return;
        }
        
        const pimValue = pim[pimField];
        const pimStr = String(pimValue || '').trim();
        const lsStr = String(lsValue || '').trim();
        
        if (pimStr !== lsStr) {
          diffs[lsKey] = { pim: pimValue, ls: lsValue, field: lsField };
          console.log(`VERSCHIL: ${lsKey} -> PIM: "${pimStr}" vs LS: "${lsStr}"`);
        }
      });
      
      console.log(`*** TOTAAL ${Object.keys(diffs).length} VERSCHILLEN GEVONDEN ***`);
      
      res.json({
        results: [{
          exists: true,
          differences: diffs,
          pim,
          ls: foundVariant,
          product: foundProduct
        }]
      });
      
    } catch (e) {
      console.error('TEST fout:', e.message);
      res.status(500).json({ error: e.message });
    }
  } catch (e) {
    console.log('Fout bij ophalen CSV data:', e.message);
    return res.status(500).json({ error: 'Kon CSV data niet ophalen: ' + e.message });
  }
});

// TEST: Direct product aanmaken naar Lightspeed API
app.post('/api/test/create-product-direct', async (req, res) => {
  console.log('🧪 TEST: Direct product creation to Lightspeed API');
  
  // Haal settings op
  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  }
  const { apiKey, apiSecret } = settings;
  
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'API credentials missing' });
  }
  
  try {
    // Simpele test product data
    const productData = {
      title: "TEST Product - Barto Waltham Donkergroen 25L",
      fulltitle: "TEST Product - Barto Waltham Donkergroen 25L Rugtas Waterafstotend Laptop",
      content: "Dit is een test product aangemaakt via de API",
      isVisible: true,
      data01: "TEST"
    };
    
    console.log('📦 Creating test product with data:', productData);
    
    // POST direct naar Lightspeed API
    const response = await axios.post(
      'https://api.webshopapp.com/nl/products.json',
      { product: productData },
      {
        auth: { username: apiKey, password: apiSecret },
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    
    console.log('✅ Product successfully created!');
    console.log('Response:', response.data);
    
    res.json({
      success: true,
      product: response.data.product,
      productId: response.data.product?.id
    });
    
  } catch (error) {
    console.error('❌ Test product creation failed:', error);
    if (error.response) {
      console.error('❌ Response status:', error.response.status);
      console.error('❌ Response data:', error.response.data);
    }
    res.status(500).json({ 
      error: error.message,
      details: error.response?.data 
    });
  }
});

// REAL PRODUCT: Maak een echt product aan van PIM data
app.post('/api/test/create-real-product', async (req, res) => {
  console.log('🚀 REAL PRODUCT: Creating real product from PIM data');
  
  // Haal settings op
  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  }
  const { apiKey, apiSecret, mapping, importUrl } = settings;
  
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'API credentials missing' });
  }
  
  if (!mapping || Object.keys(mapping).length === 0) {
    return res.status(400).json({ error: 'Mapping configuration missing' });
  }
  
  try {
    console.log('📥 Using hardcoded test data...');
    
    // Gebruik hardcoded test data in plaats van CSV
    const testProduct = {
      SKU: 'TEST-REAL-' + Date.now(),
      EAN: '1234567890123',
      Price: '29.95',
      Brand: 'Test Brand',
      Supplier: 'Test Supplier',
      NL_Title_Short: 'Test Product NL',
      NL_Title_Long: 'Test Product Long Title NL',
      DE_Title_Short: 'Test Product DE',
      DE_Title_Long: 'Test Product Long Title DE',
      EN_Title_Short: 'Test Product EN',
      EN_Title_Long: 'Test Product Long Title EN',
      NL_Description_Short: 'Test beschrijving NL',
      NL_Description_Long: 'Test lange beschrijving NL',
      DE_Description_Short: 'Test Beschreibung DE',
      DE_Description_Long: 'Test lange Beschreibung DE',
      EN_Description_Short: 'Test description EN',
      EN_Description_Long: 'Test long description EN',
      Data_01: 'TEST-DATA',
      Price_Cost: '15.00',
      Price_Old: '39.95',
      Volume_Value: '500',
      Weight_Value: '200',
      Images: 'https://via.placeholder.com/400x400.jpg?text=Test+Product,https://via.placeholder.com/400x300.jpg?text=Test+Image+2',
      Article_Code: 'TEST-ARTIKEL-' + Date.now(),
      Volume_Unit: 'ml',
      Weight_Unit: 'g'
    };
    
    console.log(`🎯 Using test product with SKU: ${testProduct.SKU}`);
    console.log('📦 Product data:', testProduct);
    
    console.log('🔄 Starting real product creation process...');
    
    // Stap 3: Maak product aan (gebruik bestaande logica)
    let productCreateResponse;
    try {
      productCreateResponse = await axios.post(
        'http://localhost:4000/api/products/create',
        { 
          product: testProduct,
          mapping: mapping 
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
      console.log('✅ Product created:', productCreateResponse.data);
    } catch (productError) {
      console.error('❌ Product creation failed:', productError.response?.data || productError.message);
      throw new Error(`Product creation failed: ${productError.response?.data?.error || productError.message}`);
    }
    
    // Kleine pauze om database update te verzekeren
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Stap 4: Maak variant aan
    let variantCreateResponse;
    try {
      variantCreateResponse = await axios.post(
        'http://localhost:4000/api/variants/create',
        { 
          product: testProduct,
          mapping: mapping 
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
      console.log('✅ Variant created:', variantCreateResponse.data);
    } catch (variantError) {
      console.error('❌ Variant creation failed:', variantError.response?.data || variantError.message);
      throw new Error(`Variant creation failed: ${variantError.response?.data?.error || variantError.message}`);
    }
    
    res.json({
      success: true,
      message: 'Real product created successfully from PIM data (with variant)',
      product: productCreateResponse.data,
      variant: variantCreateResponse.data,
      pimData: {
        SKU: testProduct.SKU,
        EAN: testProduct.EAN,
        Brand: testProduct.Brand,
        Supplier: testProduct.Supplier,
        NL_Title_Short: testProduct.NL_Title_Short,
        NL_Title_Long: testProduct.NL_Title_Long,
        DE_Title_Short: testProduct.DE_Title_Short,
        DE_Title_Long: testProduct.DE_Title_Long,
        EN_Title_Short: testProduct.EN_Title_Short,
        EN_Title_Long: testProduct.EN_Title_Long
      }
    });
    
  } catch (error) {
    console.error('❌ Real product creation failed:', error);
    if (error.response) {
      console.error('❌ Response status:', error.response.status);
      console.error('❌ Response data:', error.response.data);
    }
    res.status(500).json({ 
      error: error.message,
      details: error.response?.data 
    });
  }
});

app.get('/api/import-runs/:runId/details', async (req, res) => {
  const { runId } = req.params;
  try {
    const db = getSupabaseDatabase();
    // Run
    const { data: runRows, error: runErr } = await db
      .from('import_runs')
      .select('*')
      .eq('id', runId)
      .limit(1);
    if (runErr) return res.status(500).json({ error: runErr.message });
    const run = Array.isArray(runRows) ? runRows[0] : null;
    if (!run) return res.status(404).json({ error: 'Import run not found' });

    // Items
    const { data: itemRows, error: itemErr } = await db
      .from('import_items')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true });
    if (itemErr) return res.status(500).json({ error: itemErr.message });

    const items = itemRows || [];
    const grouped = {
      created: items.filter(i => i.status === 'ok' && i.op === 'create'),
      updated: items.filter(i => i.status === 'ok' && i.op === 'update'),
      failed: items.filter(i => i.status === 'fail'),
      total: items.length
    };

    res.json({
      run,
      items: grouped,
      summary: {
        total: grouped.total,
        created: grouped.created.length,
        updated: grouped.updated.length,
        failed: grouped.failed.length,
        successRate: grouped.total > 0 ? Math.round(((grouped.created.length + grouped.updated.length) / grouped.total) * 100) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 4000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });
}

module.exports = app;