// MySQL-compatible database connection module for Plytix to Lightspeed Integration

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || 'plytix_lightspeed',
  user: process.env.DB_USER || 'plytix_app',
  password: process.env.DB_PASSWORD || 'demo_secure_password',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected successfully');
    connection.release();
    return true;
  } catch (err) {
    console.error('Database connection error:', err);
    return false;
  }
}

// Helper function to execute queries
async function query(sql, params) {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (err) {
    console.error('Query error:', err);
    throw err;
  }
}

// User-related database functions
const users = {
  // Create a new user
  async create(username, email, hashedPassword) {
    const sql = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
    const result = await query(sql, [username, email, hashedPassword]);
    
    // Get the created user
    if (result.insertId) {
      return await this.getById(result.insertId);
    }
    return null;
  },
  
  // Get user by ID
  async getById(id) {
    const sql = 'SELECT id, username, email, created_at FROM users WHERE id = ?';
    const users = await query(sql, [id]);
    return users.length ? users[0] : null;
  },
  
  // Get user by username
  async getByUsername(username) {
    const sql = 'SELECT * FROM users WHERE username = ?';
    const users = await query(sql, [username]);
    return users.length ? users[0] : null;
  },
  
  // Get user by email
  async getByEmail(email) {
    const sql = 'SELECT * FROM users WHERE email = ?';
    const users = await query(sql, [email]);
    return users.length ? users[0] : null;
  }
};

// API credentials-related database functions
const apiCredentials = {
  // Get credentials for a user
  async getByUserId(userId) {
    const sql = 'SELECT * FROM api_credentials WHERE user_id = ?';
    const credentials = await query(sql, [userId]);
    return credentials.length ? credentials[0] : null;
  },
  
  // Save or update credentials
  async saveCredentials(userId, plytixApiKey, plytixApiSecret, lightspeedApiKey, lightspeedApiSecret) {
    // Check if credentials exist
    const existing = await this.getByUserId(userId);
    
    if (existing) {
      // Update existing credentials
      const sql = `
        UPDATE api_credentials 
        SET plytix_api_key = ?, plytix_api_secret = ?, 
            lightspeed_api_key = ?, lightspeed_api_secret = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `;
      await query(sql, [plytixApiKey, plytixApiSecret, lightspeedApiKey, lightspeedApiSecret, userId]);
      return await this.getByUserId(userId);
    } else {
      // Create new credentials
      const sql = `
        INSERT INTO api_credentials 
        (user_id, plytix_api_key, plytix_api_secret, lightspeed_api_key, lightspeed_api_secret)
        VALUES (?, ?, ?, ?, ?)
      `;
      const result = await query(sql, [userId, plytixApiKey, plytixApiSecret, lightspeedApiKey, lightspeedApiSecret]);
      if (result.insertId) {
        return await this.getByUserId(userId);
      }
      return null;
    }
  }
};

// Attribute mapping-related database functions
const attributeMappings = {
  // Get all mappings for a user
  async getByUserId(userId) {
    const sql = 'SELECT * FROM attribute_mappings WHERE user_id = ? ORDER BY id ASC';
    return await query(sql, [userId]);
  },
  
  // Get mapping by ID
  async getById(id, userId) {
    const sql = 'SELECT * FROM attribute_mappings WHERE id = ? AND user_id = ?';
    const mappings = await query(sql, [id, userId]);
    return mappings.length ? mappings[0] : null;
  },
  
  // Create a new mapping
  async create(userId, mappingName, plytixAttribute, lightspeedField, transformationType = 'direct', transformationConfig = null) {
    const sql = `
      INSERT INTO attribute_mappings 
      (user_id, mapping_name, plytix_attribute, lightspeed_field, transformation_type, transformation_config)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    // Convert transformationConfig object to JSON string for MySQL
    const configJson = transformationConfig ? JSON.stringify(transformationConfig) : null;
    
    const result = await query(sql, [userId, mappingName, plytixAttribute, lightspeedField, transformationType, configJson]);
    if (result.insertId) {
      return await this.getById(result.insertId, userId);
    }
    return null;
  },
  
  // Update a mapping
  async update(id, userId, mappingName, plytixAttribute, lightspeedField, transformationType = 'direct', transformationConfig = null) {
    const sql = `
      UPDATE attribute_mappings
      SET mapping_name = ?, plytix_attribute = ?, lightspeed_field = ?, 
          transformation_type = ?, transformation_config = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `;
    
    // Convert transformationConfig object to JSON string for MySQL
    const configJson = transformationConfig ? JSON.stringify(transformationConfig) : null;
    
    await query(sql, [mappingName, plytixAttribute, lightspeedField, transformationType, configJson, id, userId]);
    return await this.getById(id, userId);
  },
  
  // Delete a mapping
  async delete(id, userId) {
    const sql = 'DELETE FROM attribute_mappings WHERE id = ? AND user_id = ?';
    return await query(sql, [id, userId]);
  }
};

// Workflow filter-related database functions
const workflowFilters = {
  // Get filter for a user
  async getByUserId(userId) {
    const sql = 'SELECT * FROM workflow_filters WHERE user_id = ?';
    const filters = await query(sql, [userId]);
    return filters.length ? filters[0] : null;
  },
  
  // Save or update filter
  async saveFilter(userId, attributeName = 'content_workflow', filterValue = '4. Ready to be published', isActive = true) {
    // Check if filter exists
    const existing = await this.getByUserId(userId);
    
    if (existing) {
      // Update existing filter
      const sql = `
        UPDATE workflow_filters 
        SET attribute_name = ?, filter_value = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `;
      await query(sql, [attributeName, filterValue, isActive ? 1 : 0, userId]);
      return await this.getByUserId(userId);
    } else {
      // Create new filter
      const sql = `
        INSERT INTO workflow_filters 
        (user_id, attribute_name, filter_value, is_active)
        VALUES (?, ?, ?, ?)
      `;
      const result = await query(sql, [userId, attributeName, filterValue, isActive ? 1 : 0]);
      if (result.insertId) {
        return await this.getByUserId(userId);
      }
      return null;
    }
  }
};

// Synchronization jobs-related database functions
const syncJobs = {
  // Create a new job
  async create(userId) {
    const sql = 'INSERT INTO sync_jobs (user_id, status) VALUES (?, ?)';
    const result = await query(sql, [userId, 'pending']);
    if (result.insertId) {
      return await this.getById(result.insertId);
    }
    return null;
  },
  
  // Get job by ID
  async getById(id) {
    const sql = 'SELECT * FROM sync_jobs WHERE id = ?';
    const jobs = await query(sql, [id]);
    return jobs.length ? jobs[0] : null;
  },
  
  // Get all jobs for a user
  async getByUserId(userId, limit = 10) {
    const sql = 'SELECT * FROM sync_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?';
    return await query(sql, [userId, limit]);
  },
  
  // Update job status
  async updateStatus(id, status, productsTotal = null, productsSynced = null, productsFailed = null, productsSkipped = null) {
    let sql = 'UPDATE sync_jobs SET status = ?';
    const params = [status];
    
    if (productsTotal !== null) {
      sql += ', products_total = ?';
      params.push(productsTotal);
    }
    
    if (productsSynced !== null) {
      sql += ', products_synced = ?';
      params.push(productsSynced);
    }
    
    if (productsFailed !== null) {
      sql += ', products_failed = ?';
      params.push(productsFailed);
    }
    
    if (productsSkipped !== null) {
      sql += ', products_skipped = ?';
      params.push(productsSkipped);
    }
    
    if (status === 'running' && !sql.includes('start_time')) {
      sql += ', start_time = CURRENT_TIMESTAMP';
    }
    
    if (status === 'completed' || status === 'failed') {
      sql += ', end_time = CURRENT_TIMESTAMP';
    }
    
    sql += ' WHERE id = ?';
    params.push(id);
    
    await query(sql, params);
    return await this.getById(id);
  },
  
  // Add log entry
  async addLog(jobId, logLevel, message, productId = null) {
    const sql = 'INSERT INTO sync_logs (job_id, log_level, message, product_id) VALUES (?, ?, ?, ?)';
    return await query(sql, [jobId, logLevel, message, productId]);
  },
  
  // Get logs for a job
  async getLogs(jobId) {
    const sql = 'SELECT * FROM sync_logs WHERE job_id = ? ORDER BY timestamp ASC';
    return await query(sql, [jobId]);
  }
};

// Synchronization schedule-related database functions
const syncSchedules = {
  // Get schedule for a user
  async getByUserId(userId) {
    const sql = 'SELECT * FROM sync_schedules WHERE user_id = ?';
    const schedules = await query(sql, [userId]);
    return schedules.length ? schedules[0] : null;
  },
  
  // Save or update schedule
  async saveSchedule(userId, frequency, hour, minute, dayOfWeek = null, isActive = true) {
    // Check if schedule exists
    const existing = await this.getByUserId(userId);
    
    if (existing) {
      // Update existing schedule
      const sql = `
        UPDATE sync_schedules 
        SET frequency = ?, day_of_week = ?, hour = ?, minute = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `;
      await query(sql, [frequency, dayOfWeek, hour, minute, isActive ? 1 : 0, userId]);
      return await this.getByUserId(userId);
    } else {
      // Create new schedule
      const sql = `
        INSERT INTO sync_schedules 
        (user_id, frequency, day_of_week, hour, minute, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const result = await query(sql, [userId, frequency, dayOfWeek, hour, minute, isActive ? 1 : 0]);
      if (result.insertId) {
        return await this.getByUserId(userId);
      }
      return null;
    }
  },
  
  // Update last run and next run times
  async updateRunTimes(id, lastRun, nextRun) {
    const sql = 'UPDATE sync_schedules SET last_run = ?, next_run = ? WHERE id = ?';
    await query(sql, [lastRun, nextRun, id]);
    return await this.getById(id);
  },
  
  // Get schedule by ID
  async getById(id) {
    const sql = 'SELECT * FROM sync_schedules WHERE id = ?';
    const schedules = await query(sql, [id]);
    return schedules.length ? schedules[0] : null;
  },
  
  // Get all active schedules
  async getActiveSchedules() {
    const sql = 'SELECT * FROM sync_schedules WHERE is_active = 1';
    return await query(sql, []);
  }
};

// Export the database functions
module.exports = {
  testConnection,
  query,
  users,
  apiCredentials,
  attributeMappings,
  workflowFilters,
  syncJobs,
  syncSchedules
};
