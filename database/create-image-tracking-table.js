const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'lightspeed_lookup.db');

const db = new sqlite3.Database(dbPath);

// Create image tracking table
const createImageTrackingTable = `
  CREATE TABLE IF NOT EXISTS image_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    pim_image_url TEXT NOT NULL,
    pim_filename TEXT NOT NULL,
    lightspeed_image_url TEXT,
    lightspeed_image_id INTEGER,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sku, pim_filename)
  )
`;

// Create indexes for better performance
const createIndexes = [
  'CREATE INDEX IF NOT EXISTS idx_image_tracking_sku ON image_tracking(sku)',
  'CREATE INDEX IF NOT EXISTS idx_image_tracking_product_id ON image_tracking(product_id)',
  'CREATE INDEX IF NOT EXISTS idx_image_tracking_pim_filename ON image_tracking(pim_filename)'
];

db.serialize(() => {
  console.log('🔧 Creating image tracking table...');
  
  db.run(createImageTrackingTable, (err) => {
    if (err) {
      console.error('❌ Error creating image_tracking table:', err.message);
    } else {
      console.log('✅ image_tracking table created successfully');
    }
  });

  // Create indexes
  createIndexes.forEach((indexSQL, i) => {
    db.run(indexSQL, (err) => {
      if (err) {
        console.error(`❌ Error creating index ${i + 1}:`, err.message);
      } else {
        console.log(`✅ Index ${i + 1} created successfully`);
      }
    });
  });

  console.log('🎉 Image tracking setup completed!');
});

db.close();



