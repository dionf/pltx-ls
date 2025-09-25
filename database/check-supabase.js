const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const WEBSHOP_ID = process.env.WEBSHOP_ID || 'lial';

async function checkSupabase() {
  console.log('🔍 Checking Supabase database...');
  
  try {
    // Check brands
    const { data: brands, error: brandError } = await supabase
      .from('brands')
      .select('*')
      .eq('webshop_id', WEBSHOP_ID);
    
    if (brandError) {
      console.error('❌ Brand error:', brandError);
    } else {
      console.log(`📊 Brands in Supabase: ${brands.length} records`);
      console.log('Sample brands:', brands.slice(0, 3));
    }

    // Check suppliers
    const { data: suppliers, error: supplierError } = await supabase
      .from('suppliers')
      .select('*')
      .eq('webshop_id', WEBSHOP_ID);
    
    if (supplierError) {
      console.error('❌ Supplier error:', supplierError);
    } else {
      console.log(`📊 Suppliers in Supabase: ${suppliers.length} records`);
      console.log('Sample suppliers:', suppliers);
    }

    // Check variant_lookup
    const { data: variants, error: variantError } = await supabase
      .from('variant_lookup')
      .select('sku')
      .eq('webshop_id', WEBSHOP_ID);
    
    if (variantError) {
      console.error('❌ Variant error:', variantError);
    } else {
      console.log(`📊 Variant lookups in Supabase: ${variants.length} records`);
    }

    // Check webshops
    const { data: webshops, error: webshopError } = await supabase
      .from('webshops')
      .select('*');
    
    if (webshopError) {
      console.error('❌ Webshop error:', webshopError);
    } else {
      console.log(`📊 Webshops in Supabase: ${webshops.length} records`);
      console.log('Webshops:', webshops);
    }

  } catch (error) {
    console.error('❌ Error checking Supabase:', error);
  }
}

checkSupabase();

