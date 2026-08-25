require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { supabase } = require('./supabaseClient');
const path = require('path');

async function clearSupabaseData() {
  console.log('🧹 Clearing data from Supabase...');

  // Delete child tables first to respect foreign key constraints
  const tables = [
    'recurring_transactions',
    'budgets',
    'transactions',
    'accounts',
    'users'
  ];

  for (const table of tables) {
    const { error, count } = await supabase
      .from(table)
      .delete()
      .neq('id', -999999); // deletes all rows

    if (error) {
      console.error(`  ❌ Failed to clear ${table} in Supabase:`, error.message);
    } else {
      console.log(`  ✓ Cleared all rows from Supabase "${table}" table.`);
    }
  }
}

async function clearSqliteData() {
  console.log('\n🧹 Clearing data from local SQLite database (moneyflow.db)...');
  const dbPath = path.join(__dirname, 'moneyflow.db');
  const sqlite = new sqlite3.Database(dbPath);

  const tables = [
    'recurring_transactions',
    'budgets',
    'transactions',
    'accounts',
    'users'
  ];

  for (const table of tables) {
    await new Promise((resolve) => {
      sqlite.run(`DELETE FROM ${table}`, [], (err) => {
        if (err) {
          console.error(`  ❌ Failed to clear ${table} in SQLite:`, err.message);
        } else {
          console.log(`  ✓ Cleared all rows from SQLite "${table}" table.`);
        }
        resolve();
      });
    });
  }

  // Vacuum SQLite database to reset space
  await new Promise((resolve) => {
    sqlite.run('VACUUM', () => {
      sqlite.close();
      resolve();
    });
  });
}

async function main() {
  await clearSupabaseData();
  await clearSqliteData();
  console.log('\n✨ All data in Supabase and local SQLite has been permanently wiped clean!');
}

main().catch(err => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
