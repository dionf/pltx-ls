const { getDatabase } = require('./connection');

class DatabaseAdapter {
  constructor() {
    this.db = getDatabase();
    this.isTurso = process.env.TURSO_DATABASE_URL || process.env.NODE_ENV === 'production';
  }

  // Generic query method
  async query(sql, params = []) {
    if (this.isTurso) {
      return await this.db.execute({ sql, args: params });
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve({ rows: rows || [] });
        });
      });
    }
  }

  // Get single row
  async get(sql, params = []) {
    if (this.isTurso) {
      const result = await this.db.execute({ sql, args: params });
      return result.rows[0] || null;
    } else {
      return new Promise((resolve, reject) => {
        this.db.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        });
      });
    }
  }

  // Run (INSERT, UPDATE, DELETE)
  async run(sql, params = []) {
    if (this.isTurso) {
      return await this.db.execute({ sql, args: params });
    } else {
      return new Promise((resolve, reject) => {
        this.db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ 
            lastID: this.lastID, 
            changes: this.changes,
            rowsAffected: this.changes 
          });
        });
      });
    }
  }

  // Close connection (only for SQLite)
  close() {
    if (!this.isTurso && this.db.close) {
      this.db.close();
    }
  }

  // Batch operations
  async batch(operations) {
    if (this.isTurso) {
      const results = [];
      for (const op of operations) {
        const result = await this.db.execute({ sql: op.sql, args: op.params || [] });
        results.push(result);
      }
      return results;
    } else {
      // For SQLite, we'll use transactions
      return new Promise((resolve, reject) => {
        this.db.serialize(() => {
          this.db.run('BEGIN TRANSACTION');
          
          const results = [];
          let completed = 0;
          
          operations.forEach((op, index) => {
            this.db.run(op.sql, op.params || [], function(err) {
              if (err) {
                this.db.run('ROLLBACK');
                reject(err);
                return;
              }
              
              results[index] = {
                lastID: this.lastID,
                changes: this.changes,
                rowsAffected: this.changes
              };
              
              completed++;
              if (completed === operations.length) {
                this.db.run('COMMIT', (err) => {
                  if (err) reject(err);
                  else resolve(results);
                });
              }
            });
          });
        });
      });
    }
  }
}

module.exports = DatabaseAdapter;

