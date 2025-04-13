const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// Create Express app
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'plytix_lightspeed',
  user: process.env.DB_USER || 'plytix_app',
  password: process.env.DB_PASSWORD || 'demo_secure_password',
  ssl: process.env.DB_SSL === 'true' ? true : false
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('Database connected successfully');
  }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  
  jwt.verify(token, process.env.JWT_SECRET || 'demo_jwt_secret_key_for_temporary_environment', (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// Routes

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Check if user already exists
    const userCheck = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );
    
    if (userCheck.rows.length > 0) {
      return res.status(409).json({ message: 'Username or email already exists' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user
    const result = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
      [username, email, hashedPassword]
    );
    
    // Generate token
    const token = jwt.sign(
      { id: result.rows[0].id, username: result.rows[0].username },
      process.env.JWT_SECRET || 'demo_jwt_secret_key_for_temporary_environment',
      { expiresIn: process.env.JWT_EXPIRATION || '24h' }
    );
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: result.rows[0].id,
        username: result.rows[0].username,
        email: result.rows[0].email,
        created_at: result.rows[0].created_at
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    
    // Find user
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Generate token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET || 'demo_jwt_secret_key_for_temporary_environment',
      { expiresIn: process.env.JWT_EXPIRATION || '24h' }
    );
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Protected route example
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// API Credentials endpoints
app.post('/api/credentials', authenticateToken, async (req, res) => {
  try {
    const { platform, api_key, api_secret, additional_params } = req.body;
    
    // Validate input
    if (!platform || !api_key || !api_secret) {
      return res.status(400).json({ message: 'Platform, API key and secret are required' });
    }
    
    // Check if credentials already exist for this platform
    const credCheck = await pool.query(
      'SELECT * FROM api_credentials WHERE user_id = $1 AND platform = $2',
      [req.user.id, platform]
    );
    
    if (credCheck.rows.length > 0) {
      // Update existing credentials
      await pool.query(
        'UPDATE api_credentials SET api_key = $1, api_secret = $2, additional_params = $3, updated_at = NOW() WHERE user_id = $4 AND platform = $5',
        [api_key, api_secret, additional_params || null, req.user.id, platform]
      );
      
      return res.json({ message: 'API credentials updated successfully' });
    }
    
    // Create new credentials
    await pool.query(
      'INSERT INTO api_credentials (user_id, platform, api_key, api_secret, additional_params) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, platform, api_key, api_secret, additional_params || null]
    );
    
    res.status(201).json({ message: 'API credentials saved successfully' });
  } catch (error) {
    console.error('API credentials error:', error);
    res.status(500).json({ message: 'Server error saving API credentials' });
  }
});

app.get('/api/credentials/:platform', authenticateToken, async (req, res) => {
  try {
    const { platform } = req.params;
    
    const result = await pool.query(
      'SELECT id, platform, api_key, api_secret, additional_params, connection_status, last_tested FROM api_credentials WHERE user_id = $1 AND platform = $2',
      [req.user.id, platform]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'API credentials not found' });
    }
    
    res.json({
      credentials: result.rows[0]
    });
  } catch (error) {
    console.error('Get API credentials error:', error);
    res.status(500).json({ message: 'Server error retrieving API credentials' });
  }
});

// Test connection endpoint
app.post('/api/test-connection/:platform', authenticateToken, async (req, res) => {
  try {
    const { platform } = req.params;
    
    // Get credentials
    const credResult = await pool.query(
      'SELECT * FROM api_credentials WHERE user_id = $1 AND platform = $2',
      [req.user.id, platform]
    );
    
    if (credResult.rows.length === 0) {
      return res.status(404).json({ message: 'API credentials not found' });
    }
    
    // For demo purposes, simulate API connection test
    const isSuccess = Math.random() > 0.2; // 80% success rate
    const status = isSuccess ? 'connected' : 'failed';
    const testTime = new Date();
    
    // Update connection status
    await pool.query(
      'UPDATE api_credentials SET connection_status = $1, last_tested = $2 WHERE id = $3',
      [status, testTime, credResult.rows[0].id]
    );
    
    if (isSuccess) {
      res.json({
        message: 'Connection successful',
        status,
        tested_at: testTime,
        details: {
          response_time: Math.floor(Math.random() * 500) + 100 + 'ms',
          api_version: platform === 'plytix' ? '2.1.0' : '3.5.2',
          permissions: ['read', 'write']
        }
      });
    } else {
      res.status(400).json({
        message: 'Connection failed',
        status,
        tested_at: testTime,
        error: 'Authentication failed. Please check your API credentials.'
      });
    }
  } catch (error) {
    console.error('Test connection error:', error);
    res.status(500).json({ message: 'Server error testing connection' });
  }
});

// Attribute mapping endpoints
app.post('/api/attribute-mapping', authenticateToken, async (req, res) => {
  try {
    const { plytix_attribute, lightspeed_attribute, transformation_rule } = req.body;
    
    // Validate input
    if (!plytix_attribute || !lightspeed_attribute) {
      return res.status(400).json({ message: 'Both Plytix and Lightspeed attributes are required' });
    }
    
    // Check if mapping already exists
    const mapCheck = await pool.query(
      'SELECT * FROM attribute_mappings WHERE user_id = $1 AND plytix_attribute = $2 AND lightspeed_attribute = $3',
      [req.user.id, plytix_attribute, lightspeed_attribute]
    );
    
    if (mapCheck.rows.length > 0) {
      // Update existing mapping
      await pool.query(
        'UPDATE attribute_mappings SET transformation_rule = $1, updated_at = NOW() WHERE user_id = $2 AND plytix_attribute = $3 AND lightspeed_attribute = $4',
        [transformation_rule || null, req.user.id, plytix_attribute, lightspeed_attribute]
      );
      
      return res.json({ message: 'Attribute mapping updated successfully' });
    }
    
    // Create new mapping
    await pool.query(
      'INSERT INTO attribute_mappings (user_id, plytix_attribute, lightspeed_attribute, transformation_rule) VALUES ($1, $2, $3, $4)',
      [req.user.id, plytix_attribute, lightspeed_attribute, transformation_rule || null]
    );
    
    res.status(201).json({ message: 'Attribute mapping created successfully' });
  } catch (error) {
    console.error('Attribute mapping error:', error);
    res.status(500).json({ message: 'Server error creating attribute mapping' });
  }
});

app.get('/api/attribute-mapping', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM attribute_mappings WHERE user_id = $1 ORDER BY created_at',
      [req.user.id]
    );
    
    res.json({
      mappings: result.rows
    });
  } catch (error) {
    console.error('Get attribute mappings error:', error);
    res.status(500).json({ message: 'Server error retrieving attribute mappings' });
  }
});

app.delete('/api/attribute-mapping/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if mapping exists and belongs to user
    const mapCheck = await pool.query(
      'SELECT * FROM attribute_mappings WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (mapCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Attribute mapping not found' });
    }
    
    // Delete mapping
    await pool.query(
      'DELETE FROM attribute_mappings WHERE id = $1',
      [id]
    );
    
    res.json({ message: 'Attribute mapping deleted successfully' });
  } catch (error) {
    console.error('Delete attribute mapping error:', error);
    res.status(500).json({ message: 'Server error deleting attribute mapping' });
  }
});

// Workflow filter settings
app.post('/api/workflow-filter', authenticateToken, async (req, res) => {
  try {
    const { enabled, filter_value } = req.body;
    
    // Validate input
    if (enabled === undefined) {
      return res.status(400).json({ message: 'Enabled status is required' });
    }
    
    if (enabled && !filter_value) {
      return res.status(400).json({ message: 'Filter value is required when enabled' });
    }
    
    // Check if setting already exists
    const settingCheck = await pool.query(
      'SELECT * FROM user_settings WHERE user_id = $1 AND setting_key = $2',
      [req.user.id, 'workflow_filter_enabled']
    );
    
    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      if (settingCheck.rows.length > 0) {
        // Update enabled setting
        await client.query(
          'UPDATE user_settings SET setting_value = $1, updated_at = NOW() WHERE user_id = $2 AND setting_key = $3',
          [enabled.toString(), req.user.id, 'workflow_filter_enabled']
        );
      } else {
        // Create enabled setting
        await client.query(
          'INSERT INTO user_settings (user_id, setting_key, setting_value) VALUES ($1, $2, $3)',
          [req.user.id, 'workflow_filter_enabled', enabled.toString()]
        );
      }
      
      if (enabled) {
        // Check if filter value setting exists
        const valueCheck = await client.query(
          'SELECT * FROM user_settings WHERE user_id = $1 AND setting_key = $2',
          [req.user.id, 'workflow_filter_value']
        );
        
        if (valueCheck.rows.length > 0) {
          // Update filter value setting
          await client.query(
            'UPDATE user_settings SET setting_value = $1, updated_at = NOW() WHERE user_id = $2 AND setting_key = $3',
            [filter_value, req.user.id, 'workflow_filter_value']
          );
        } else {
          // Create filter value setting
          await client.query(
            'INSERT INTO user_settings (user_id, setting_key, setting_value) VALUES ($1, $2, $3)',
            [req.user.id, 'workflow_filter_value', filter_value]
          );
        }
      }
      
      await client.query('COMMIT');
      
      res.json({ message: 'Workflow filter settings saved successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Workflow filter settings error:', error);
    res.status(500).json({ message: 'Server error saving workflow filter settings' });
  }
});

app.get('/api/workflow-filter', authenticateToken, async (req, res) => {
  try {
    // Get enabled setting
    const enabledResult = await pool.query(
      'SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = $2',
      [req.user.id, 'workflow_filter_enabled']
    );
    
    const enabled = enabledResult.rows.length > 0 ? 
      enabledResult.rows[0].setting_value === 'true' : false;
    
    // Get filter value setting if enabled
    let filter_value = null;
    if (enabled) {
      const valueResult = await pool.query(
        'SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = $2',
        [req.user.id, 'workflow_filter_value']
      );
      
      filter_value = valueResult.rows.length > 0 ? 
        valueResult.rows[0].setting_value : '4. Ready to be published';
    }
    
    res.json({
      enabled,
      filter_value
    });
  } catch (error) {
    console.error('Get workflow filter settings error:', error);
    res.status(500).json({ message: 'Server error retrieving workflow filter settings' });
  }
});

// Synchronization endpoints
app.post('/api/sync', authenticateToken, async (req, res) => {
  try {
    // Create sync job
    const jobResult = await pool.query(
      'INSERT INTO sync_jobs (user_id, status, started_at) VALUES ($1, $2, NOW()) RETURNING id',
      [req.user.id, 'running']
    );
    
    const jobId = jobResult.rows[0].id;
    
    // For demo purposes, simulate synchronization process
    // In a real implementation, this would be a background job
    setTimeout(async () => {
      try {
        // Get workflow filter settings
        const enabledResult = await pool.query(
          'SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = $2',
          [req.user.id, 'workflow_filter_enabled']
        );
        
        const enabled = enabledResult.rows.length > 0 ? 
          enabledResult.rows[0].setting_value === 'true' : false;
        
        let filter_value = null;
        if (enabled) {
          const valueResult = await pool.query(
            'SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = $2',
            [req.user.id, 'workflow_filter_value']
          );
          
          filter_value = valueResult.rows.length > 0 ? 
            valueResult.rows[0].setting_value : '4. Ready to be published';
        }
        
        // Simulate product counts
        const totalProducts = Math.floor(Math.random() * 50) + 50;
        const filteredProducts = enabled ? 
          Math.floor(totalProducts * 0.4) : totalProducts;
        const successProducts = Math.floor(filteredProducts * 0.9);
        const failedProducts = filteredProducts - successProducts;
        
        // Add logs
        await pool.query(
          'INSERT INTO sync_logs (job_id, log_level, message, data) VALUES ($1, $2, $3, $4)',
          [jobId, 'info', 'Synchronization started', JSON.stringify({ timestamp: new Date() })]
        );
        
        await pool.query(
          'INSERT INTO sync_logs (job_id, log_level, message, data) VALUES ($1, $2, $3, $4)',
          [jobId, 'info', 'Fetching products from Plytix', JSON.stringify({ count: totalProducts })]
        );
        
        if (enabled) {
          await pool.query(
            'INSERT INTO sync_logs (job_id, log_level, message, data) VALUES ($1, $2, $3, $4)',
            [jobId, 'info', 'Applying workflow filter', JSON.stringify({ 
              filter: filter_value, 
              before: totalProducts, 
              after: filteredProducts 
            })]
          );
        }
        
        await pool.query(
          'INSERT INTO sync_logs (job_id, log_level, message, data) VALUES ($1, $2, $3, $4)',
          [jobId, 'info', 'Processing products', JSON.stringify({ count: filteredProducts })]
        );
        
        if (failedProducts > 0) {
          await pool.query(
            'INSERT INTO sync_logs (job_id, log_level, message, data) VALUES ($1, $2, $3, $4)',
            [jobId, 'error', 'Some products failed to synchronize', JSON.stringify({ count: failedProducts })]
          );
        }
        
        await pool.query(
          'INSERT INTO sync_logs (job_id, log_level, message, data) VALUES ($1, $2, $3, $4)',
          [jobId, 'info', 'Synchronization completed', JSON.stringify({ 
            timestamp: new Date(),
            success: successProducts,
            failed: failedProducts
          })]
        );
        
        // Update job status
        await pool.query(
          'UPDATE sync_jobs SET status = $1, completed_at = NOW(), results = $2 WHERE id = $3',
          ['completed', JSON.stringify({
            total_products: totalProducts,
            filtered_products: filteredProducts,
            successful: successProducts,
            failed: failedProducts,
            workflow_filter: enabled ? filter_value : null
          }), jobId]
        );
      } catch (error) {
        console.error('Sync job processing error:', error);
        
        // Update job status to failed
        await pool.query(
          'UPDATE sync_jobs SET status = $1, completed_at = NOW(), error = $2 WHERE id = $3',
          ['failed', error.message, jobId]
        );
        
        // Add error log
        await pool.query(
          'INSERT INTO sync_logs (job_id, log_level, message, data) VALUES ($1, $2, $3, $4)',
          [jobId, 'error', 'Synchronization failed', JSON.stringify({ 
            timestamp: new Date(),
            error: error.message
          })]
        );
      }
    }, 5000); // Simulate 5 second processing time
    
    res.json({
      message: 'Synchronization started',
      job_id: jobId
    });
  } catch (error) {
    console.error('Start sync error:', error);
    res.status(500).json({ message: 'Server error starting synchronization' });
  }
});

app.get('/api/sync/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get job
    const jobResult = await pool.query(
      'SELECT * FROM sync_jobs WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ message: 'Synchronization job not found' });
    }
    
    // Get logs
    const logsResult = await pool.query(
      'SELECT * FROM sync_logs WHERE job_id = $1 ORDER BY created_at',
      [id]
    );
    
    res.json({
      job: jobResult.rows[0],
      logs: logsResult.rows
    });
  } catch (error) {
    console.error('Get sync job error:', error);
    res.status(500).json({ message: 'Server error retrieving synchronization job' });
  }
});

app.get('/api/sync', authenticateToken, async (req, res) => {
  try {
    // Get recent jobs
    const jobsResult = await pool.query(
      'SELECT * FROM sync_jobs WHERE user_id = $1 ORDER BY started_at DESC LIMIT 10',
      [req.user.id]
    );
    
    res.json({
      jobs: jobsResult.rows
    });
  } catch (error) {
    console.error('Get sync jobs error:', error);
    res.status(500).json({ message: 'Server error retrieving synchronization jobs' });
  }
});

// Mock API endpoints for demo purposes

// Get Plytix attributes
app.get('/api/plytix/attributes', authenticateToken, (req, res) => {
  // Simulate Plytix attributes
  const attributes = [
    { id: 'name', label: 'Product Name', type: 'text' },
    { id: 'description', label: 'Description', type: 'text' },
    { id: 'sku', label: 'SKU', type: 'text' },
    { id: 'price', label: 'Price', type: 'number' },
    { id: 'cost', label: 'Cost', type: 'number' },
    { id: 'weight', label: 'Weight', type: 'number' },
    { id: 'brand', label: 'Brand', type: 'text' },
    { id: 'category', label: 'Category', type: 'text' },
    { id: 'tags', label: 'Tags', type: 'array' },
    { id: 'images', label: 'Images', type: 'array' },
    { id: 'content_workflow', label: 'Content Workflow', type: 'text' },
    { id: 'stock', label: 'Stock', type: 'number' },
    { id: 'color', label: 'Color', type: 'text' },
    { id: 'size', label: 'Size', type: 'text' },
    { id: 'material', label: 'Material', type: 'text' }
  ];
  
  res.json({ attributes });
});

// Get Lightspeed attributes
app.get('/api/lightspeed/attributes', authenticateToken, (req, res) => {
  // Simulate Lightspeed attributes
  const attributes = [
    { id: 'title', label: 'Title', type: 'text' },
    { id: 'description', label: 'Description', type: 'text' },
    { id: 'sku', label: 'SKU', type: 'text' },
    { id: 'price', label: 'Price', type: 'number' },
    { id: 'cost_price', label: 'Cost Price', type: 'number' },
    { id: 'weight', label: 'Weight', type: 'number' },
    { id: 'brand', label: 'Brand', type: 'text' },
    { id: 'category', label: 'Category', type: 'text' },
    { id: 'tags', label: 'Tags', type: 'array' },
    { id: 'images', label: 'Images', type: 'array' },
    { id: 'inventory_level', label: 'Inventory Level', type: 'number' },
    { id: 'color', label: 'Color', type: 'text' },
    { id: 'size', label: 'Size', type: 'text' },
    { id: 'material', label: 'Material', type: 'text' },
    { id: 'visibility', label: 'Visibility', type: 'boolean' }
  ];
  
  res.json({ attributes });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
