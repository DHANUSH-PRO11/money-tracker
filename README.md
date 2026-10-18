# MoneyFlow Tracker

A full-stack web application for tracking personal income and expenses.

## Features

- **Transaction Management**: Add, view, and delete transactions
- **Multiple Accounts**: Track money across different accounts (GPAY, CASH, etc.)
- **Real-time Dashboard**: View account balances and summary statistics
- **Search & Filter**: Search transactions and filter by account
- **Responsive Design**: Works on desktop and mobile devices
- **Dark Theme**: Modern dark interface with gradient accents

## Tech Stack

### Frontend
- **HTML5**: Semantic structure
- **CSS3**: Modern styling with CSS variables and gradients
- **Vanilla JavaScript**: No framework dependencies
- **Responsive Design**: Mobile-first approach

### Backend
- **Node.js**: JavaScript runtime
- **Express.js**: Web framework
- **SQLite3**: Lightweight database
- **CORS**: Cross-origin resource sharing

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm (comes with Node.js)

### Setup Steps

1. **Clone or download the project**
   ```bash
   cd "money treacker"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

4. **Open the application**
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
money treacker/
├── server.js              # Express server and API endpoints
├── package.json           # Dependencies and scripts
├── moneyflow.db          # SQLite database (created automatically)
├── public/               # Frontend files
│   ├── index.html        # Main HTML file
│   ├── styles.css        # CSS styling
│   └── script.js         # Frontend JavaScript
├── html.html             # Original single-file version
├── index.html            # Separated HTML version
├── styles.css            # Separated CSS version
└── script.js             # Separated JavaScript version
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Authenticate user & receive JWT token
- `POST /api/auth/google` - Authenticate via Google OAuth session
- `GET /api/auth/verify` - Validate active JWT token
- `GET /api/user/profile` - Fetch current user profile
- `PUT /api/user/profile` - Update name and email
- `PUT /api/user/password` - Update password

### Accounts
- `GET /api/accounts` - Get all accounts for authenticated user
- `POST /api/accounts` - Create new account (e.g. CASH, GPAY, FANPAY)
- `PUT /api/accounts/:id` - Rename account
- `DELETE /api/accounts/:id` - Delete account (if no transactions exist)

### Categories
- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create custom category with color & emoji icon
- `PUT /api/categories/:id` - Update category details
- `DELETE /api/categories/:id` - Delete category

### Transactions
- `GET /api/transactions` - Get user transactions (supports filters: `startDate`, `endDate`, `categoryId`, `accountId`)
- `POST /api/transactions` - Create new transaction
- `PUT /api/transactions/:id` - Edit and update existing transaction (date, amount, reason, account, category, type)
- `DELETE /api/transactions/:id` - Delete transaction (automatically removes linked transfer leg if transfer)

### Account-to-Account Transfers
- `POST /api/transfers` - Atomic transfer between two accounts belonging to the authenticated user. Excluded from income/expense calculations while correctly adjusting account balances.

### Savings Goals
- `GET /api/goals` - List all savings goals for authenticated user
- `POST /api/goals` - Create a new savings target (`name`, `target_amount`, `current_amount`, `target_date`, `color`)
- `PUT /api/goals/:id` - Update savings goal details
- `DELETE /api/goals/:id` - Remove savings goal
- `POST /api/goals/:id/contribute` - Add money to goal with optional linked transaction deduction

### Recurring Transactions & Scheduled Bills
- `GET /api/recurring` - List user recurring rules and bills
- `POST /api/recurring` - Create recurring schedule (`account_id`, `category_id`, `reason`, `amount`, `type`, `frequency`, `next_date`)
- `PUT /api/recurring/:id` - Update recurring schedule details
- `DELETE /api/recurring/:id` - Delete recurring schedule
- `POST /api/recurring/:id/process` - Execute payment now, log transaction, and automatically advance `next_date` based on frequency

### Budgets
- `GET /api/budgets` - Get category budgets for user
- `POST /api/budgets` - Create monthly budget cap per category
- `PUT /api/budgets/:id` - Update budget cap
- `DELETE /api/budgets/:id` - Delete budget

### Analytics & Insights
- `GET /api/summary` - Aggregated income, expenses, and net balance (excluding internal transfers)
- `GET /api/account-balances` - Real-time balances and transaction count per account
- `GET /api/spending-trends` - Time-series spending trends (monthly, weekly, daily)
- `GET /api/category-breakdown` - Category expenditure breakdown for donut charts
- `GET /api/insights` - Actionable financial alerts, upcoming bills due in 7 days, and budget warnings

### CSV & JSON Import / Export & Backup
- `POST /api/import/csv/preview` - Validate CSV rows, detect existing duplicates, and preview before importing
- `POST /api/import/csv` - Atomically import transactions with duplicate skipping option
- `GET /api/backup` - Export complete user dataset with schema versioning 1.0 (accounts, categories, transactions, budgets, goals, recurring)
- `POST /api/backup/restore` - Atomically validate schema and restore user data
- `GET /api/export/csv` - Export transactions as CSV spreadsheet
- `GET /api/export/json` - Export transactions as structured JSON

## Available Scripts

In the project root, you can run:

- `npm start` - Launches the production server (runs on `PORT=3001` or next free port).
- `npm run dev` - Launches server with nodemon auto-reload.
- `npm test` - Runs the comprehensive automated test suite (35 tests covering auth, isolation, CRUD, transfers, goals, recurring, CSV import, backup/restore, exports).
- `npm run seed` - Runs dataset seeding into local SQLite (`moneyflow.db`).
- `npm run import` - Runs dataset import.
- `npm run migrate` - Migrates local SQLite records to cloud Supabase instance.
- `npm run clear` - Safely wipes test tables in SQLite and Supabase.

## Automated Testing

Run the automated test suite anytime using Node's native test runner:
```bash
npm test
```
The test suite validates:
1. User registration, login, duplicate email rejection, invalid password rejection, and token verification.
2. User data isolation across all endpoints.
3. Transaction CRUD operations, date/amount validation, and cross-user authorization enforcement.
4. Account-to-account atomic transfers, same-account prevention, balance calculations, and transfer exclusion from income/expense totals.
5. Savings goals CRUD and contribution progress calculations.
6. Recurring transaction processing and schedule advancement.
7. Actionable financial insights and upcoming bill detection.
8. CSV import duplicate detection and execution.
9. JSON backup schema validation and restore.
10. Data export user scoping and CSV/JSON formatting.

## Database Schema

- **Users**: `id`, `name`, `email`, `password`, `created_at`
- **Accounts**: `id`, `name`, `user_id`, `created_at` (composite `UNIQUE(name, user_id)`)
- **Categories**: `id`, `name`, `color`, `icon`, `created_at`
- **Transactions**: `id`, `date`, `account_id`, `category_id`, `reason`, `amount`, `type`, `is_transfer`, `transfer_account_id`, `related_transaction_id`, `created_at`
- **Budgets**: `id`, `user_id`, `category_id`, `amount`, `period`, `created_at`
- **Recurring Transactions**: `id`, `user_id`, `account_id`, `category_id`, `reason`, `amount`, `type`, `frequency`, `next_date`, `is_active`, `created_at`
- **Savings Goals**: `id`, `user_id`, `name`, `target_amount`, `current_amount`, `target_date`, `color`, `created_at`

## Security & Data Integrity

- **SQL Injection Prevention**: All queries use parameterized inputs (`?` placeholders).
- **Authentication & Authorization**: Protected endpoints require valid JWT tokens; every query is scoped to `req.user.id`.
- **Password Security**: Passwords are hashed using bcrypt with salt rounds of 10.
- **Port Conflict Handling**: Automatically detects port in-use errors (`EADDRINUSE`) and gracefully falls back to the next available port.
- **Atomic Operations**: Database transactions (`BEGIN TRANSACTION ... COMMIT ... ROLLBACK`) ensure that multi-step operations (transfers, imports, restores) maintain consistency.
- **Precision Floating Point**: Monetary amounts are rounded to two decimal places (`Math.round(amt * 100) / 100`) to avoid floating-point drift.

## License

MIT License

