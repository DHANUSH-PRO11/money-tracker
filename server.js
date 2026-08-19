const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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

// Database setup
const isVercel = process.env.VERCEL === '1' || process.env.NOW_REGION;
const dbPath = isVercel ? '/tmp/moneyflow.db' : path.join(__dirname, 'moneyflow.db');

// If running in serverless /tmp and seed DB exists, copy it over
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

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    initializeDatabase();
  }
});

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

      // Backfill default accounts for existing users who have 0 accounts
      db.all('SELECT id FROM users WHERE id NOT IN (SELECT DISTINCT user_id FROM accounts)', (err, users) => {
        if (!err && users && users.length > 0) {
          const defaultAccounts = ['GPAY', 'CASH', 'FANPAY'];
          const stmt = db.prepare('INSERT OR IGNORE INTO accounts (name, user_id) VALUES (?, ?)');
          users.forEach(u => {
            defaultAccounts.forEach(a => stmt.run(a, u.id));
          });
          stmt.finalize();
          console.log(`Backfilled default accounts for ${users.length} users.`);
        }
      });
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
      account_id INTEGER NOT NULL,
      category_id INTEGER,
      reason TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('in', 'out')),
      frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
      next_date TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts (id),
      FOREIGN KEY (category_id) REFERENCES categories (id)
    )`);

    // Add user_id column to budgets if it doesn't exist (migration)
    db.run(`ALTER TABLE budgets ADD COLUMN user_id INTEGER REFERENCES users(id)`, () => {});

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

app.post('/api/auth/signup', async (req, res) => {
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
          function(err) {
            if (err) return res.status(500).json({ error: 'Failed to create user' });

            const userId = this.lastID;

            // Create default accounts for new user
            const defaultAccounts = ['GPAY', 'CASH', 'FANPAY'];
            const stmt = db.prepare('INSERT INTO accounts (name, user_id) VALUES (?, ?)');
            defaultAccounts.forEach(a => stmt.run(a, userId));
            stmt.finalize();

            const token = jwt.sign({ id: userId, email: cleanEmail, name: cleanName }, JWT_SECRET, { expiresIn: '7d' });

            res.status(201).json({
              message: 'User created successfully',
              token,
              user: { id: userId, name: cleanName, email: cleanEmail }
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

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ message: 'Token is valid', user: req.user });
});

// ─── USER PROFILE & SETTINGS ──────────────────────────────────────────────────

// Get current user profile
app.get('/api/user/profile', authenticateToken, (req, res) => {
  db.get(
    'SELECT id, name, email, created_at FROM users WHERE id = ?',
    [req.user.id],
    (err, user) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!user) return res.status(404).json({ error: 'User not found' });
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
      function(err) {
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
      db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id], function(err) {
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
app.get('/api/accounts', authenticateToken, (req, res) => {
  db.all(
    'SELECT * FROM accounts WHERE user_id = ? ORDER BY id',
    [req.user.id],
    (err, rows) => err ? res.status(500).json({ error: err.message }) : res.json(rows)
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
        function(err) {
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
        function(err) {
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
            function(err) {
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
    function(err) {
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
    function(err) {
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

    db.run('DELETE FROM categories WHERE id = ?', [categoryId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Category not found' });
      res.json({ message: 'Category deleted successfully' });
    });
  });
});

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

// Get all transactions for current user
app.get('/api/transactions', authenticateToken, (req, res) => {
  const { startDate, endDate, categoryId, accountId } = req.query;
  let query = `
    SELECT t.*, a.name as account_name, c.name as category_name,
           c.color as category_color, c.icon as category_icon
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE a.user_id = ?
  `;
  const params = [req.user.id];

  if (startDate) { query += ' AND t.date >= ?'; params.push(startDate); }
  if (endDate)   { query += ' AND t.date <= ?'; params.push(endDate); }
  if (categoryId){ query += ' AND t.category_id = ?'; params.push(categoryId); }
  if (accountId) { query += ' AND t.account_id = ?'; params.push(accountId); }

  query += ' ORDER BY t.date DESC, t.created_at DESC';

  db.all(query, params, (err, rows) =>
    err ? res.status(500).json({ error: err.message }) : res.json(rows)
  );
});

// Create new transaction (only for user's own accounts)
app.post('/api/transactions', authenticateToken, (req, res) => {
  const { date, account_id, category_id, reason, amount, type } = req.body;

  if (!date || !account_id || !reason || !amount || !type)
    return res.status(400).json({ error: 'All required fields must be provided' });
  if (amount <= 0)
    return res.status(400).json({ error: 'Amount must be greater than 0' });

  // Verify account belongs to user
  db.get(
    'SELECT id FROM accounts WHERE id = ? AND user_id = ?',
    [account_id, req.user.id],
    (err, account) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!account) return res.status(403).json({ error: 'Account not found or access denied' });

      db.run(
        'INSERT INTO transactions (date, account_id, category_id, reason, amount, type) VALUES (?, ?, ?, ?, ?, ?)',
        [date, account_id, category_id || null, reason, amount, type],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({
            id: this.lastID, date,
            account_id: parseInt(account_id),
            category_id: category_id ? parseInt(category_id) : null,
            reason, amount: parseFloat(amount), type
          });
        }
      );
    }
  );
});

// Delete transaction (only user's own)
app.delete('/api/transactions/:id', authenticateToken, (req, res) => {
  // Join with accounts to verify ownership
  db.get(
    `SELECT t.id FROM transactions t
     JOIN accounts a ON t.account_id = a.id
     WHERE t.id = ? AND a.user_id = ?`,
    [req.params.id, req.user.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Transaction not found' });

      db.run('DELETE FROM transactions WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Transaction deleted successfully' });
      });
    }
  );
});

// ─── BUDGETS ──────────────────────────────────────────────────────────────────

// Get budgets for current user
app.get('/api/budgets', authenticateToken, (req, res) => {
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
    function(err) {
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
    function(err) {
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
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Budget not found' });
      res.json({ message: 'Budget deleted successfully' });
    }
  );
});

// ─── SUMMARY & ANALYTICS ──────────────────────────────────────────────────────

// Get summary statistics for current user
app.get('/api/summary', authenticateToken, (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `
    SELECT t.type, c.name as category_name,
           SUM(t.amount) as total, COUNT(*) as count
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE a.user_id = ?
  `;
  const params = [req.user.id];

  if (startDate) { query += ' AND t.date >= ?'; params.push(startDate); }
  if (endDate)   { query += ' AND t.date <= ?'; params.push(endDate); }
  query += ' GROUP BY t.type, c.name';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const summary = {
      total_in: 0, total_out: 0,
      count_in: 0, count_out: 0,
      categories: {}
    };

    rows.forEach(row => {
      if (row.type === 'in') {
        summary.total_in  += row.total || 0;
        summary.count_in  += row.count || 0;
      } else {
        summary.total_out += row.total || 0;
        summary.count_out += row.count || 0;
      }
      if (row.category_name) {
        if (!summary.categories[row.category_name])
          summary.categories[row.category_name] = { in: 0, out: 0 };
        summary.categories[row.category_name][row.type] = row.total || 0;
      }
    });

    summary.net_balance = summary.total_in - summary.total_out;
    summary.total_transactions = summary.count_in + summary.count_out;
    res.json(summary);
  });
});

// Get account balances for current user
app.get('/api/account-balances', authenticateToken, (req, res) => {
  const query = `
    SELECT
      a.id, a.name,
      COALESCE(
        SUM(CASE WHEN t.type = 'in'  THEN t.amount ELSE 0 END) -
        SUM(CASE WHEN t.type = 'out' THEN t.amount ELSE 0 END), 0
      ) as balance,
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

// Get spending trends for charts (user-scoped)
app.get('/api/spending-trends', authenticateToken, (req, res) => {
  const { period = 'monthly', months = 12 } = req.query;

  let dateFormat;
  switch (period) {
    case 'daily':   dateFormat = '%Y-%m-%d'; break;
    case 'weekly':  dateFormat = '%Y-%W';    break;
    case 'yearly':  dateFormat = '%Y';       break;
    default:        dateFormat = '%Y-%m';    break;
  }

  const query = `
    SELECT
      strftime('${dateFormat}', t.date) as period,
      t.type,
      SUM(t.amount) as total,
      COUNT(*) as count
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    WHERE a.user_id = ?
      AND t.date >= date('now', '-${parseInt(months)} months')
    GROUP BY strftime('${dateFormat}', t.date), t.type
    ORDER BY period
  `;

  db.all(query, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const trends = {};
    rows.forEach(row => {
      if (!trends[row.period])
        trends[row.period] = { in: 0, out: 0, count_in: 0, count_out: 0 };
      trends[row.period][row.type] = row.total || 0;
      trends[row.period]['count_' + row.type] = row.count || 0;
    });
    res.json(trends);
  });
});

// Get category breakdown for pie/donut chart
app.get('/api/category-breakdown', authenticateToken, (req, res) => {
  const { type = 'out', months = 1 } = req.query;
  const query = `
    SELECT
      COALESCE(c.name, 'Uncategorized') as category_name,
      COALESCE(c.color, '#94a3b8') as category_color,
      COALESCE(c.icon, '📌') as category_icon,
      SUM(t.amount) as total
    FROM transactions t
    JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE a.user_id = ?
      AND t.type = ?
      AND t.date >= date('now', '-${parseInt(months)} months')
    GROUP BY c.name, c.color, c.icon
    ORDER BY total DESC
    LIMIT 10
  `;
  db.all(query, [req.user.id, type], (err, rows) =>
    err ? res.status(500).json({ error: err.message }) : res.json(rows)
  );
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

// ─── FRONTEND ROUTES ──────────────────────────────────────────────────────────

// Serve index.html for the root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server locally (or on non-serverless environments)
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`MoneyFlow Tracker running on http://localhost:${PORT}`);
  });
}

module.exports = app;
