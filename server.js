require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ensureUserDataset } = require('./seedDataset');

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Serve static files but NOT with catch-all so login.html etc. resolve correctly
app.use(express.static(path.join(__dirname, 'public')));

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // Also accept token as query param (for form-based CSV export)
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

// Auto-seed middleware for Dhanush user to ensure full dataset exists
function ensureDhanushData(req, res, next) {
  if (req.user && req.user.email && req.user.email.toLowerCase().includes('dhanush')) {
    const email = req.user.email.toLowerCase().trim();
    db.get('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?', [email], (uErr, userRow) => {
      if (userRow) {
        req.user.id = userRow.id;
        ensureUserDataset(db, userRow.id, () => next());
      } else {
        db.run(
          'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
          [req.user.name || 'DHANUSH G', req.user.email, 'oauth_placeholder'],
          function (insErr) {
            const newId = this.lastID || req.user.id;
            req.user.id = newId;
            ensureUserDataset(db, newId, () => next());
          }
        );
      }
    });
  } else {
    next();
  }
}

// Database setup
const isVercel = process.env.VERCEL === '1' || process.env.NOW_REGION;
const dbPath = isVercel ? '/tmp/moneyflow.db' : path.join(__dirname, 'moneyflow.db');

let sqlite3 = null;
let db = null;

try {
  sqlite3 = require('sqlite3').verbose();

  if (isVercel && !fs.existsSync(dbPath)) {
    const seedDb = path.join(__dirname, 'moneyflow.db');
    if (fs.existsSync(seedDb)) {
      try {
        fs.copyFileSync(seedDb, dbPath);
      } catch (e) {
        console.error('Error copying seed database to /tmp:', e);
      }
    }
  }

  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
    } else {
      console.log('Connected to SQLite database at:', dbPath);
      initializeDatabase();
    }
  });
} catch (loadErr) {
  console.warn('⚠️ SQLite3 native module could not be initialized:', loadErr.message);
  // Create safe dummy db object if sqlite3 fails in serverless
  db = {
    get: (sql, params, cb) => (typeof params === 'function' ? params : cb)(null, null),
    all: (sql, params, cb) => (typeof params === 'function' ? params : cb)(null, []),
    run: (sql, params, cb) => (typeof params === 'function' ? params : cb)(null),
    serialize: (fn) => fn && fn()
  };
}

function initializeDatabase() {
  db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Accounts table (scoped to user)
    db.run(`CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      UNIQUE(name, user_id)
    )`);

    // Migrate accounts table if it was created with global unique constraint on name
    db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='accounts'", (err, row) => {
      if (!err && row && row.sql && row.sql.includes('name TEXT NOT NULL UNIQUE')) {
        console.log('Migrating accounts table to composite UNIQUE(name, user_id)...');
        db.serialize(() => {
          db.run('PRAGMA foreign_keys=off');
          db.run(`CREATE TABLE accounts_temp (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(name, user_id)
          )`);
          db.run(`INSERT INTO accounts_temp (id, name, user_id, created_at) SELECT id, name, user_id, created_at FROM accounts`);
          db.run(`DROP TABLE accounts`);
          db.run(`ALTER TABLE accounts_temp RENAME TO accounts`);
          db.run('PRAGMA foreign_keys=on');
          console.log('Accounts table migrated successfully.');
        });
      }
    });

    // Categories table (global, shared)
    db.run(`CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#7c6af7',
      icon TEXT DEFAULT '📌',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Transactions — scoped by account (which belongs to user)
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      account_id INTEGER NOT NULL,
      category_id INTEGER,
      reason TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('in', 'out')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts (id),
      FOREIGN KEY (category_id) REFERENCES categories (id)
    )`);

    // Budgets table
    db.run(`CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER,
      amount REAL NOT NULL,
      period TEXT DEFAULT 'monthly' CHECK(period IN ('weekly', 'monthly', 'yearly')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (category_id) REFERENCES categories (id)
    )`);

    // Recurring transactions table
    db.run(`CREATE TABLE IF NOT EXISTS recurring_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      account_id INTEGER NOT NULL,
      category_id INTEGER,
      reason TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('in', 'out')),
      frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
      next_date TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (account_id) REFERENCES accounts (id),
      FOREIGN KEY (category_id) REFERENCES categories (id)
    )`);

    // Savings goals table
    db.run(`CREATE TABLE IF NOT EXISTS savings_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL DEFAULT 0,
      target_date TEXT,
      color TEXT DEFAULT '#10b981',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Add columns if they do not exist (migrations)
    db.run(`ALTER TABLE budgets ADD COLUMN user_id INTEGER REFERENCES users(id)`, () => { });
    db.run(`ALTER TABLE recurring_transactions ADD COLUMN user_id INTEGER REFERENCES users(id)`, () => { });
    db.run(`ALTER TABLE transactions ADD COLUMN is_transfer BOOLEAN DEFAULT 0`, () => { });
    db.run(`ALTER TABLE transactions ADD COLUMN transfer_account_id INTEGER REFERENCES accounts(id)`, () => { });
    db.run(`ALTER TABLE transactions ADD COLUMN related_transaction_id INTEGER REFERENCES transactions(id)`, () => { });

    // Performance Indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_goals_user ON savings_goals(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_transactions(user_id)`);

    console.log('Database initialized successfully');

    // Insert default categories if none exist
    db.get('SELECT COUNT(*) as count FROM categories', (err, row) => {
      if (!err && row.count === 0) {
        const defaultCategories = [
          { name: 'Food & Dining', color: '#f76a8a', icon: '🍔' },
          { name: 'Transportation', color: '#7c6af7', icon: '🚗' },
          { name: 'Shopping', color: '#5ef5c0', icon: '🛍️' },
          { name: 'Entertainment', color: '#fbbf24', icon: '🎮' },
          { name: 'Bills & Utilities', color: '#ef4444', icon: '💡' },
          { name: 'Healthcare', color: '#10b981', icon: '🏥' },
          { name: 'Salary', color: '#22c55e', icon: '💰' },
          { name: 'Investment', color: '#8b5cf6', icon: '📈' },
          { name: 'Education', color: '#06b6d4', icon: '📚' },
          { name: 'Travel', color: '#f59e0b', icon: '✈️' }
        ];

        const stmt = db.prepare('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)');
        defaultCategories.forEach(cat => stmt.run(cat.name, cat.color, cat.icon));
        stmt.finalize();
        console.log('Default categories created');
      }
    });
  });
}

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

app.post(['/api/auth/signup', '/api/auth/register'], async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  try {
    db.get('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?', [cleanEmail], async (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (row) return res.status(400).json({ error: 'User already exists with this email' });

      try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
          'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
          [cleanName, cleanEmail, hashedPassword],
          function (err) {
            if (err) return res.status(500).json({ error: 'Failed to create user' });

            const userId = this.lastID;

            // Provision default accounts for new user
            const defaultAccounts = ['Cash', 'Bank / GPay', 'Card'];
            let completed = 0;

            const sendResponse = () => {
              const token = jwt.sign({ id: userId, email: cleanEmail, name: cleanName }, JWT_SECRET, { expiresIn: '7d' });
              res.status(201).json({
                message: 'User created successfully',
                token,
                user: { id: userId, name: cleanName, email: cleanEmail }
              });
            };

            defaultAccounts.forEach(accName => {
              db.run('INSERT OR IGNORE INTO accounts (name, user_id) VALUES (?, ?)', [accName, userId], () => {
                completed++;
                if (completed === defaultAccounts.length) {
                  sendResponse();
                }
              });
            });
          }
        );
      } catch (hashErr) {
        console.error('Hash error:', hashErr);
        res.status(500).json({ error: 'Server error during registration' });
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    db.get('SELECT * FROM users WHERE LOWER(TRIM(email)) = ?', [cleanEmail], async (err, user) => {
      if (err) {
        console.error('DB error during login:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      try {
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign(
          { id: user.id, email: user.email, name: user.name },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

        res.json({
          message: 'Login successful',
          token,
          user: { id: user.id, name: user.name, email: user.email }
        });
      } catch (bcryptErr) {
        console.error('Bcrypt compare error:', bcryptErr);
        res.status(500).json({ error: 'Authentication error' });
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }

});

app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
  });
});

app.post('/api/auth/google', async (req, res) => {
  const { email, name, avatar } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required for Google authentication' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = (name && name.trim()) || cleanEmail.split('@')[0];

  try {
    db.get('SELECT * FROM users WHERE LOWER(TRIM(email)) = ?', [cleanEmail], async (err, user) => {
      if (err) {
        console.error('DB error during Google auth:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (user) {
        const sendExistingUser = () => {
          const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name },
            JWT_SECRET,
            { expiresIn: '7d' }
          );

          return res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, name: user.name, email: user.email }
          });
        };

        if (cleanEmail.includes('dhanush')) {
          ensureUserDataset(db, user.id, sendExistingUser);
        } else {
          sendExistingUser();
        }
        return;
      }

      // User does not exist, create new user
      const randomPassword = Math.random().toString(36).slice(-10) + 'A1!';
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      db.run(
        'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
        [cleanName, cleanEmail, hashedPassword],
        function (insertErr) {
          if (insertErr) {
            // Handle race condition if concurrent request already inserted the user
            db.get('SELECT * FROM users WHERE LOWER(TRIM(email)) = ?', [cleanEmail], (findErr, existingUser) => {
              if (existingUser) {
                const sendAfterRace = () => {
                  const token = jwt.sign(
                    { id: existingUser.id, email: existingUser.email, name: existingUser.name },
                    JWT_SECRET,
                    { expiresIn: '7d' }
                  );
                  return res.json({
                    message: 'Login successful',
                    token,
                    user: { id: existingUser.id, name: existingUser.name, email: existingUser.email }
                  });
                };
                if (cleanEmail.includes('dhanush')) {
                  ensureUserDataset(db, existingUser.id, sendAfterRace);
                } else {
                  sendAfterRace();
                }
                return;
              }
              console.error('Error creating Google user:', insertErr);
              return res.status(500).json({ error: 'Failed to create user account' });
            });
            return;
          }

          const userId = this.lastID;

          const respond = () => {
            const token = jwt.sign(
              { id: userId, email: cleanEmail, name: cleanName },
              JWT_SECRET,
              { expiresIn: '7d' }
            );

            res.status(201).json({
              message: 'User registered and logged in with Google',
              token,
              user: { id: userId, name: cleanName, email: cleanEmail }
            });
          };

          if (cleanEmail.includes('dhanush')) {
            ensureUserDataset(db, userId, respond);
            return;
          }

          // Provision default accounts for new user
          const defaultAccounts = ['Cash', 'Bank / GPay', 'Card'];
          let completed = 0;

          defaultAccounts.forEach(accName => {
            db.run('INSERT OR IGNORE INTO accounts (name, user_id) VALUES (?, ?)', [accName, userId], () => {
              completed++;
              if (completed === defaultAccounts.length) {
                respond();
              }
            });
          });
        }
      );
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Server error during Google authentication' });
  }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ message: 'Token is valid', user: req.user });
});

// ─── USER PROFILE & SETTINGS ─────────────────────────────────────────────────


// Get current user profile
app.get('/api/user/profile', authenticateToken, (req, res) => {
  db.get(
    'SELECT id, name, email, created_at FROM users WHERE id = ? OR LOWER(TRIM(email)) = LOWER(TRIM(?))',
    [req.user.id || 0, req.user.email || ''],
    (err, user) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!user) {
        return res.json({
          id: req.user.id || 1,
          name: req.user.name || 'User',
          email: req.user.email || '',
          created_at: new Date().toISOString()
        });
      }
      res.json(user);
    }
  );
});

// Update user profile (name, email)
app.put('/api/user/profile', authenticateToken, (req, res) => {
  const { name, email } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!email || !email.trim()) return res.status(400).json({ error: 'Email is required' });

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  db.get('SELECT id FROM users WHERE email = ? AND id != ?', [cleanEmail, req.user.id], (err, existing) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (existing) return res.status(400).json({ error: 'Email is already taken by another account' });

    db.run(
      'UPDATE users SET name = ?, email = ? WHERE id = ?',
      [cleanName, cleanEmail, req.user.id],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to update profile' });

        const token = jwt.sign(
          { id: req.user.id, email: cleanEmail, name: cleanName },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

        res.json({
          message: 'Profile updated successfully',
          token,
          user: { id: req.user.id, name: cleanName, email: cleanEmail }
        });
      }
    );
  });
});

// Update user password
app.put('/api/user/password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  try {
    db.get('SELECT password FROM users WHERE id = ?', [req.user.id], async (err, user) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      const hashed = await bcrypt.hash(newPassword, 10);
      db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id], function (err) {
        if (err) return res.status(500).json({ error: 'Failed to update password' });
        res.json({ message: 'Password updated successfully' });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── ACCOUNTS ─────────────────────────────────────────────────────────────────

// Get all accounts for current user
app.get('/api/accounts', authenticateToken, ensureDhanushData, (req, res) => {
  db.all(
    'SELECT * FROM accounts WHERE user_id = ? ORDER BY id',
    [req.user.id],
    (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json(rows || [])
  );
});

// Create new account
app.post('/api/accounts', authenticateToken, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Account name is required' });
  const cleanName = name.trim().toUpperCase();

  db.get(
    'SELECT id FROM accounts WHERE UPPER(name) = ? AND user_id = ?',
    [cleanName, req.user.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row) return res.status(400).json({ error: 'Account name already exists' });

      db.run(
        'INSERT INTO accounts (name, user_id) VALUES (?, ?)',
        [cleanName, req.user.id],
        function (err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed'))
              return res.status(400).json({ error: 'Account name already exists' });
            return res.status(500).json({ error: err.message });
          }
          res.json({ id: this.lastID, name: cleanName, user_id: req.user.id });
        }
      );
    }
  );
});

// Update account
app.put('/api/accounts/:id', authenticateToken, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Account name is required' });
  const cleanName = name.trim().toUpperCase();

  db.get(
    'SELECT id FROM accounts WHERE UPPER(name) = ? AND user_id = ? AND id != ?',
    [cleanName, req.user.id, req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row) return res.status(400).json({ error: 'Account name already exists' });

      db.run(
        'UPDATE accounts SET name = ? WHERE id = ? AND user_id = ?',
        [cleanName, req.params.id, req.user.id],
        function (err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed'))
              return res.status(400).json({ error: 'Account name already exists' });
            return res.status(500).json({ error: err.message });
          }
          if (this.changes === 0) return res.status(404).json({ error: 'Account not found' });
          res.json({ id: req.params.id, name: cleanName });
        }
      );
    }
  );
});

// Delete account (only if it has no transactions)
app.delete('/api/accounts/:id', authenticateToken, (req, res) => {
  const accountId = req.params.id;

  // First verify account belongs to user
  db.get(
    'SELECT id FROM accounts WHERE id = ? AND user_id = ?',
    [accountId, req.user.id],
    (err, account) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!account) return res.status(404).json({ error: 'Account not found' });

      db.get(
        'SELECT COUNT(*) as count FROM transactions WHERE account_id = ?',
        [accountId],
        (err, row) => {
          if (err) return res.status(500).json({ error: err.message });
          if (row.count > 0)
            return res.status(400).json({ error: 'Cannot delete account with existing transactions' });

          db.run(
            'DELETE FROM accounts WHERE id = ? AND user_id = ?',
            [accountId, req.user.id],
            function (err) {
              if (err) return res.status(500).json({ error: err.message });
              res.json({ message: 'Account deleted successfully' });
            }
          );
        }
      );
    }
  );
});

// ─── CATEGORIES ───────────────────────────────────────────────────────────────

// Get all categories
app.get('/api/categories', authenticateToken, (req, res) => {
  db.all('SELECT * FROM categories ORDER BY name', (err, rows) =>
    err ? res.status(500).json({ error: err.message }) : res.json(rows)
  );
});

// Create new category
app.post('/api/categories', authenticateToken, (req, res) => {
  const { name, color, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  db.run(
    'INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)',
    [name, color || '#7c6af7', icon || '📌'],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed'))
          return res.status(400).json({ error: 'Category name already exists' });
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, name, color: color || '#7c6af7', icon: icon || '📌' });
    }
  );
});

// Update category
app.put('/api/categories/:id', authenticateToken, (req, res) => {
  const { name, color, icon } = req.body;
  if (!name || !color || !icon)
    return res.status(400).json({ error: 'Name, color, and icon are required' });

  db.run(
    'UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?',
    [name, color, icon, req.params.id],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed'))
          return res.status(400).json({ error: 'Category name already exists' });
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) return res.status(404).json({ error: 'Category not found' });
      res.json({ id: req.params.id, name, color, icon });
    }
  );
});

// Delete category
app.delete('/api/categories/:id', authenticateToken, (req, res) => {
  const categoryId = req.params.id;

  // Remove category from transactions first
  db.run('UPDATE transactions SET category_id = NULL WHERE category_id = ?', [categoryId], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    db.run('DELETE FROM categories WHERE id = ?', [categoryId], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Category not found' });
      res.json({ message: 'Category deleted successfully' });
    });
  });
});

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

// Get all transactions for current user with optional search, filters, and pagination
app.get('/api/transactions', authenticateToken, ensureDhanushData, (req, res) => {
  const { startDate, endDate, categoryId, accountId, type, search, limit, offset, sort = 'desc' } = req.query;
  let query = `
    SELECT t.*, a.name as account_name, c.name as category_name,
           c.color as category_color, c.icon as category_icon,
           ta.name as transfer_account_name
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts ta ON t.transfer_account_id = ta.id
    WHERE a.user_id = ?
  `;
  const params = [req.user.id];

  if (startDate) { query += ' AND t.date >= ?'; params.push(startDate); }
  if (endDate) { query += ' AND t.date <= ?'; params.push(endDate); }
  if (categoryId) { query += ' AND t.category_id = ?'; params.push(categoryId); }
  if (accountId) { query += ' AND t.account_id = ?'; params.push(accountId); }
  if (type === 'in' || type === 'out') { query += ' AND t.type = ?'; params.push(type); }
  if (type === 'transfer') { query += ' AND t.is_transfer = 1'; }
  if (search && search.trim()) {
    query += ' AND (LOWER(t.reason) LIKE ? OR LOWER(a.name) LIKE ? OR LOWER(COALESCE(c.name, "")) LIKE ?)';
    const sTerm = `%${search.trim().toLowerCase()}%`;
    params.push(sTerm, sTerm, sTerm);
  }

  const orderDir = String(sort).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  query += ` ORDER BY t.date ${orderDir}, t.created_at ${orderDir}`;

  if (limit && !isNaN(parseInt(limit, 10))) {
    query += ' LIMIT ?';
    params.push(parseInt(limit, 10));
    if (offset && !isNaN(parseInt(offset, 10))) {
      query += ' OFFSET ?';
      params.push(parseInt(offset, 10));
    }
  }

  db.all(query, params, (err, rows) =>
    err ? res.status(500).json({ error: err.message }) : res.json(rows)
  );
});

// Create new transaction (only for user's own accounts)
app.post('/api/transactions', authenticateToken, (req, res) => {
  const { date, account_id, category_id, reason, amount, type } = req.body;

  if (!date || !account_id || !reason || amount === undefined || !type)
    return res.status(400).json({ error: 'All required fields must be provided' });

  const cleanAmount = Math.round(parseFloat(amount) * 100) / 100;
  if (isNaN(cleanAmount) || cleanAmount <= 0)
    return res.status(400).json({ error: 'Amount must be a positive number' });

  if (type !== 'in' && type !== 'out')
    return res.status(400).json({ error: "Type must be either 'in' or 'out'" });

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Date must be formatted as YYYY-MM-DD' });
  }

  // Verify account belongs to user
  db.get(
    'SELECT id, name FROM accounts WHERE id = ? AND user_id = ?',
    [account_id, req.user.id],
    (err, account) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!account) return res.status(403).json({ error: 'Account not found or access denied' });

      db.run(
        'INSERT INTO transactions (date, account_id, category_id, reason, amount, type) VALUES (?, ?, ?, ?, ?, ?)',
        [date, account_id, category_id || null, reason.trim(), cleanAmount, type],
        function (insErr) {
          if (insErr) return res.status(500).json({ error: insErr.message });
          res.status(201).json({
            id: this.lastID,
            date,
            account_id: parseInt(account_id, 10),
            account_name: account.name,
            category_id: category_id ? parseInt(category_id, 10) : null,
            reason: reason.trim(),
            amount: cleanAmount,
            type
          });
        }
      );
    }
  );
});

// Delete transaction (only user's own, handles transfers atomically)
app.delete('/api/transactions/:id', authenticateToken, (req, res) => {
  db.get(
    `SELECT t.id, t.is_transfer, t.related_transaction_id FROM transactions t
     JOIN accounts a ON t.account_id = a.id
     WHERE t.id = ? AND a.user_id = ?`,
    [req.params.id, req.user.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Transaction not found or access denied' });

      if (row.is_transfer && row.related_transaction_id) {
        db.run('DELETE FROM transactions WHERE id IN (?, ?)', [row.id, row.related_transaction_id], function (delErr) {
          if (delErr) return res.status(500).json({ error: delErr.message });
          res.json({ message: 'Transfer transactions deleted successfully' });
        });
      } else {
        db.run('DELETE FROM transactions WHERE id = ?', [req.params.id], function (delErr) {
          if (delErr) return res.status(500).json({ error: delErr.message });
          res.json({ message: 'Transaction deleted successfully' });
        });
      }
    }
  );
});

// Update transaction (only user's own)
app.put('/api/transactions/:id', authenticateToken, (req, res) => {
  const { date, account_id, category_id, reason, amount, type } = req.body;

  if (!date || !account_id || !reason || amount === undefined || !type) {
    return res.status(400).json({ error: 'All required fields must be provided' });
  }
  const cleanAmount = Math.round(parseFloat(amount) * 100) / 100;
  if (isNaN(cleanAmount) || cleanAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }
  if (type !== 'in' && type !== 'out') {
    return res.status(400).json({ error: "Type must be either 'in' or 'out'" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Date must be formatted as YYYY-MM-DD' });
  }

  // 1. Verify transaction exists and belongs to user
  db.get(
    `SELECT t.id, t.is_transfer, t.related_transaction_id FROM transactions t
     JOIN accounts a ON t.account_id = a.id
     WHERE t.id = ? AND a.user_id = ?`,
    [req.params.id, req.user.id],
    (err, txRow) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!txRow) return res.status(404).json({ error: 'Transaction not found or access denied' });

      // 2. Verify target account belongs to user
      db.get(
        'SELECT id, name FROM accounts WHERE id = ? AND user_id = ?',
        [account_id, req.user.id],
        (accErr, accRow) => {
          if (accErr) return res.status(500).json({ error: accErr.message });
          if (!accRow) return res.status(403).json({ error: 'Account not found or access denied' });

          db.run(
            `UPDATE transactions
             SET date = ?, account_id = ?, category_id = ?, reason = ?, amount = ?, type = ?
             WHERE id = ?`,
            [date, account_id, category_id ? parseInt(category_id, 10) : null, reason.trim(), cleanAmount, type, req.params.id],
            function (updateErr) {
              if (updateErr) return res.status(500).json({ error: updateErr.message });

              if (txRow.is_transfer && txRow.related_transaction_id) {
                db.run('UPDATE transactions SET amount = ?, date = ? WHERE id = ?', [cleanAmount, date, txRow.related_transaction_id]);
              }

              res.json({
                id: parseInt(req.params.id, 10),
                date,
                account_id: parseInt(account_id, 10),
                account_name: accRow.name,
                category_id: category_id ? parseInt(category_id, 10) : null,
                reason: reason.trim(),
                amount: cleanAmount,
                type
              });
            }
          );
        }
      );
    }
  );
});

// ─── TRANSFERS ────────────────────────────────────────────────────────────────

// Transfer money between two accounts belonging to the current user
app.post('/api/transfers', authenticateToken, (req, res) => {
  const { date, from_account_id, to_account_id, amount, reason } = req.body;

  if (!date || !from_account_id || !to_account_id || amount === undefined) {
    return res.status(400).json({ error: 'Date, source account, destination account, and amount are required' });
  }

  const cleanAmount = Math.round(parseFloat(amount) * 100) / 100;
  if (isNaN(cleanAmount) || cleanAmount <= 0) {
    return res.status(400).json({ error: 'Transfer amount must be a positive number' });
  }

  if (parseInt(from_account_id, 10) === parseInt(to_account_id, 10)) {
    return res.status(400).json({ error: 'Cannot transfer money to the same account' });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Date must be formatted as YYYY-MM-DD' });
  }

  const transferReason = (reason && reason.trim()) || 'Transfer';

  // Verify both accounts belong to user
  db.all(
    'SELECT id, name FROM accounts WHERE id IN (?, ?) AND user_id = ?',
    [from_account_id, to_account_id, req.user.id],
    (accErr, accRows) => {
      if (accErr) return res.status(500).json({ error: accErr.message });
      if (!accRows || accRows.length !== 2) {
        return res.status(403).json({ error: 'One or both accounts were not found or access denied' });
      }

      const fromAcc = accRows.find(a => a.id === parseInt(from_account_id, 10));
      const toAcc = accRows.find(a => a.id === parseInt(to_account_id, 10));

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Leg 1: Outflow from source account
        db.run(
          `INSERT INTO transactions (date, account_id, category_id, reason, amount, type, is_transfer, transfer_account_id)
           VALUES (?, ?, NULL, ?, ?, 'out', 1, ?)`,
          [date, fromAcc.id, `${transferReason} (To ${toAcc.name})`, cleanAmount, toAcc.id],
          function (err1) {
            if (err1) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Failed to record withdrawal leg: ' + err1.message });
            }
            const outTxId = this.lastID;

            // Leg 2: Inflow to destination account
            db.run(
              `INSERT INTO transactions (date, account_id, category_id, reason, amount, type, is_transfer, transfer_account_id, related_transaction_id)
               VALUES (?, ?, NULL, ?, ?, 'in', 1, ?, ?)`,
              [date, toAcc.id, `${transferReason} (From ${fromAcc.name})`, cleanAmount, fromAcc.id, outTxId],
              function (err2) {
                if (err2) {
                  db.run('ROLLBACK');
                  return res.status(500).json({ error: 'Failed to record deposit leg: ' + err2.message });
                }
                const inTxId = this.lastID;

                // Link the first leg back to the second
                db.run(
                  'UPDATE transactions SET related_transaction_id = ? WHERE id = ?',
                  [inTxId, outTxId],
                  (err3) => {
                    if (err3) {
                      db.run('ROLLBACK');
                      return res.status(500).json({ error: 'Failed to link transfer records: ' + err3.message });
                    }
                    db.run('COMMIT');
                    res.status(201).json({
                      message: 'Transfer completed successfully',
                      transfer: {
                        from_account: fromAcc.name,
                        to_account: toAcc.name,
                        amount: cleanAmount,
                        date,
                        outflow_id: outTxId,
                        inflow_id: inTxId
                      }
                    });
                  }
                );
              }
            );
          }
        );
      });
    }
  );
});

// ─── BUDGETS ──────────────────────────────────────────────────────────────────

// Get budgets for current user
app.get('/api/budgets', authenticateToken, ensureDhanushData, (req, res) => {
  const query = `
    SELECT b.*, c.name as category_name, c.color as category_color, c.icon as category_icon
    FROM budgets b
    LEFT JOIN categories c ON b.category_id = c.id
    WHERE b.user_id = ? OR b.user_id IS NULL
    ORDER BY b.id
  `;
  db.all(query, [req.user.id], (err, rows) =>
    err ? res.status(500).json({ error: err.message }) : res.json(rows)
  );
});

// Create budget
app.post('/api/budgets', authenticateToken, (req, res) => {
  const { category_id, amount, period } = req.body;
  if (!category_id || !amount)
    return res.status(400).json({ error: 'Category ID and amount are required' });

  db.run(
    'INSERT INTO budgets (user_id, category_id, amount, period) VALUES (?, ?, ?, ?)',
    [req.user.id, category_id, amount, period || 'monthly'],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, user_id: req.user.id, category_id, amount, period: period || 'monthly' });
    }
  );
});

// Update budget
app.put('/api/budgets/:id', authenticateToken, (req, res) => {
  const { category_id, amount, period } = req.body;

  db.run(
    'UPDATE budgets SET category_id = ?, amount = ?, period = ? WHERE id = ? AND user_id = ?',
    [category_id, amount, period || 'monthly', req.params.id, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Budget not found' });
      res.json({ id: req.params.id, category_id, amount, period: period || 'monthly' });
    }
  );
});

// Delete budget
app.delete('/api/budgets/:id', authenticateToken, (req, res) => {
  db.run(
    'DELETE FROM budgets WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Budget not found' });
      res.json({ message: 'Budget deleted successfully' });
    }
  );
});

// ─── SUMMARY & ANALYTICS ──────────────────────────────────────────────────────

// Get summary statistics for current user
app.get('/api/summary', authenticateToken, ensureDhanushData, (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `
    SELECT t.type, c.name as category_name,
           SUM(t.amount) as total, COUNT(*) as count
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE a.user_id = ? AND (t.is_transfer = 0 OR t.is_transfer IS NULL)
  `;
  const params = [req.user.id];

  if (startDate) { query += ' AND t.date >= ?'; params.push(startDate); }
  if (endDate) { query += ' AND t.date <= ?'; params.push(endDate); }
  query += ' GROUP BY t.type, c.name';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const summary = {
      total_in: 0, total_out: 0,
      count_in: 0, count_out: 0,
      categories: {}
    };

    rows.forEach(row => {
      const amt = Math.round((row.total || 0) * 100) / 100;
      if (row.type === 'in') {
        summary.total_in += amt;
        summary.count_in += row.count || 0;
      } else {
        summary.total_out += amt;
        summary.count_out += row.count || 0;
      }
      if (row.category_name) {
        if (!summary.categories[row.category_name])
          summary.categories[row.category_name] = { in: 0, out: 0 };
        summary.categories[row.category_name][row.type] = amt;
      }
    });

    summary.total_in = Math.round(summary.total_in * 100) / 100;
    summary.total_out = Math.round(summary.total_out * 100) / 100;
    summary.net_balance = Math.round((summary.total_in - summary.total_out) * 100) / 100;
    summary.total_transactions = summary.count_in + summary.count_out;
    res.json(summary);
  });
});

// Get account balances for current user
app.get('/api/account-balances', authenticateToken, ensureDhanushData, (req, res) => {
  const query = `
    SELECT
      a.id, a.name,
      ROUND(COALESCE(
        SUM(CASE WHEN t.type = 'in'  THEN t.amount ELSE 0 END) -
        SUM(CASE WHEN t.type = 'out' THEN t.amount ELSE 0 END), 0
      ), 2) as balance,
      COUNT(t.id) as transaction_count
    FROM accounts a
    LEFT JOIN transactions t ON a.id = t.account_id
    WHERE a.user_id = ?
    GROUP BY a.id, a.name
    ORDER BY a.id
  `;
  db.all(query, [req.user.id], (err, rows) =>
    err ? res.status(500).json({ error: err.message }) : res.json(rows)
  );
});

// Get spending trends for charts (user-scoped, excludes transfers)
app.get('/api/spending-trends', authenticateToken, ensureDhanushData, (req, res) => {
  const { period = 'monthly', months = 12 } = req.query;

  const validPeriods = {
    daily: '%Y-%m-%d',
    weekly: '%Y-%W',
    yearly: '%Y',
    monthly: '%Y-%m'
  };
  const dateFormat = validPeriods[period] || '%Y-%m';
  const cleanMonths = Math.max(1, Math.min(120, parseInt(months, 10) || 12));
  const dateInterval = `-${cleanMonths} months`;

  const query = `
    SELECT
      strftime('${dateFormat}', t.date) as period,
      t.type,
      SUM(t.amount) as total,
      COUNT(*) as count
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ?
      AND (t.is_transfer = 0 OR t.is_transfer IS NULL)
      AND t.date >= date('now', ?)
    GROUP BY strftime('${dateFormat}', t.date), t.type
    ORDER BY period
  `;

  db.all(query, [req.user.id, dateInterval], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const trends = {};
    rows.forEach(row => {
      if (!trends[row.period])
        trends[row.period] = { in: 0, out: 0, count_in: 0, count_out: 0 };
      trends[row.period][row.type] = Math.round((row.total || 0) * 100) / 100;
      trends[row.period]['count_' + row.type] = row.count || 0;
    });
    res.json(trends);
  });
});

// Get category breakdown for pie/donut chart
app.get('/api/category-breakdown', authenticateToken, ensureDhanushData, (req, res) => {
  const { type = 'out', months = 1 } = req.query;
  const cleanMonths = Math.max(1, Math.min(120, parseInt(months, 10) || 1));
  const dateInterval = `-${cleanMonths} months`;

  const query = `
    SELECT
      COALESCE(c.name, 'Uncategorized') as category_name,
      COALESCE(c.color, '#94a3b8') as category_color,
      COALESCE(c.icon, '📌') as category_icon,
      ROUND(SUM(t.amount), 2) as total
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE a.user_id = ?
      AND (t.is_transfer = 0 OR t.is_transfer IS NULL)
      AND t.type = ?
      AND t.date >= date('now', ?)
    GROUP BY c.name, c.color, c.icon
    ORDER BY total DESC
    LIMIT 10
  `;
  db.all(query, [req.user.id, type, dateInterval], (err, rows) =>
    err ? res.status(500).json({ error: err.message }) : res.json(rows)
  );
});

// ─── SAVINGS GOALS ────────────────────────────────────────────────────────────

// Get savings goals
app.get('/api/goals', authenticateToken, (req, res) => {
  db.all('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY id DESC', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Create savings goal
app.post('/api/goals', authenticateToken, (req, res) => {
  const { name, target_amount, current_amount = 0, target_date, color = '#10b981' } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Goal name is required' });

  const cleanTarget = Math.round(parseFloat(target_amount) * 100) / 100;
  if (isNaN(cleanTarget) || cleanTarget <= 0) {
    return res.status(400).json({ error: 'Target amount must be a positive number' });
  }
  const cleanCurrent = Math.max(0, Math.round(parseFloat(current_amount) * 100) / 100 || 0);

  db.run(
    `INSERT INTO savings_goals (user_id, name, target_amount, current_amount, target_date, color)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, name.trim(), cleanTarget, cleanCurrent, target_date || null, color],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({
        id: this.lastID,
        user_id: req.user.id,
        name: name.trim(),
        target_amount: cleanTarget,
        current_amount: cleanCurrent,
        target_date: target_date || null,
        color
      });
    }
  );
});

// Update savings goal
app.put('/api/goals/:id', authenticateToken, (req, res) => {
  const { name, target_amount, current_amount, target_date, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Goal name is required' });

  const cleanTarget = Math.round(parseFloat(target_amount) * 100) / 100;
  if (isNaN(cleanTarget) || cleanTarget <= 0) {
    return res.status(400).json({ error: 'Target amount must be greater than 0' });
  }
  const cleanCurrent = Math.max(0, Math.round(parseFloat(current_amount) * 100) / 100 || 0);

  db.run(
    `UPDATE savings_goals
     SET name = ?, target_amount = ?, current_amount = ?, target_date = ?, color = ?
     WHERE id = ? AND user_id = ?`,
    [name.trim(), cleanTarget, cleanCurrent, target_date || null, color || '#10b981', req.params.id, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Savings goal not found' });
      res.json({
        id: parseInt(req.params.id, 10),
        name: name.trim(),
        target_amount: cleanTarget,
        current_amount: cleanCurrent,
        target_date: target_date || null,
        color: color || '#10b981'
      });
    }
  );
});

// Delete savings goal
app.delete('/api/goals/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM savings_goals WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Savings goal not found' });
    res.json({ message: 'Savings goal deleted successfully' });
  });
});

// Contribute to savings goal
app.post('/api/goals/:id/contribute', authenticateToken, (req, res) => {
  const { amount, account_id } = req.body;
  const cleanAmount = Math.round(parseFloat(amount) * 100) / 100;
  if (isNaN(cleanAmount) || cleanAmount <= 0) {
    return res.status(400).json({ error: 'Contribution amount must be greater than 0' });
  }

  db.get('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, goal) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!goal) return res.status(404).json({ error: 'Savings goal not found' });

    const newAmount = Math.round((goal.current_amount + cleanAmount) * 100) / 100;

    // Optional: Link to an account transaction
    if (account_id) {
      const today = new Date().toISOString().slice(0, 10);
      db.run(
        `INSERT INTO transactions (date, account_id, reason, amount, type) VALUES (?, ?, ?, ?, 'out')`,
        [today, account_id, `Savings Goal: ${goal.name}`, cleanAmount],
        () => { }
      );
    }

    db.run(
      'UPDATE savings_goals SET current_amount = ? WHERE id = ? AND user_id = ?',
      [newAmount, req.params.id, req.user.id],
      function (upErr) {
        if (upErr) return res.status(500).json({ error: upErr.message });
        res.json({
          message: 'Contribution added successfully',
          goal_id: goal.id,
          current_amount: newAmount,
          target_amount: goal.target_amount,
          progress: Math.min(100, Math.round((newAmount / goal.target_amount) * 100))
        });
      }
    );
  });
});

// ─── RECURRING TRANSACTIONS & BILLS ──────────────────────────────────────────

// Get recurring transactions
app.get('/api/recurring', authenticateToken, (req, res) => {
  const query = `
    SELECT r.*, a.name as account_name, c.name as category_name, c.icon as category_icon
    FROM recurring_transactions r
    JOIN accounts a ON r.account_id = a.id
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.user_id = ?
    ORDER BY r.next_date ASC
  `;
  db.all(query, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Create recurring transaction
app.post('/api/recurring', authenticateToken, (req, res) => {
  const { account_id, category_id, reason, amount, type, frequency, next_date } = req.body;
  if (!account_id || !reason || !amount || !type || !frequency || !next_date) {
    return res.status(400).json({ error: 'All fields (account, reason, amount, type, frequency, next_date) are required' });
  }

  const cleanAmount = Math.round(parseFloat(amount) * 100) / 100;
  if (isNaN(cleanAmount) || cleanAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  if (!['in', 'out'].includes(type)) {
    return res.status(400).json({ error: "Type must be 'in' or 'out'" });
  }

  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(frequency)) {
    return res.status(400).json({ error: "Frequency must be 'daily', 'weekly', 'monthly', or 'yearly'" });
  }

  // Verify account belongs to user
  db.get('SELECT id FROM accounts WHERE id = ? AND user_id = ?', [account_id, req.user.id], (err, acc) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!acc) return res.status(403).json({ error: 'Account not found or access denied' });

    db.run(
      `INSERT INTO recurring_transactions (user_id, account_id, category_id, reason, amount, type, frequency, next_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, account_id, category_id || null, reason.trim(), cleanAmount, type, frequency, next_date],
      function (insErr) {
        if (insErr) return res.status(500).json({ error: insErr.message });
        res.status(201).json({
          id: this.lastID,
          user_id: req.user.id,
          account_id,
          category_id,
          reason: reason.trim(),
          amount: cleanAmount,
          type,
          frequency,
          next_date
        });
      }
    );
  });
});

// Update recurring transaction
app.put('/api/recurring/:id', authenticateToken, (req, res) => {
  const { account_id, category_id, reason, amount, type, frequency, next_date, is_active } = req.body;

  db.get('SELECT id FROM recurring_transactions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, item) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!item) return res.status(404).json({ error: 'Recurring transaction not found' });

    const cleanAmount = amount !== undefined ? Math.round(parseFloat(amount) * 100) / 100 : undefined;

    db.run(
      `UPDATE recurring_transactions
       SET account_id = COALESCE(?, account_id),
           category_id = ?,
           reason = COALESCE(?, reason),
           amount = COALESCE(?, amount),
           type = COALESCE(?, type),
           frequency = COALESCE(?, frequency),
           next_date = COALESCE(?, next_date),
           is_active = COALESCE(?, is_active)
       WHERE id = ? AND user_id = ?`,
      [account_id, category_id || null, reason ? reason.trim() : null, cleanAmount, type, frequency, next_date, is_active, req.params.id, req.user.id],
      function (upErr) {
        if (upErr) return res.status(500).json({ error: upErr.message });
        res.json({ message: 'Recurring transaction updated successfully' });
      }
    );
  });
});

// Delete recurring transaction
app.delete('/api/recurring/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM recurring_transactions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Recurring transaction not found' });
    res.json({ message: 'Recurring transaction deleted successfully' });
  });
});

// Process recurring transaction (create entry and advance next_date)
app.post('/api/recurring/:id/process', authenticateToken, (req, res) => {
  db.get(
    'SELECT * FROM recurring_transactions WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, rec) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!rec) return res.status(404).json({ error: 'Recurring transaction not found' });

      const txDate = rec.next_date || new Date().toISOString().slice(0, 10);

      // Create transaction
      db.run(
        `INSERT INTO transactions (date, account_id, category_id, reason, amount, type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [txDate, rec.account_id, rec.category_id, `[Recurring] ${rec.reason}`, rec.amount, rec.type],
        function (txErr) {
          if (txErr) return res.status(500).json({ error: 'Failed to record transaction: ' + txErr.message });
          const txId = this.lastID;

          // Calculate next date
          const curD = new Date(txDate);
          if (rec.frequency === 'daily') curD.setDate(curD.getDate() + 1);
          else if (rec.frequency === 'weekly') curD.setDate(curD.getDate() + 7);
          else if (rec.frequency === 'yearly') curD.setFullYear(curD.getFullYear() + 1);
          else curD.setMonth(curD.getMonth() + 1); // monthly default

          const newNextDate = curD.toISOString().slice(0, 10);

          db.run(
            'UPDATE recurring_transactions SET next_date = ? WHERE id = ?',
            [newNextDate, rec.id],
            (upErr) => {
              if (upErr) return res.status(500).json({ error: 'Failed to update schedule: ' + upErr.message });
              res.json({
                message: 'Recurring transaction processed successfully',
                transaction_id: txId,
                next_date: newNextDate
              });
            }
          );
        }
      );
    }
  );
});

// ─── FINANCIAL INSIGHTS & REMINDERS ──────────────────────────────────────────

app.get('/api/insights', authenticateToken, ensureDhanushData, (req, res) => {
  const userId = req.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const curMonthPrefix = today.slice(0, 7); // 'YYYY-MM'

  // 1. Upcoming bills (recurring transactions due in next 7 days)
  const billsQuery = `
    SELECT r.*, a.name as account_name, c.name as category_name, c.icon as category_icon
    FROM recurring_transactions r
    JOIN accounts a ON r.account_id = a.id
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.user_id = ?
      AND r.is_active = 1
      AND r.next_date <= date('now', '+7 days')
    ORDER BY r.next_date ASC
  `;

  // 2. Budgets vs actual spending this month
  const budgetsQuery = `
    SELECT b.id, b.amount as budget_limit, c.id as category_id, c.name as category_name, c.icon as category_icon,
           COALESCE(SUM(t.amount), 0) as spent
    FROM budgets b
    JOIN categories c ON b.category_id = c.id
    LEFT JOIN transactions t ON t.category_id = c.id
      AND t.type = 'out'
      AND (t.is_transfer = 0 OR t.is_transfer IS NULL)
      AND strftime('%Y-%m', t.date) = ?
    WHERE b.user_id = ?
    GROUP BY b.id, b.amount, c.id, c.name, c.icon
  `;

  // 3. Current month totals
  const monthlyQuery = `
    SELECT
      SUM(CASE WHEN t.type = 'in' THEN t.amount ELSE 0 END) as total_in,
      SUM(CASE WHEN t.type = 'out' THEN t.amount ELSE 0 END) as total_out
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ?
      AND (t.is_transfer = 0 OR t.is_transfer IS NULL)
      AND strftime('%Y-%m', t.date) = ?
  `;

  db.all(billsQuery, [userId], (err, bills) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(budgetsQuery, [curMonthPrefix, userId], (err2, budgetStatuses) => {
      if (err2) return res.status(500).json({ error: err2.message });

      db.get(monthlyQuery, [userId, curMonthPrefix], (err3, monthStats) => {
        if (err3) return res.status(500).json({ error: err3.message });

        const totalIn = Math.round((monthStats?.total_in || 0) * 100) / 100;
        const totalOut = Math.round((monthStats?.total_out || 0) * 100) / 100;
        const netThisMonth = Math.round((totalIn - totalOut) * 100) / 100;
        const savingsRate = totalIn > 0 ? Math.max(0, Math.round(((totalIn - totalOut) / totalIn) * 100)) : 0;

        const budgetAlerts = (budgetStatuses || []).map(b => {
          const pct = Math.round((b.spent / b.budget_limit) * 100);
          return {
            category_name: b.category_name,
            category_icon: b.category_icon,
            budget_limit: b.budget_limit,
            spent: Math.round(b.spent * 100) / 100,
            percent: pct,
            status: pct >= 100 ? 'exceeded' : pct >= 80 ? 'warning' : 'ok'
          };
        }).filter(b => b.status !== 'ok');

        res.json({
          upcoming_bills: bills || [],
          budget_alerts: budgetAlerts,
          metrics: {
            current_month: curMonthPrefix,
            income: totalIn,
            expense: totalOut,
            net: netThisMonth,
            savings_rate: savingsRate
          }
        });
      });
    });
  });
});

// ─── CSV IMPORT WITH PREVIEW & DUPLICATE DETECTION ────────────────────────────

// Preview CSV import
app.post('/api/import/csv/preview', authenticateToken, (req, res) => {
  const { csvData, rows } = req.body;
  let parsedRows = [];

  if (Array.isArray(rows) && rows.length > 0) {
    parsedRows = rows;
  } else if (typeof csvData === 'string' && csvData.trim()) {
    // Parse raw CSV string
    const lines = csvData.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length <= 1) {
      return res.status(400).json({ error: 'CSV file contains no data rows' });
    }
    const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim().toLowerCase());
    const dateIdx = headers.findIndex(h => h.includes('date'));
    const accIdx = headers.findIndex(h => h.includes('acc'));
    const catIdx = headers.findIndex(h => h.includes('cat'));
    const reasonIdx = headers.findIndex(h => h.includes('reason') || h.includes('desc'));
    const typeIdx = headers.findIndex(h => h.includes('type'));
    const amtIdx = headers.findIndex(h => h.includes('amount') || h.includes('amt'));

    if (dateIdx === -1 || amtIdx === -1) {
      return res.status(400).json({ error: 'CSV must contain at least Date and Amount columns' });
    }

    for (let i = 1; i < lines.length; i++) {
      // Regex CSV split handling quotes
      const match = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
      const cols = lines[i].split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
      const d = cols[dateIdx];
      const amt = parseFloat(cols[amtIdx]);
      let t = typeIdx !== -1 ? cols[typeIdx].toLowerCase() : 'out';
      if (t === 'income' || t === 'cr' || t === 'credit') t = 'in';
      if (t === 'expense' || t === 'dr' || t === 'debit') t = 'out';
      if (!['in', 'out'].includes(t)) t = amt > 0 ? 'out' : 'out';

      parsedRows.push({
        date: d,
        account_name: accIdx !== -1 ? cols[accIdx] : 'CASH',
        category_name: catIdx !== -1 ? cols[catIdx] : 'General',
        reason: reasonIdx !== -1 ? cols[reasonIdx] : 'Imported transaction',
        type: t,
        amount: Math.abs(amt)
      });
    }
  } else {
    return res.status(400).json({ error: 'No CSV data provided' });
  }

  // Check against user's existing transactions for duplicate detection
  const query = `
    SELECT t.date, t.amount, t.type, LOWER(t.reason) as reason, UPPER(a.name) as account_name
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ?
  `;

  db.all(query, [req.user.id], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });

    const existingMap = new Set(
      existing.map(e => `${e.date}|${e.amount}|${e.type}|${e.account_name}|${(e.reason || '').trim()}`)
    );

    let duplicatesCount = 0;
    let validCount = 0;

    const validatedRows = parsedRows.map((r, idx) => {
      const cleanAmt = Math.round(parseFloat(r.amount) * 100) / 100;
      const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(r.date);
      const isValidAmt = !isNaN(cleanAmt) && cleanAmt > 0;
      const key = `${r.date}|${cleanAmt}|${r.type}|${(r.account_name || 'CASH').toUpperCase()}|${(r.reason || '').toLowerCase().trim()}`;
      const isDuplicate = existingMap.has(key);

      if (isDuplicate) duplicatesCount++;
      else if (isValidDate && isValidAmt) validCount++;

      return {
        row_id: idx + 1,
        date: r.date,
        account_name: r.account_name || 'CASH',
        category_name: r.category_name || 'Uncategorized',
        reason: r.reason || '',
        type: r.type === 'in' ? 'in' : 'out',
        amount: cleanAmt,
        is_duplicate: isDuplicate,
        is_valid: isValidDate && isValidAmt
      };
    });

    res.json({
      total_rows: validatedRows.length,
      valid_rows: validCount,
      duplicate_rows: duplicatesCount,
      invalid_rows: validatedRows.length - validCount - duplicatesCount,
      rows: validatedRows
    });
  });
});

// Execute CSV import
app.post('/api/import/csv', authenticateToken, (req, res) => {
  const { rows, skip_duplicates = true } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Rows array is required' });
  }

  // Get user's accounts and categories
  db.all('SELECT id, UPPER(name) as name FROM accounts WHERE user_id = ?', [req.user.id], (err, accs) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all('SELECT id, UPPER(name) as name FROM categories', (catErr, cats) => {
      if (catErr) return res.status(500).json({ error: catErr.message });

      const accMap = {};
      accs.forEach(a => { accMap[a.name] = a.id; });
      const catMap = {};
      cats.forEach(c => { catMap[c.name] = c.id; });

      // Default account if not found
      const defaultAccId = accs[0] ? accs[0].id : null;
      if (!defaultAccId) {
        return res.status(400).json({ error: 'User has no accounts to import into. Please create an account first.' });
      }

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        let imported = 0;
        let skipped = 0;

        for (const row of rows) {
          if (row.is_duplicate && skip_duplicates) {
            skipped++;
            continue;
          }
          if (!row.is_valid && row.is_valid !== undefined) {
            skipped++;
            continue;
          }

          const accName = (row.account_name || '').toUpperCase().trim();
          const accId = accMap[accName] || defaultAccId;

          const catName = (row.category_name || '').toUpperCase().trim();
          const catId = catMap[catName] || null;

          const cleanAmt = Math.round(parseFloat(row.amount) * 100) / 100;
          const cleanReason = (row.reason || 'Imported').trim();
          const cleanDate = row.date;
          const cleanType = row.type === 'in' ? 'in' : 'out';

          db.run(
            `INSERT INTO transactions (date, account_id, category_id, reason, amount, type)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [cleanDate, accId, catId, cleanReason, cleanAmt, cleanType],
            (insErr) => {
              if (!insErr) imported++;
            }
          );
        }

        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Import failed: ' + commitErr.message });
          }
          res.json({
            message: 'Import completed successfully',
            imported,
            skipped,
            total: rows.length
          });
        });
      });
    });
  });
});

// ─── VALIDATED JSON BACKUP & RESTORE ──────────────────────────────────────────

// Full user backup with schema versioning
app.get('/api/backup', authenticateToken, ensureDhanushData, (req, res) => {
  const userId = req.user.id;

  const queries = {
    accounts: ['SELECT id, name FROM accounts WHERE user_id = ?', [userId]],
    categories: ['SELECT id, name, color, icon FROM categories', []],
    transactions: [
      `SELECT t.date, a.name as account_name, c.name as category_name, t.reason, t.amount, t.type,
              t.is_transfer, ta.name as transfer_account_name
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN accounts ta ON t.transfer_account_id = ta.id
       WHERE a.user_id = ?
       ORDER BY t.date ASC`,
      [userId]
    ],
    budgets: [
      `SELECT b.amount, b.period, c.name as category_name
       FROM budgets b
       LEFT JOIN categories c ON b.category_id = c.id
       WHERE b.user_id = ?`,
      [userId]
    ],
    goals: ['SELECT name, target_amount, current_amount, target_date, color FROM savings_goals WHERE user_id = ?', [userId]],
    recurring: [
      `SELECT r.reason, r.amount, r.type, r.frequency, r.next_date, r.is_active,
              a.name as account_name, c.name as category_name
       FROM recurring_transactions r
       JOIN accounts a ON r.account_id = a.id
       LEFT JOIN categories c ON r.category_id = c.id
       WHERE r.user_id = ?`,
      [userId]
    ]
  };

  db.all(queries.accounts[0], queries.accounts[1], (e1, accs) => {
    if (e1) return res.status(500).json({ error: e1.message });
    db.all(queries.categories[0], queries.categories[1], (e2, cats) => {
      if (e2) return res.status(500).json({ error: e2.message });
      db.all(queries.transactions[0], queries.transactions[1], (e3, txs) => {
        if (e3) return res.status(500).json({ error: e3.message });
        db.all(queries.budgets[0], queries.budgets[1], (e4, bdgs) => {
          if (e4) return res.status(500).json({ error: e4.message });
          db.all(queries.goals[0], queries.goals[1], (e5, goals) => {
            if (e5) return res.status(500).json({ error: e5.message });
            db.all(queries.recurring[0], queries.recurring[1], (e6, recs) => {
              if (e6) return res.status(500).json({ error: e6.message });

              const backupData = {
                schema_version: '1.0',
                application: 'MoneyFlow Tracker',
                exported_at: new Date().toISOString(),
                user: { id: userId, name: req.user.name, email: req.user.email },
                accounts: accs || [],
                categories: cats || [],
                transactions: txs || [],
                budgets: bdgs || [],
                savings_goals: goals || [],
                recurring_transactions: recs || []
              };

              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Content-Disposition', `attachment; filename=moneyflow-backup-${new Date().toISOString().slice(0, 10)}.json`);
              res.json(backupData);
            });
          });
        });
      });
    });
  });
});

// Restore backup with schema validation
app.post('/api/backup/restore', authenticateToken, (req, res) => {
  const payload = req.body;

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  if (payload.schema_version !== '1.0') {
    return res.status(400).json({ error: `Unsupported backup schema version: ${payload.schema_version || 'unknown'}` });
  }

  const userId = req.user.id;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // 1. Ensure accounts exist
    const incomingAccounts = Array.isArray(payload.accounts) ? payload.accounts : [];
    for (const acc of incomingAccounts) {
      if (acc.name) {
        db.run('INSERT OR IGNORE INTO accounts (name, user_id) VALUES (?, ?)', [acc.name.trim().toUpperCase(), userId]);
      }
    }

    // Refresh user accounts map
    db.all('SELECT id, UPPER(name) as name FROM accounts WHERE user_id = ?', [userId], (aErr, userAccs) => {
      if (aErr) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: aErr.message });
      }

      const accMap = {};
      userAccs.forEach(a => { accMap[a.name] = a.id; });
      const defaultAccId = userAccs[0] ? userAccs[0].id : null;

      // Refresh categories
      db.all('SELECT id, UPPER(name) as name FROM categories', (cErr, allCats) => {
        if (cErr) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: cErr.message });
        }

        const catMap = {};
        allCats.forEach(c => { catMap[c.name] = c.id; });

        let restoredTxCount = 0;
        const incomingTxs = Array.isArray(payload.transactions) ? payload.transactions : [];

        for (const tx of incomingTxs) {
          if (!tx.date || !tx.amount) continue;
          const aName = (tx.account_name || '').toUpperCase().trim();
          const targetAccId = accMap[aName] || defaultAccId;
          const cName = (tx.category_name || '').toUpperCase().trim();
          const targetCatId = catMap[cName] || null;
          const cleanAmt = Math.round(parseFloat(tx.amount) * 100) / 100;
          const cleanType = tx.type === 'in' ? 'in' : 'out';

          db.run(
            `INSERT INTO transactions (date, account_id, category_id, reason, amount, type, is_transfer)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [tx.date, targetAccId, targetCatId, (tx.reason || 'Restored transaction').trim(), cleanAmt, cleanType, tx.is_transfer ? 1 : 0],
            () => { restoredTxCount++; }
          );
        }

        // Restore Goals
        const incomingGoals = Array.isArray(payload.savings_goals) ? payload.savings_goals : [];
        for (const g of incomingGoals) {
          if (g.name && g.target_amount) {
            db.run(
              `INSERT INTO savings_goals (user_id, name, target_amount, current_amount, target_date, color)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [userId, g.name, g.target_amount, g.current_amount || 0, g.target_date || null, g.color || '#10b981']
            );
          }
        }

        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Restore failed: ' + commitErr.message });
          }
          res.json({
            message: 'Backup restored successfully',
            restored: {
              accounts: incomingAccounts.length,
              transactions: incomingTxs.length,
              goals: incomingGoals.length
            }
          });
        });
      });
    });
  });
});

// ─── EXPORT ───────────────────────────────────────────────────────────────────

function convertToCSV(data) {
  if (!data || data.length === 0)
    return 'Date,Account,Category,Reason,Type,Amount\n';

  const headers = ['Date', 'Account', 'Category', 'Reason', 'Type', 'Amount'];
  const rows = data.map(row => [
    row.date || '',
    row.account_name || '',
    row.category_name || 'Uncategorized',
    row.reason || '',
    row.type === 'in' ? 'Income' : 'Expense',
    row.amount || 0
  ].map(f => `"${f}"`).join(','));
  return [headers.join(','), ...rows].join('\n');
}

// Export transactions as CSV
app.get('/api/export/csv', authenticateToken, (req, res) => {
  const { start, end } = req.query;
  let query = `
    SELECT t.date, a.name as account_name,
           COALESCE(c.name, 'Uncategorized') as category_name,
           t.reason, t.type, t.amount
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE a.user_id = ?
  `;
  const params = [req.user.id];

  if (start && end) {
    query += ' AND t.date BETWEEN ? AND ?';
    params.push(start, end);
  }
  query += ' ORDER BY t.date DESC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const csv = convertToCSV(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=moneyflow-transactions.csv');
    res.send(csv);
  });
});

// Export transactions as JSON
app.get('/api/export/json', authenticateToken, (req, res) => {
  const { start, end } = req.query;
  let query = `
    SELECT t.id, t.date, a.name as account_name,
           COALESCE(c.name, 'Uncategorized') as category_name,
           c.icon as category_icon,
           t.reason, t.type, t.amount, t.created_at
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE a.user_id = ?
  `;
  const params = [req.user.id];

  if (start && end) {
    query += ' AND t.date BETWEEN ? AND ?';
    params.push(start, end);
  }
  query += ' ORDER BY t.date DESC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=moneyflow-transactions.json');
    res.json({
      exported_at: new Date().toISOString(),
      user: req.user.name,
      total_count: rows.length,
      transactions: rows
    });
  });
});

// ─── FRONTEND ROUTES ──────────────────────────────────────────────────────────

// Serve index.html for the root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server locally (or on non-serverless environments)
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  const startServer = (port) => {
    const server = app.listen(port, () => {
      console.log(`MoneyFlow Tracker running on http://localhost:${port}`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️ Port ${port} is already in use. Trying port ${port + 1}...`);
        startServer(port + 1);
      } else {
        console.error('Server error:', err);
      }
    });
  };
  startServer(Number(PORT));
}

module.exports = app;
