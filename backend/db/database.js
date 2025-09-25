const { getDatabase } = require('./connection');

class Database {
  constructor() {
    this.isSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY;
    this.isTurso = process.env.TURSO_DATABASE_URL || process.env.NODE_ENV === 'production';
    // Don't initialize database in constructor - do it per operation
  }

  getDatabase() {
    // Always get a fresh database connection for each operation
    return getDatabase();
  }

  // SQLite-style methods for backward compatibility
  get(sql, params, callback) {
    const db = this.getDatabase();
    if (this.isSupabase) {
      db.get(sql, params, callback);
    } else if (this.isTurso) {
      db.execute({ sql, args: params || [] })
        .then(result => {
          if (callback) callback(null, result.rows[0] || null);
        })
        .catch(err => {
          if (callback) callback(err, null);
        });
    } else {
      db.get(sql, params, callback);
    }
  }

  all(sql, params, callback) {
    const db = this.getDatabase();
    if (this.isSupabase) {
      db.all(sql, params, callback);
    } else if (this.isTurso) {
      db.execute({ sql, args: params || [] })
        .then(result => {
          if (callback) callback(null, result.rows || []);
        })
        .catch(err => {
          if (callback) callback(err, null);
        });
    } else {
      db.all(sql, params, callback);
    }
  }

  run(sql, params, callback) {
    const db = this.getDatabase();
    if (this.isSupabase) {
      db.run(sql, params, callback);
    } else if (this.isTurso) {
      db.execute({ sql, args: params || [] })
        .then(result => {
          // Create SQLite-compatible result object
          const mockThis = {
            lastID: result.lastInsertRowid,
            changes: result.rowsAffected
          };
          if (callback) callback(null, mockThis);
        })
        .catch(err => {
          if (callback) callback(err, null);
        });
    } else {
      db.run(sql, params, function(err) {
        if (callback) callback(err, this);
      });
    }
  }

  // Batch operations for better performance
  batch(operations) {
    const db = this.getDatabase();
    if (this.isSupabase) {
      return db.batch(operations);
    } else if (this.isTurso) {
      return Promise.all(operations.map(op => 
        db.execute({ sql: op.sql, args: op.args || [] })
      ));
    } else {
      // For SQLite, execute sequentially
      return new Promise((resolve, reject) => {
        const results = [];
        let index = 0;
        
        const next = () => {
          if (index >= operations.length) {
            resolve(results);
            return;
          }
          
          const op = operations[index];
          this.run(op.sql, op.args, (err, result) => {
            if (err) {
              reject(err);
              return;
            }
            results.push(result);
            index++;
            next();
          });
        };
        
        next();
      });
    }
  }

  // Close method (only for SQLite) - not needed anymore since we get fresh connections
  close() {
    // No-op since we get fresh connections for each operation
  }
}

// Create singleton instance
let dbInstance = null;

function getDatabaseWrapper() {
  if (!dbInstance) {
    dbInstance = new Database();
  }
  return dbInstance;
}

module.exports = { Database, getDatabaseWrapper };
