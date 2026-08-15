const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
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
app.use(express.static(path.join(__dirname, 'public')));

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

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
const db = new sqlite3.Database('./moneyflow.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  // Create users table for authentication
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create accounts table
  db.run(`CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Create categories table
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#7c6af7',
    icon TEXT DEFAULT ' ',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create transactions table with category support
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

  // Create budgets table
  db.run(`CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    amount REAL NOT NULL,
    period TEXT DEFAULT 'monthly' CHECK(period IN ('weekly', 'monthly', 'yearly')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories (id)
  )`);

  // Create recurring transactions table
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

  // Note: Default accounts will be created when user signs up
  console.log('Database initialized successfully');

  // Insert default categories if none exist
  db.get("SELECT COUNT(*) as count FROM categories", (err, row) => {
    if (!err && row.count === 0) {
      const defaultCategories = [
        { name: 'Food & Dining', color: '#f76a8a', icon: '🍔' },
        { name: 'Transportation', color: '#7c6af7', icon: '🚗' },
        { name: 'Shopping', color: '#5ef5c0', icon: '🛍️' },
        { name: 'Entertainment', color: '#fbbf24', icon: '🎮' },
        { name: 'Bills & Utilities', color: '#ef4444', icon: '💡' },
        { name: 'Healthcare', color: '#10b981', icon: '🏥' },
        { name: 'Salary', color: '#22c55e', icon: '💰' },
        { name: 'Investment', color: '#8b5cf6', icon: '📈' }
      ];
      
      const stmt = db.prepare("INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)");
      defaultCategories.forEach(category => {
        stmt.run(category.name, category.color, category.icon);
      });
      stmt.finalize();
      console.log('Default categories created');
    }
  });
}

// API Routes

// Authentication routes
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  try {
    // Check if user already exists
    db.get("SELECT id FROM users WHERE email = ?", [email], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (row) {
        return res.status(400).json({ error: 'User already exists' });
      }
      
      // Hash password and create user
      const hashedPassword = await bcrypt.hash(password, 10);
      
      db.run(
        "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
        [name, email, hashedPassword],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to create user' });
          }
          
          const userId = this.lastID;
          
          // Create default accounts for new user
          const defaultAccounts = ['GPAY', 'CASH', 'FANPAY'];
          const stmt = db.prepare("INSERT INTO accounts (name, user_id) VALUES (?, ?)");
          
          defaultAccounts.forEach(account => {
            stmt.run(account, userId);
          });
          stmt.finalize();
          
          const token = jwt.sign(
            { id: userId, email },
            JWT_SECRET,
            { expiresIn: '24h' }
          );
          
          res.status(201).json({
            message: 'User created successfully',
            token,
            user: { id: userId, name, email }
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  db.get(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Compare password
      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const token = jwt.sign(
        { id: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.json({
        message: 'Login successful',
        token,
        user: { id: user.id, name: user.name, email: user.email }
      });
    }
  );
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ message: 'Token is valid', user: req.user });
});

// Get all accounts (protected)
app.get('/api/accounts', authenticateToken, (req, res) => {
  db.all("SELECT * FROM accounts WHERE user_id = ? ORDER BY id", [req.user.id], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Create new account
app.post('/api/accounts', authenticateToken, (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Account name is required' });
  }

  db.run("INSERT INTO accounts (name, user_id) VALUES (?, ?)", [name.toUpperCase(), req.user.id], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ error: 'Account name already exists' });
      } else {
        res.status(500).json({ error: err.message });
      }
    } else {
      res.json({ id: this.lastID, name: name.toUpperCase() });
    }
  });
});

// Update account
app.put('/api/accounts/:id', authenticateToken, (req, res) => {
  const { name } = req.body;
  const accountId = req.params.id;
  
  if (!name) {
    return res.status(400).json({ error: 'Account name is required' });
  }

  db.run("UPDATE accounts SET name = ? WHERE id = ? AND user_id = ?", [name.toUpperCase(), accountId, req.user.id], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ error: 'Account name already exists' });
      } else {
        res.status(500).json({ error: err.message });
      }
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Account not found' });
    } else {
      res.json({ id: accountId, name: name.toUpperCase() });
    }
  });
});

// Delete account
app.delete('/api/accounts/:id', authenticateToken, (req, res) => {
  const accountId = req.params.id;
  
  // Check if account has transactions
  db.get("SELECT COUNT(*) as count FROM transactions WHERE account_id = ? AND user_id = ?", [accountId, req.user.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (row.count > 0) {
      return res.status(400).json({ error: 'Cannot delete account with existing transactions' });
    }
    
    db.run("DELETE FROM accounts WHERE id = ? AND user_id = ?", [accountId, req.user.id], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (this.changes === 0) {
        res.status(404).json({ error: 'Account not found' });
      } else {
        res.json({ message: 'Account deleted successfully' });
      }
    });
  });
});

// Get all categories
app.get('/api/categories', authenticateToken, (req, res) => {
  db.all("SELECT * FROM categories ORDER BY name", (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Create new category
app.post('/api/categories', authenticateToken, (req, res) => {
  const { name, color, icon } = req.body;
  
  if (!name || !color || !icon) {
    return res.status(400).json({ error: 'Name, color, and icon are required' });
  }

  db.run("INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)", [name, color, icon], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ error: 'Category name already exists' });
      } else {
        res.status(500).json({ error: err.message });
      }
    } else {
      res.json({ id: this.lastID, name, color, icon });
    }
  });
});

// Update category
app.put('/api/categories/:id', authenticateToken, (req, res) => {
  const { name, color, icon } = req.body;
  const categoryId = req.params.id;
  
  if (!name || !color || !icon) {
    return res.status(400).json({ error: 'Name, color, and icon are required' });
  }

  db.run("UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?", [name, color, icon, categoryId], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ error: 'Category name already exists' });
      } else {
        res.status(500).json({ error: err.message });
      }
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Category not found' });
    } else {
      res.json({ id: categoryId, name, color, icon });
    }
  });
});

// Delete category
app.delete('/api/categories/:id', authenticateToken, (req, res) => {
  const categoryId = req.params.id;
  
  // Update transactions to remove category reference
  db.run("UPDATE transactions SET category_id = NULL WHERE category_id = ?", [categoryId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Delete the category
    db.run("DELETE FROM categories WHERE id = ?", [categoryId], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (this.changes === 0) {
        res.status(404).json({ error: 'Category not found' });
      } else {
        res.json({ message: 'Category deleted successfully' });
      }
    });
  });
});

// Update account name
app.put('/api/accounts/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Account name is required' });
  }

  db.run("UPDATE accounts SET name = ? WHERE id = ?", [name.toUpperCase(), id], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ error: 'Account name already exists' });
      } else {
        res.status(500).json({ error: err.message });
      }
    } else {
      if (this.changes === 0) {
        res.status(404).json({ error: 'Account not found' });
      } else {
        res.json({ id: parseInt(id), name: name.toUpperCase() });
      }
    }
  });
});

// Get all categories
app.get('/api/categories', (req, res) => {
  db.all("SELECT * FROM categories ORDER BY id", (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Create new category
app.post('/api/categories', (req, res) => {
  const { name, color, icon } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  db.run("INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)", 
    [name, color || '#7c6af7', icon || '📌'], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ error: 'Category name already exists' });
      } else {
        res.status(500).json({ error: err.message });
      }
    } else {
      res.json({ 
        id: this.lastID, 
        name, 
        color: color || '#7c6af7', 
        icon: icon || '📌' 
      });
    }
  });
});

// Get all transactions
app.get('/api/transactions', (req, res) => {
  const { startDate, endDate, categoryId, accountId } = req.query;
  let query = `
    SELECT t.*, a.name as account_name, c.name as category_name, c.color as category_color, c.icon as category_icon
    FROM transactions t 
    JOIN accounts a ON t.account_id = a.id 
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (startDate) {
    query += " AND t.date >= ?";
    params.push(startDate);
  }
  if (endDate) {
    query += " AND t.date <= ?";
    params.push(endDate);
  }
  if (categoryId) {
    query += " AND t.category_id = ?";
    params.push(categoryId);
  }
  if (accountId) {
    query += " AND t.account_id = ?";
    params.push(accountId);
  }

  query += " ORDER BY t.created_at DESC";
  
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Create new transaction
app.post('/api/transactions', (req, res) => {
  const { date, account_id, category_id, reason, amount, type } = req.body;
  
  if (!date || !account_id || !reason || !amount || !type) {
    return res.status(400).json({ error: 'All required fields must be provided' });
  }

  if (amount <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }

  const query = `
    INSERT INTO transactions (date, account_id, category_id, reason, amount, type) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  
  db.run(query, [date, account_id, category_id, reason, amount, type], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ 
        id: this.lastID, 
        date, 
        account_id: parseInt(account_id), 
        category_id: category_id ? parseInt(category_id) : null,
        reason, 
        amount: parseFloat(amount), 
        type 
      });
    }
  });
});

// Delete transaction
app.delete('/api/transactions/:id', (req, res) => {
  const { id } = req.params;
  
  db.run("DELETE FROM transactions WHERE id = ?", [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      if (this.changes === 0) {
        res.status(404).json({ error: 'Transaction not found' });
      } else {
        res.json({ message: 'Transaction deleted successfully' });
      }
    }
  });
});

// Get all budgets
app.get('/api/budgets', (req, res) => {
  const query = `
    SELECT b.*, c.name as category_name, c.color as category_color, c.icon as category_icon
    FROM budgets b
    LEFT JOIN categories c ON b.category_id = c.id
    ORDER BY b.id
  `;
  db.all(query, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Create new budget
app.post('/api/budgets', (req, res) => {
  const { category_id, amount, period } = req.body;
  if (!category_id || !amount) {
    return res.status(400).json({ error: 'Category ID and amount are required' });
  }

  db.run("INSERT INTO budgets (category_id, amount, period) VALUES (?, ?, ?)", 
    [category_id, amount, period || 'monthly'], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ id: this.lastID, category_id, amount, period: period || 'monthly' });
    }
  });
});

// Update budget
app.put('/api/budgets/:id', (req, res) => {
  const { category_id, amount, period } = req.body;
  const { id } = req.params;

  db.run("UPDATE budgets SET category_id = ?, amount = ?, period = ? WHERE id = ?", 
    [category_id, amount, period || 'monthly', id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Budget not found' });
    } else {
      res.json({ id: parseInt(id), category_id, amount, period: period || 'monthly' });
    }
  });
});

// Delete budget
app.delete('/api/budgets/:id', (req, res) => {
  const { id } = req.params;
  
  db.run("DELETE FROM budgets WHERE id = ?", [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Budget not found' });
    } else {
      res.json({ message: 'Budget deleted successfully' });
    }
  });
});

// Get summary statistics
app.get('/api/summary', (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `
    SELECT 
      t.type,
      c.name as category_name,
      SUM(t.amount) as total,
      COUNT(*) as count
    FROM transactions t 
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (startDate) {
    query += " AND t.date >= ?";
    params.push(startDate);
  }
  if (endDate) {
    query += " AND t.date <= ?";
    params.push(endDate);
  }

  query += " GROUP BY t.type, c.name";
  
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      const summary = {
        total_in: 0,
        total_out: 0,
        count_in: 0,
        count_out: 0,
        categories: {}
      };
      
      rows.forEach(row => {
        if (row.type === 'in') {
          summary.total_in += row.total || 0;
          summary.count_in += row.count || 0;
        } else if (row.type === 'out') {
          summary.total_out += row.total || 0;
          summary.count_out += row.count || 0;
        }
        
        if (row.category_name) {
          if (!summary.categories[row.category_name]) {
            summary.categories[row.category_name] = { in: 0, out: 0 };
          }
          summary.categories[row.category_name][row.type] = row.total || 0;
        }
      });
      
      summary.net_balance = summary.total_in - summary.total_out;
      summary.total_transactions = summary.count_in + summary.count_out;
      
      res.json(summary);
    }
  });
});

// Get account balances
app.get('/api/account-balances', (req, res) => {
  const query = `
    SELECT 
      a.id,
      a.name,
      COALESCE(SUM(CASE WHEN t.type = 'in' THEN t.amount ELSE 0 END) - 
               SUM(CASE WHEN t.type = 'out' THEN t.amount ELSE 0 END), 0) as balance,
      COUNT(t.id) as transaction_count
    FROM accounts a
    LEFT JOIN transactions t ON a.id = t.account_id
    GROUP BY a.id, a.name
    ORDER BY a.id
  `;
  
  db.all(query, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Get spending trends for charts
app.get('/api/spending-trends', (req, res) => {
  const { period = 'monthly', months = 12 } = req.query;
  
  let dateFormat;
  switch(period) {
    case 'daily':
      dateFormat = '%Y-%m-%d';
      break;
    case 'weekly':
      dateFormat = '%Y-%W';
      break;
    case 'monthly':
      dateFormat = '%Y-%m';
      break;
    case 'yearly':
      dateFormat = '%Y';
      break;
    default:
      dateFormat = '%Y-%m';
  }
  
  const query = `
    SELECT 
      strftime('${dateFormat}', date) as period,
      type,
      SUM(amount) as total,
      COUNT(*) as count
    FROM transactions 
    WHERE date >= date('now', '-${months} months')
    GROUP BY strftime('${dateFormat}', date), type
    ORDER BY period
  `;
  
  db.all(query, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      const trends = {};
      rows.forEach(row => {
        if (!trends[row.period]) {
          trends[row.period] = { in: 0, out: 0, count_in: 0, count_out: 0 };
        }
        trends[row.period][row.type] = row.total || 0;
        trends[row.period]['count_' + row.type] = row.count || 0;
      });
      res.json(trends);
    }
  });
});

// Helper function to convert to CSV
function convertToCSV(data) {
  if (!data || data.length === 0) {
    return 'Date,Account,Category,Reason,Type,Amount\n';
  }
  
  const headers = ['Date', 'Account', 'Category', 'Reason', 'Type', 'Amount'];
  const csvContent = data.map(row => {
    return [
      row.date,
      row.account || '',
      row.category || 'Uncategorized',
      row.reason || '',
      row.type || '',
      row.amount || 0
    ].map(field => `"${field}"`).join(',');
  }).join('\n');
  
  return [headers.join(','), csvContent].join('\n');
}

// Export transactions as CSV
app.get('/api/export/csv', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { start, end } = req.query;
  
  let query = `
    SELECT t.date, a.name as account, COALESCE(c.name, 'Uncategorized') as category,
           t.reason, t.type, t.amount
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ?
  `;
  const params = [userId];
  
  if (start && end) {
    query += " AND t.date BETWEEN ? AND ?";
    params.push(start, end);
  }
  
  query += " ORDER BY t.date DESC";
  
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Convert to CSV
    const csv = convertToCSV(rows);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
    res.send(csv);
  });
});

// Serve frontend for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve frontend for any other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`MoneyFlow Tracker server running on http://localhost:${PORT}`);
});
