require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { supabase } = require('./supabaseClient');
const path = require('path');

const dbPath = path.join(__dirname, 'moneyflow.db');
const sqlite = new sqlite3.Database(dbPath);

async function runMigration() {
  console.log('🚀 Starting data migration from SQLite to Supabase...\n');

  // 1. Fetch SQLite Categories and Supabase Categories to build category mapping
  const supabaseCategoriesRes = await supabase.from('categories').select('*');
  if (supabaseCategoriesRes.error) {
    throw new Error('Error fetching Supabase categories: ' + supabaseCategoriesRes.error.message);
  }
  const supabaseCategories = supabaseCategoriesRes.data;
  console.log(`✓ Loaded ${supabaseCategories.length} categories from Supabase.`);

  const categoryMap = {}; // sqlite_category_id -> supabase_category_id
  await new Promise((resolve, reject) => {
    sqlite.all('SELECT * FROM categories', [], (err, rows) => {
      if (err) return reject(err);
      rows.forEach(sqCat => {
        const match = supabaseCategories.find(
          supCat => supCat.name.toLowerCase().trim() === sqCat.name.toLowerCase().trim()
        );
        if (match) {
          categoryMap[sqCat.id] = match.id;
        }
      });
      resolve();
    });
  });

  // 2. Fetch SQLite Users
  const sqliteUsers = await new Promise((resolve, reject) => {
    sqlite.all('SELECT * FROM users', [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
  console.log(`✓ Found ${sqliteUsers.length} user(s) in SQLite.`);

  const userMap = {}; // sqlite_user_id -> supabase_user_id

  for (const user of sqliteUsers) {
    // Check if user already exists in Supabase
    const { data: existingUser, error: findErr } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', user.email)
      .maybeSingle();

    if (findErr) throw findErr;

    if (existingUser) {
      userMap[user.id] = existingUser.id;
      console.log(`  - User "${user.name}" (${user.email}) already exists in Supabase (ID: ${existingUser.id}).`);
    } else {
      const { data: newUser, error: insertErr } = await supabase
        .from('users')
        .insert({
          name: user.name,
          email: user.email,
          password: user.password,
          created_at: user.created_at || new Date().toISOString()
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      userMap[user.id] = newUser.id;
      console.log(`  + Inserted User "${user.name}" into Supabase (ID: ${newUser.id}).`);
    }
  }

  // 3. Fetch SQLite Accounts
  const sqliteAccounts = await new Promise((resolve, reject) => {
    sqlite.all('SELECT * FROM accounts', [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
  console.log(`\n✓ Found ${sqliteAccounts.length} account(s) in SQLite.`);

  const accountMap = {}; // sqlite_account_id -> supabase_account_id

  for (const acc of sqliteAccounts) {
    const supabaseUserId = userMap[acc.user_id];
    if (!supabaseUserId) continue;

    // Check if account already exists for user
    const { data: existingAcc, error: accErr } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('user_id', supabaseUserId)
      .eq('name', acc.name)
      .maybeSingle();

    if (accErr) throw accErr;

    if (existingAcc) {
      accountMap[acc.id] = existingAcc.id;
      console.log(`  - Account "${acc.name}" for user ID ${supabaseUserId} already exists (ID: ${existingAcc.id}).`);
    } else {
      const { data: newAcc, error: insertAccErr } = await supabase
        .from('accounts')
        .insert({
          name: acc.name,
          user_id: supabaseUserId,
          created_at: acc.created_at || new Date().toISOString()
        })
        .select()
        .single();

      if (insertAccErr) throw insertAccErr;
      accountMap[acc.id] = newAcc.id;
      console.log(`  + Inserted Account "${acc.name}" (ID: ${newAcc.id}) for user ID ${supabaseUserId}.`);
    }
  }

  // 4. Fetch SQLite Transactions
  const sqliteTransactions = await new Promise((resolve, reject) => {
    sqlite.all('SELECT * FROM transactions', [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
  console.log(`\n✓ Found ${sqliteTransactions.length} transaction(s) in SQLite.`);

  // Prepare transactions for Supabase insertion
  const transactionsToInsert = [];
  for (const tx of sqliteTransactions) {
    const supabaseAccountId = accountMap[tx.account_id];
    if (!supabaseAccountId) continue;

    const supabaseCategoryId = categoryMap[tx.category_id] || null;

    transactionsToInsert.push({
      date: tx.date,
      account_id: supabaseAccountId,
      category_id: supabaseCategoryId,
      reason: tx.reason,
      amount: tx.amount,
      type: tx.type,
      created_at: tx.created_at || new Date().toISOString()
    });
  }

  if (transactionsToInsert.length > 0) {
    // Check if transactions already exist to avoid duplicate migration
    const { count, error: countErr } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true });

    if (countErr) throw countErr;

    if (count && count > 0) {
      console.log(`  ℹ️ Supabase already has ${count} transactions.`);
      console.log(`  Inserting ${transactionsToInsert.length} transactions in batches...`);
    }

    // Insert in batches of 50
    const batchSize = 50;
    for (let i = 0; i < transactionsToInsert.length; i += batchSize) {
      const batch = transactionsToInsert.slice(i, i + batchSize);
      const { error: batchErr } = await supabase.from('transactions').insert(batch);
      if (batchErr) throw batchErr;
      console.log(`  + Uploaded batch ${Math.floor(i / batchSize) + 1} (${batch.length} transactions)`);
    }
  }

  console.log('\n🎉 Migration completed successfully!');
  sqlite.close();
}

runMigration().catch(err => {
  console.error('\n❌ Migration failed:', err);
  sqlite.close();
  process.exit(1);
});
