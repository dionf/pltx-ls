const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://jeqxbpozjwltiayznxvy.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplcXhicG96andsdGlheXpueHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1MjU0MzIsImV4cCI6MjA3NDEwMTQzMn0.1czNWEbKlMabFr9qgN8afLPIylj_fs8rl2FqMiSVRR8';

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

class SupabaseDatabase {
  constructor() {
    this.client = supabase;
  }

  // Lightweight pass-through to Supabase query builder so existing code using
  // db.from('table').select(...).eq(...) keeps working
  from(tableName) {
    return this.client.from(tableName);
  }

  // SQLite-compatible methods for easy migration
  get(sql, params, callback) {
    this.executeQuery(sql, params)
      .then(result => {
        if (callback) callback(null, result.rows?.[0] || null);
      })
      .catch(err => {
        if (callback) callback(err, null);
      });
  }

  all(sql, params, callback) {
    this.executeQuery(sql, params)
      .then(result => {
        if (callback) callback(null, result.rows || []);
      })
      .catch(err => {
        if (callback) callback(err, null);
      });
  }

  run(sql, params, callback) {
    this.executeQuery(sql, params)
      .then(result => {
        // Return the result directly for async/await usage
        if (callback) {
          const mockThis = {
            lastID: result.lastInsertRowid,
            changes: result.rowsAffected
          };
          callback(null, mockThis);
        }
        return result;
      })
      .catch(err => {
        if (callback) callback(err, null);
        throw err;
      });
  }

  // Execute raw SQL query using Supabase's direct SQL execution
  async executeQuery(sql, params = []) {
    try {
      // Convert SQLite-style queries to PostgreSQL
      const pgSql = this.convertSQLiteToPostgreSQL(sql, params);
      
      // Use Supabase's direct SQL execution
      const { data, error } = await this.client
        .from('_sql')
        .select('*')
        .limit(1000); // This is a workaround - we'll use direct table operations instead

      if (error) {
        // If direct SQL fails, try to parse the query and use table operations
        return await this.parseAndExecuteQuery(sql, params);
      }

      return {
        rows: data || [],
        lastInsertRowid: data?.[0]?.id || null,
        rowsAffected: data?.length || 0
      };
    } catch (error) {
      console.error('Supabase query error:', error);
      // Fallback to parsing and executing as table operations
      try {
        return await this.parseAndExecuteQuery(sql, params);
      } catch (fallbackError) {
        throw error;
      }
    }
  }

  // Parse SQL query and execute using Supabase table operations
  async parseAndExecuteQuery(sql, params) {
    const upperSql = sql.toUpperCase().trim();
    
    // Handle COUNT queries
    if (upperSql.startsWith('SELECT') && upperSql.includes('COUNT(*)')) {
      return await this.executeCountQuery(sql, params);
    }
    
    // Handle SELECT queries
    if (upperSql.startsWith('SELECT')) {
      const { tableName, filters } = this.parseSelectQuery(sql, params);
      let query = this.client.from(tableName).select('*');
      
      // Apply filters
      for (const key in filters) {
        query = query.eq(key, filters[key]);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      return {
        rows: data || [],
        lastInsertRowid: null,
        rowsAffected: data?.length || 0
      };
    }
    
    // Handle INSERT OR REPLACE (map to UPSERT)
    if (upperSql.startsWith('INSERT OR REPLACE')) {
      const { tableName, values } = this.parseInsertQuery(sql, params);
      const { data, error } = await this.client
        .from(tableName)
        .upsert(values)
        .select();
      if (error) throw error;
      return {
        rows: data || [],
        lastInsertRowid: data?.[0]?.id || null,
        rowsAffected: data?.length || 0
      };
    }

    // Handle INSERT queries
    if (upperSql.startsWith('INSERT')) {
      const { tableName, values } = this.parseInsertQuery(sql, params);
      const { data, error } = await this.client
        .from(tableName)
        .insert(values)
        .select();
      
      if (error) throw error;
      
      return {
        rows: data || [],
        lastInsertRowid: data?.[0]?.id || null,
        rowsAffected: data?.length || 0
      };
    }
    
    // Handle UPDATE queries
    if (upperSql.startsWith('UPDATE')) {
      const { tableName, values, where } = this.parseUpdateQuery(sql, params);
      const { data, error } = await this.client
        .from(tableName)
        .update(values)
        .match(where)
        .select();
      
      if (error) throw error;
      
      return {
        rows: data || [],
        lastInsertRowid: null,
        rowsAffected: data?.length || 0
      };
    }
    
    // Handle DELETE queries
    if (upperSql.startsWith('DELETE')) {
      const { tableName, where } = this.parseDeleteQuery(sql, params);
      const { data, error } = await this.client
        .from(tableName)
        .delete()
        .match(where)
        .select();
      
      if (error) throw error;
      
      return {
        rows: data || [],
        lastInsertRowid: null,
        rowsAffected: data?.length || 0
      };
    }
    
    // Handle CREATE TABLE statements (ignore silently in Supabase)
    if (upperSql.startsWith('CREATE TABLE')) {
      if (process.env.SHOW_SUPABASE_SCHEMA_WARNINGS === '1') {
        console.warn('CREATE TABLE statement ignored (tables already exist in Supabase)');
      }
      return {
        rows: [],
        lastInsertRowid: null,
        rowsAffected: 0
      };
    }
    
    throw new Error(`Unsupported query type: ${sql}`);
  }

  // Extract table name from SQL query
  extractTableName(sql) {
    const match = sql.match(/FROM\s+(\w+)/i);
    return match ? match[1] : 'products';
  }

  // Parse SELECT query and extract table name and filters
  parseSelectQuery(sql, params) {
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    const tableName = fromMatch ? fromMatch[1] : 'products';
    
    const whereMatch = sql.match(/WHERE\s+(.+)/i);
    const filters = {};
    
    if (whereMatch) {
      const whereClause = whereMatch[1];
      const conditions = whereClause.split(/\s+AND\s+/i);
      let paramIndex = 0;
      
      conditions.forEach(condition => {
        const eqMatch = condition.match(/(\w+)\s*=\s*(\?|\$\d+)/);
        if (eqMatch) {
          filters[eqMatch[1]] = params[paramIndex++];
        }
      });
    }
    
    return { tableName, filters };
  }

  // Execute COUNT queries directly with Supabase
  async executeCountQuery(sql, params = []) {
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (!fromMatch) {
      throw new Error('No table found in COUNT query');
    }
    
    const tableName = fromMatch[1];
    const whereMatch = sql.match(/WHERE\s+(.+)/i);
    
    let query = this.client.from(tableName).select('*', { count: 'exact', head: true });
    
    if (whereMatch) {
      const whereClause = whereMatch[1];
      const conditions = whereClause.split(/\s+AND\s+/i);
      let paramIndex = 0;
      
      conditions.forEach(condition => {
        const eqMatch = condition.match(/(\w+)\s*=\s*(\?|\$\d+)/);
        if (eqMatch) {
          query = query.eq(eqMatch[1], params[paramIndex++]);
        }
      });
    }
    
    const { count, error } = await query;
    if (error) throw error;
    
    return {
      rows: [{ c: count }],
      lastInsertRowid: null,
      rowsAffected: 0
    };
  }

  // Parse INSERT query
  parseInsertQuery(sql, params) {
    const tableMatch = sql.match(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(\w+)/i);
    const columnsMatch = sql.match(/\(([^)]+)\)/);
    const valuesMatch = sql.match(/VALUES\s*\(([^)]+)\)/);
    
    if (!tableMatch || !columnsMatch || !valuesMatch) {
      throw new Error('Invalid INSERT query');
    }
    
    const tableName = tableMatch[1];
    const columns = columnsMatch[1].split(',').map(col => col.trim());
    const values = valuesMatch[1].split(',').map(val => val.trim());
    
    const result = {};
    columns.forEach((col, index) => {
      let value = values[index];
      if (value === '?') {
        value = params.shift();
      }
      result[col] = value;
    });
    
    return { tableName, values: result };
  }

  // Parse UPDATE query
  parseUpdateQuery(sql, params) {
    const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
    const setMatch = sql.match(/SET\s+([^WHERE]+)/i);
    const whereMatch = sql.match(/WHERE\s+(.+)/i);
    
    if (!tableMatch || !setMatch) {
      throw new Error('Invalid UPDATE query');
    }
    
    const tableName = tableMatch[1];
    const setClause = setMatch[1];
    const whereClause = whereMatch ? whereMatch[1] : '';
    
    // Parse SET clause
    const values = {};
    const setPairs = setClause.split(',');
    setPairs.forEach(pair => {
      const [key, value] = pair.split('=').map(s => s.trim());
      if (value === '?') {
        values[key] = params.shift();
      } else if (value) {
        values[key] = value.replace(/['"]/g, '');
      }
    });
    
    // Parse WHERE clause
    const where = {};
    if (whereClause) {
      const wherePairs = whereClause.split('AND');
      wherePairs.forEach(pair => {
        const [key, value] = pair.split('=').map(s => s.trim());
        if (value === '?') {
          where[key] = params.shift();
        } else {
          where[key] = value.replace(/['"]/g, '');
        }
      });
    }
    
    return { tableName, values, where };
  }

  // Parse DELETE query
  parseDeleteQuery(sql, params) {
    const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    const whereMatch = sql.match(/WHERE\s+(.+)/i);
    
    if (!tableMatch) {
      throw new Error('Invalid DELETE query');
    }
    
    const tableName = tableMatch[1];
    const where = {};
    
    if (whereMatch) {
      const whereClause = whereMatch[1];
      const wherePairs = whereClause.split('AND');
      wherePairs.forEach(pair => {
        const [key, value] = pair.split('=').map(s => s.trim());
        if (value === '?') {
          where[key] = params.shift();
        } else {
          where[key] = value.replace(/['"]/g, '');
        }
      });
    }
    
    return { tableName, where };
  }

  // Convert SQLite syntax to PostgreSQL
  convertSQLiteToPostgreSQL(sql, params) {
    let pgSql = sql;
    
    // Replace SQLite-specific syntax with PostgreSQL equivalents
    pgSql = pgSql.replace(/AUTOINCREMENT/gi, 'SERIAL');
    pgSql = pgSql.replace(/INTEGER PRIMARY KEY/gi, 'SERIAL PRIMARY KEY');
    pgSql = pgSql.replace(/DATETIME/gi, 'TIMESTAMP');
    pgSql = pgSql.replace(/TEXT/gi, 'TEXT');
    
    // Handle parameter placeholders (? -> $1, $2, etc.)
    let paramIndex = 1;
    pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
    
    return pgSql;
  }

  // Batch operations
  async batch(operations) {
    try {
      const results = [];
      for (const op of operations) {
        const result = await this.executeQuery(op.sql, op.args);
        results.push(result);
      }
      return results;
    } catch (error) {
      console.error('Supabase batch error:', error);
      throw error;
    }
  }

  // Close method (no-op for Supabase)
  close() {
    // No-op for Supabase client
  }
}

// Create singleton instance
let dbInstance = null;

function getSupabaseDatabase() {
  if (!dbInstance) {
    dbInstance = new SupabaseDatabase();
  }
  return dbInstance;
}

module.exports = { SupabaseDatabase, getSupabaseDatabase };
