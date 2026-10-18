process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../server');

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    // Listen on an ephemeral port
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

// Helper for HTTP requests
async function req(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const fetchOptions = {
    method: options.method || 'GET',
    headers,
    ...(options.body ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) } : {})
  };
  const res = await fetch(url, fetchOptions);
  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, headers: res.headers, data };
}

test('API & Authentication Flow', async (t) => {
  const testUserA = {
    name: 'Test Auditor A',
    email: `auditor_a_${Date.now()}@example.com`,
    password: 'Password123!'
  };
  const testUserB = {
    name: 'Test Auditor B',
    email: `auditor_b_${Date.now()}@example.com`,
    password: 'Password123!'
  };

  let tokenA = '';
  let tokenB = '';
  let userAId = null;
  let userBId = null;

  await t.test('POST /api/auth/register creates new user with default accounts', async () => {
    const res = await req('/api/auth/register', { method: 'POST', body: testUserA });
    assert.strictEqual(res.status, 201);
    assert.ok(res.data.token);
    assert.strictEqual(res.data.user.email, testUserA.email);
    tokenA = res.data.token;
    userAId = res.data.user.id;
  });

  await t.test('POST /api/auth/register rejects duplicate email', async () => {
    const res = await req('/api/auth/register', { method: 'POST', body: testUserA });
    assert.strictEqual(res.status, 400);
    assert.match(res.data.error, /already exists/i);
  });

  await t.test('POST /api/auth/login logs in user successfully', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: { email: testUserA.email, password: testUserA.password }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.token);
  });

  await t.test('POST /api/auth/login rejects invalid password', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      body: { email: testUserA.email, password: 'WrongPassword!' }
    });
    assert.ok([400, 401].includes(res.status));
    assert.match(res.data.error, /invalid/i);
  });

  await t.test('GET /api/auth/verify verifies valid token', async () => {
    const res = await req('/api/auth/verify', {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user.email, testUserA.email);
  });

  await t.test('GET /api/transactions rejects unauthorized requests without token', async () => {
    const res = await req('/api/transactions');
    assert.strictEqual(res.status, 401);
  });

  await t.test('GET /api/transactions rejects malformed / fake token', async () => {
    const res = await req('/api/transactions', {
      headers: { Authorization: 'Bearer fake.invalid.token' }
    });
    assert.strictEqual(res.status, 403);
  });

  // Register User B for user data isolation tests
  const regB = await req('/api/auth/register', { method: 'POST', body: testUserB });
  assert.strictEqual(regB.status, 201);
  tokenB = regB.data.token;
  userBId = regB.data.user.id;

  await t.test('User isolation: User B cannot see User A accounts', async () => {
    const resA = await req('/api/accounts', { headers: { Authorization: `Bearer ${tokenA}` } });
    const resB = await req('/api/accounts', { headers: { Authorization: `Bearer ${tokenB}` } });
    assert.strictEqual(resA.status, 200);
    assert.strictEqual(resB.status, 200);

    const aIds = new Set(resA.data.map(a => a.id));
    for (const acc of resB.data) {
      assert.strictEqual(aIds.has(acc.id), false, 'Account ID must not leak between users');
    }
  });
});

test('Transactions, Accounts & User Isolation', async (t) => {
  // Setup User A
  const uA = { name: 'Txn User A', email: `txn_a_${Date.now()}@example.com`, password: 'Password123!' };
  const uB = { name: 'Txn User B', email: `txn_b_${Date.now()}@example.com`, password: 'Password123!' };

  const regA = await req('/api/auth/register', { method: 'POST', body: uA });
  const regB = await req('/api/auth/register', { method: 'POST', body: uB });
  const tokenA = regA.data.token;
  const tokenB = regB.data.token;

  // Get accounts for User A
  const accsResA = await req('/api/accounts', { headers: { Authorization: `Bearer ${tokenA}` } });
  const accsA = accsResA.data;
  assert.ok(accsA.length >= 2, 'User A should have at least 2 default accounts');

  const accsResB = await req('/api/accounts', { headers: { Authorization: `Bearer ${tokenB}` } });
  const accsB = accsResB.data;

  let createdTxnId = null;

  await t.test('POST /api/transactions creates valid income and expense', async () => {
    const res = await req('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        date: '2026-10-18',
        account_id: accsA[0].id,
        reason: 'Monthly Salary',
        amount: 50000,
        type: 'in'
      }
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.amount, 50000);
    createdTxnId = res.data.id;

    // Add expense
    const resExp = await req('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        date: '2026-10-18',
        account_id: accsA[0].id,
        reason: 'Groceries',
        amount: 2500.50,
        type: 'out'
      }
    });
    assert.strictEqual(resExp.status, 201);
    assert.strictEqual(resExp.data.amount, 2500.50);
  });

  await t.test('POST /api/transactions rejects invalid inputs', async () => {
    // Negative amount
    const r1 = await req('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { date: '2026-10-18', account_id: accsA[0].id, reason: 'Bad', amount: -50, type: 'in' }
    });
    assert.strictEqual(r1.status, 400);

    // Invalid date format
    const r2 = await req('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { date: '18-10-2026', account_id: accsA[0].id, reason: 'Bad Date', amount: 50, type: 'in' }
    });
    assert.strictEqual(r2.status, 400);

    // Invalid type
    const r3 = await req('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { date: '2026-10-18', account_id: accsA[0].id, reason: 'Bad Type', amount: 50, type: 'borrow' }
    });
    assert.strictEqual(r3.status, 400);
  });

  await t.test('POST /api/transactions prevents cross-user account forgery', async () => {
    // User A attempts to create transaction in User B's account
    const res = await req('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        date: '2026-10-18',
        account_id: accsB[0].id,
        reason: 'Hacked entry',
        amount: 100,
        type: 'in'
      }
    });
    assert.strictEqual(res.status, 403);
  });

  await t.test('PUT /api/transactions/:id updates transaction', async () => {
    const res = await req(`/api/transactions/${createdTxnId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        date: '2026-10-18',
        account_id: accsA[0].id,
        reason: 'Monthly Salary Updated',
        amount: 55000,
        type: 'in'
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.amount, 55000);
  });

  await t.test('DELETE /api/transactions/:id prevents cross-user deletion', async () => {
    // User B attempts to delete User A's transaction
    const res = await req(`/api/transactions/${createdTxnId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.strictEqual(res.status, 404);
  });

  await t.test('DELETE /api/transactions/:id deletes owner transaction', async () => {
    const res = await req(`/api/transactions/${createdTxnId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.strictEqual(res.status, 200);
  });
});

test('Account-to-Account Transfers & Balance Integrity', async (t) => {
  const u = { name: 'Transfer User', email: `transfer_${Date.now()}@example.com`, password: 'Password123!' };
  const reg = await req('/api/auth/register', { method: 'POST', body: u });
  const token = reg.data.token;

  const accsRes = await req('/api/accounts', { headers: { Authorization: `Bearer ${token}` } });
  const [accFrom, accTo] = accsRes.data;

  // Seed source account with 10,000 initial deposit
  await req('/api/transactions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: { date: '2026-10-18', account_id: accFrom.id, reason: 'Initial Deposit', amount: 10000, type: 'in' }
  });

  let transferOutflowId = null;

  await t.test('POST /api/transfers executes atomic transfer between accounts', async () => {
    const res = await req('/api/transfers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        date: '2026-10-18',
        from_account_id: accFrom.id,
        to_account_id: accTo.id,
        amount: 3000,
        reason: 'Bank transfer'
      }
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.transfer.amount, 3000);
    transferOutflowId = res.data.transfer.outflow_id;
  });

  await t.test('POST /api/transfers rejects transfer to the same account', async () => {
    const res = await req('/api/transfers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        date: '2026-10-18',
        from_account_id: accFrom.id,
        to_account_id: accFrom.id,
        amount: 500
      }
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.data.error, /same account/i);
  });

  await t.test('Account balances correctly reflect debit and credit', async () => {
    const res = await req('/api/account-balances', { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(res.status, 200);

    const bFrom = res.data.find(a => a.id === accFrom.id);
    const bTo = res.data.find(a => a.id === accTo.id);

    // Initial 10000 - 3000 transferred = 7000
    assert.strictEqual(bFrom.balance, 7000);
    // 0 + 3000 received = 3000
    assert.strictEqual(bTo.balance, 3000);
  });

  await t.test('Transfers are EXCLUDED from summary total_in and total_out', async () => {
    const res = await req('/api/summary', { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(res.status, 200);

    // Only the 10000 initial deposit should count as income, NOT the 3000 transfer
    assert.strictEqual(res.data.total_in, 10000);
    // Outflow of 3000 transfer must NOT count as expense
    assert.strictEqual(res.data.total_out, 0);
    assert.strictEqual(res.data.net_balance, 10000);
  });

  await t.test('Deleting one leg of a transfer atomically deletes counterpart leg', async () => {
    const res = await req(`/api/transactions/${transferOutflowId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);

    // Verify both accounts returned to pre-transfer state
    const balRes = await req('/api/account-balances', { headers: { Authorization: `Bearer ${token}` } });
    const bFrom = balRes.data.find(a => a.id === accFrom.id);
    const bTo = balRes.data.find(a => a.id === accTo.id);

    assert.strictEqual(bFrom.balance, 10000);
    assert.strictEqual(bTo.balance, 0);
  });
});

test('Savings Goals CRUD & Contributions', async (t) => {
  const u = { name: 'Goal User', email: `goal_${Date.now()}@example.com`, password: 'Password123!' };
  const reg = await req('/api/auth/register', { method: 'POST', body: u });
  const token = reg.data.token;

  let goalId = null;

  await t.test('POST /api/goals creates savings goal', async () => {
    const res = await req('/api/goals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { name: 'Trip to Tokyo', target_amount: 150000, color: '#38bdf8' }
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.name, 'Trip to Tokyo');
    assert.strictEqual(res.data.target_amount, 150000);
    goalId = res.data.id;
  });

  await t.test('POST /api/goals/:id/contribute adds contribution and recalculates progress', async () => {
    const res = await req(`/api/goals/${goalId}/contribute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { amount: 30000 }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.current_amount, 30000);
    assert.strictEqual(res.data.progress, 20); // 30000 / 150000 = 20%
  });

  await t.test('DELETE /api/goals/:id removes goal', async () => {
    const res = await req(`/api/goals/${goalId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
  });
});

test('Recurring Transactions & Bill Processing', async (t) => {
  const u = { name: 'Recurring User', email: `rec_${Date.now()}@example.com`, password: 'Password123!' };
  const reg = await req('/api/auth/register', { method: 'POST', body: u });
  const token = reg.data.token;

  const accsRes = await req('/api/accounts', { headers: { Authorization: `Bearer ${token}` } });
  const acc = accsRes.data[0];

  let recId = null;

  await t.test('POST /api/recurring schedules a recurring bill', async () => {
    const res = await req('/api/recurring', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        account_id: acc.id,
        reason: 'Apartment Fiber Internet',
        amount: 999.00,
        type: 'out',
        frequency: 'monthly',
        next_date: '2026-10-25'
      }
    });
    assert.strictEqual(res.status, 201);
    recId = res.data.id;
  });

  await t.test('POST /api/recurring/:id/process logs transaction and advances next_date', async () => {
    const res = await req(`/api/recurring/${recId}/process`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.transaction_id);
    // next_date should advance by 1 month: 2026-10-25 -> 2026-11-25
    assert.strictEqual(res.data.next_date, '2026-11-25');
  });

  await t.test('GET /api/insights reports actionable metrics and upcoming bills', async () => {
    const res = await req('/api/insights', { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.metrics);
  });
});

test('CSV Import with Duplicate Detection & JSON Backup/Restore', async (t) => {
  const u = { name: 'Backup User', email: `backup_${Date.now()}@example.com`, password: 'Password123!' };
  const reg = await req('/api/auth/register', { method: 'POST', body: u });
  const token = reg.data.token;

  const accs = (await req('/api/accounts', { headers: { Authorization: `Bearer ${token}` } })).data;

  // Insert a baseline transaction
  await req('/api/transactions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: { date: '2026-10-10', account_id: accs[0].id, reason: 'Coffee', amount: 150, type: 'out' }
  });

  await t.test('POST /api/import/csv/preview detects duplicate row', async () => {
    const rawCSV = `Date,Account,Category,Reason,Type,Amount\n2026-10-10,${accs[0].name},Food,Coffee,out,150\n2026-10-12,${accs[0].name},Food,Sandwich,out,250`;
    const res = await req('/api/import/csv/preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { csvData: rawCSV }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.total_rows, 2);
    assert.strictEqual(res.data.duplicate_rows, 1);
    assert.strictEqual(res.data.valid_rows, 1);
  });

  await t.test('GET /api/backup exports valid schema 1.0 JSON', async () => {
    const res = await req('/api/backup', { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.schema_version, '1.0');
    assert.ok(Array.isArray(res.data.transactions));
    assert.ok(Array.isArray(res.data.accounts));
  });

  await t.test('POST /api/backup/restore rejects invalid schema version', async () => {
    const res = await req('/api/backup/restore', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { schema_version: '99.0', transactions: [] }
    });
    assert.strictEqual(res.status, 400);
  });

  await t.test('GET /api/export/csv and /api/export/json return user data only', async () => {
    const resCsv = await req('/api/export/csv', { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(resCsv.status, 200);
    assert.match(resCsv.data, /Date,Account,Category,Reason,Type,Amount/);

    const resJson = await req('/api/export/json', { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(resJson.status, 200);
    assert.strictEqual(resJson.data.user, u.name);
  });
});
