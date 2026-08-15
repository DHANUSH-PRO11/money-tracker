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

### Accounts
- `GET /api/accounts` - Get all accounts
- `POST /api/accounts` - Create new account
- `PUT /api/accounts/:id` - Update account name

### Transactions
- `GET /api/transactions` - Get all transactions
- `POST /api/transactions` - Create new transaction
- `DELETE /api/transactions/:id` - Delete transaction

### Summary
- `GET /api/summary` - Get summary statistics
- `GET /api/account-balances` - Get account balances

## Database Schema

### Accounts Table
- `id` (INTEGER PRIMARY KEY)
- `name` (TEXT UNIQUE)
- `created_at` (DATETIME)

### Transactions Table
- `id` (INTEGER PRIMARY KEY)
- `date` (TEXT)
- `account_id` (INTEGER)
- `reason` (TEXT)
- `amount` (REAL)
- `type` (TEXT: 'in' or 'out')
- `created_at` (DATETIME)

## Usage

1. **Adding Transactions**
   - Go to the Home page
   - Fill in the transaction details
   - Select SPENT for expenses or RECEIVED for income
   - Click "Add Entry"

2. **Viewing Dashboard**
   - Click "Dashboard" tab
   - View account balances and summary
   - Search and filter transactions
   - Click account names to filter by account

3. **Managing Accounts**
   - Click on account names in the dashboard to rename
   - Account names are automatically converted to uppercase

## Development

### Adding New Features
- Frontend: Modify files in `public/` directory
- Backend: Modify `server.js`
- Database: Changes to schema require database recreation

### Environment Variables
- `PORT`: Server port (default: 3000)

## Deployment

### Production Considerations
- Use environment variables for configuration
- Set up proper database backups
- Consider using PostgreSQL for production
- Add authentication and user management
- Implement proper error handling and logging

## License

MIT License

## Support

For issues or feature requests, please check the code structure and modify accordingly.
