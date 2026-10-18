/* ═══════════════════════════════════════════════════════════
   MoneyFlow Tracker — Frontend Script
   Full rewrite: fixed fmt(), theme toggle, Charts tab,
   date-range filter, loading states, user greeting
═══════════════════════════════════════════════════════════ */

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const API_BASE = window.location.origin + '/api';

let accounts       = [];
let txns           = [];
let budgets        = [];
let categories     = [];
let savingsGoals   = [];
let recurringBills = [];
let curFilter      = 'all';
let curType        = 'out';
let charts         = {};
let activePage     = localStorage.getItem('activePage') || 'home';
let dateRangeDays  = 30; // default filter for dashboard
let currentPage    = 1;
let pageSize       = 25;
let pendingCSVRows = [];

// ─── NUMBER FORMATTER ─────────────────────────────────────────────────────────

/** Format number as ₹1,23,456.00 (Indian numbering) */
const fmt = n => {
  const abs = Math.abs(n);
  const str = abs.toFixed(2);
  const [intPart, dec] = str.split('.');
  // Indian numbering: last 3 digits, then groups of 2
  const lastThree = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const formatted = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
    : lastThree;
  return '₹' + formatted + '.' + dec;
};

// ─── THEME ────────────────────────────────────────────────────────────────────

function toggleTheme() {
  const body = document.body;
  const current = body.getAttribute('data-theme') || 'dark';
  const next    = current === 'light' ? 'dark' : 'light';
  body.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.getElementById('theme-btn').textContent = next === 'light' ? '🌙' : '☀️';
  // Re-draw charts with new theme colors
  if (activePage === 'charts') loadCharts();
}

function loadTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.body.setAttribute('data-theme', saved);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = saved === 'light' ? '🌙' : '☀️';
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/landing.html';
    return false;
  }
  return true;
}

async function logout() {
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      const res = await fetch(API_BASE + '/config').catch(() => null);
      if (res && res.ok) {
        const config = await res.json();
        if (config.supabaseUrl && config.supabaseAnonKey) {
          const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
          await client.auth.signOut().catch(() => {});
        }
      }
    }
  } catch (e) {
    console.warn('Supabase signOut error:', e);
  }

  // Clear all auth items from localStorage
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('sb-') || key === 'token' || key === 'user' || key === 'activePage')) {
      localStorage.removeItem(key);
    }
  }

  window.location.href = '/login.html';
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  try {
    const response = await fetch(API_BASE + endpoint, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': 'Bearer ' + token }),
        ...options.headers
      },
      ...options
    });

    if (response.status === 401 || response.status === 403) {
      logout(); return;
    }
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    showToast('❌ ' + error.message, true);
    throw error;
  }
}

// ─── LOADING ──────────────────────────────────────────────────────────────────

function showLoading()  { document.getElementById('loading-overlay').classList.remove('hidden'); }
function hideLoading()  { document.getElementById('loading-overlay').classList.add('hidden'); }

// ─── USER GREETING & SETTINGS ─────────────────────────────────────────────────

let currentUserProfile = null;

function updateUserDisplay() {
  const userJson = localStorage.getItem('user');
  if (!userJson) return;
  try {
    const user = JSON.parse(userJson);
    const pill = document.getElementById('nav-user');
    if (pill && user.name) {
      pill.textContent = '👤 ' + user.name.split(' ')[0];
      pill.title = `Logged in as: ${user.name} (${user.email || ''})`;
    }
  } catch (e) { /* ignore */ }
}

async function loadUserProfile() {
  try {
    let user = null;
    try {
      user = await apiCall('/user/profile');
    } catch (apiErr) {
      const stored = localStorage.getItem('user');
      user = stored ? JSON.parse(stored) : null;
    }
    if (user) {
      currentUserProfile = user;
      localStorage.setItem('user', JSON.stringify({ id: user.id || 1, name: user.name, email: user.email }));
      updateUserDisplay();

      const pName = document.getElementById('manage-profile-name');
      const pEmail = document.getElementById('manage-profile-email');
      const pAvatar = document.getElementById('manage-profile-avatar');
      const pDate = document.getElementById('manage-profile-date');

      if (pName && user.name) pName.textContent = user.name;
      if (pEmail && user.email) pEmail.textContent = user.email;
      if (pAvatar && user.name) {
        const initials = user.name.split(' ').map(n => n[0]).filter(Boolean).join('').substring(0, 2).toUpperCase();
        pAvatar.textContent = initials || '👤';
      }
      if (pDate) {
        const d = user.created_at ? new Date(user.created_at) : new Date();
        const formatted = isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        pDate.textContent = formatted ? `Member since ${formatted}` : 'Member';
      }
    }
  } catch (e) {
    console.warn('Profile display note:', e);
  }
}

function openUserSettingsModal(tab = 'profile') {
  const userJson = localStorage.getItem('user');
  let currentName = '';
  let currentEmail = '';
  if (userJson) {
    try {
      const u = JSON.parse(userJson);
      currentName = u.name || '';
      currentEmail = u.email || '';
    } catch (e) {}
  }
  if (currentUserProfile) {
    currentName = currentUserProfile.name || currentName;
    currentEmail = currentUserProfile.email || currentEmail;
  }

  const nameInput = document.getElementById('settings-user-name');
  const emailInput = document.getElementById('settings-user-email');
  if (nameInput) nameInput.value = currentName;
  if (emailInput) emailInput.value = currentEmail;

  // Clear password inputs
  const curPwd = document.getElementById('settings-current-pwd');
  const newPwd = document.getElementById('settings-new-pwd');
  const confPwd = document.getElementById('settings-confirm-pwd');
  if (curPwd) curPwd.value = '';
  if (newPwd) newPwd.value = '';
  if (confPwd) confPwd.value = '';

  switchSettingsTab(tab);
  document.getElementById('user-settings-modal').classList.add('show');
}

function closeUserSettingsModal() {
  document.getElementById('user-settings-modal').classList.remove('show');
}

function switchSettingsTab(tab) {
  const tabProf = document.getElementById('set-tab-profile');
  const tabSec = document.getElementById('set-tab-security');
  const panProf = document.getElementById('set-panel-profile');
  const panSec = document.getElementById('set-panel-security');

  if (tab === 'security') {
    if (tabProf) tabProf.classList.remove('on');
    if (tabSec) tabSec.classList.add('on');
    if (panProf) panProf.style.display = 'none';
    if (panSec) panSec.style.display = 'block';
  } else {
    if (tabProf) tabProf.classList.add('on');
    if (tabSec) tabSec.classList.remove('on');
    if (panProf) panProf.style.display = 'block';
    if (panSec) panSec.style.display = 'none';
  }
}

// Toggle password visibility
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPwd = input.type === 'password';
  input.type = isPwd ? 'text' : 'password';
  const openEye = btn.querySelector('.eye-open');
  const closedEye = btn.querySelector('.eye-closed');
  if (openEye && closedEye) {
    openEye.style.display = isPwd ? 'none' : 'block';
    closedEye.style.display = isPwd ? 'block' : 'none';
  }
  btn.title = isPwd ? 'Hide password' : 'Show password';
  btn.setAttribute('aria-label', isPwd ? 'Hide password' : 'Show password');
}

async function saveUserProfile() {
  const name = document.getElementById('settings-user-name').value.trim();
  const email = document.getElementById('settings-user-email').value.trim();

  if (!name || !email) {
    showToast('⚠️ Please enter both name and email', true);
    return;
  }

  try {
    const res = await apiCall('/user/profile', {
      method: 'PUT',
      body: JSON.stringify({ name, email })
    });

    if (res && res.token) {
      localStorage.setItem('token', res.token);
    }
    if (res && res.user) {
      localStorage.setItem('user', JSON.stringify(res.user));
      currentUserProfile = res.user;
    }

    updateUserDisplay();
    await loadUserProfile();
    closeUserSettingsModal();
    showToast('✅ Profile updated successfully!');
  } catch (e) {
    console.error('Failed to update user profile:', e);
  }
}

async function saveUserPassword() {
  const currentPassword = document.getElementById('settings-current-pwd').value;
  const newPassword = document.getElementById('settings-new-pwd').value;
  const confirmPassword = document.getElementById('settings-confirm-pwd').value;

  if (!currentPassword || !newPassword) {
    showToast('⚠️ Please enter current and new password', true);
    return;
  }

  if (newPassword.length < 6) {
    showToast('⚠️ New password must be at least 6 characters', true);
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('⚠️ Passwords do not match', true);
    return;
  }

  try {
    await apiCall('/user/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });

    closeUserSettingsModal();
    showToast('🔑 Password updated successfully!');
  } catch (e) {
    console.error('Failed to update password:', e);
  }
}

// ─── NAV BALANCE ──────────────────────────────────────────────────────────────

async function refreshNav() {
  try {
    const summary = await apiCall('/summary');
    const n  = summary.net_balance;
    const el = document.getElementById('nav-bal');
    el.textContent = (n < 0 ? '-' : '') + fmt(Math.abs(n));
    el.className   = n >= 0 ? 'bal-pill positive' : 'bal-pill negative';
  } catch (e) { /* silent */ }
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────

async function go(page) {
  const validPages = ['home', 'dash', 'charts', 'budgets', 'manage'];
  if (!validPages.includes(page)) page = 'home';

  activePage = page;
  localStorage.setItem('activePage', page);

  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.mob-tab').forEach(b => b.classList.remove('on'));

  document.getElementById('pg-' + page).classList.add('on');
  document.getElementById('t-' + page).classList.add('on');
  const mobTab = document.getElementById('m-' + page);
  if (mobTab) mobTab.classList.add('on');

  // Show floating calculator on home and dashboard
  const floatCalc = document.getElementById('floating-calculator');
  if (floatCalc) {
    floatCalc.style.display = (page === 'dash' || page === 'home') ? 'block' : 'none';
  }

  if (page === 'home')    drawHomeRecent();
  if (page === 'dash')    drawDash();
  if (page === 'charts')  loadCharts();
  if (page === 'manage')  showManagePage();
  if (page === 'budgets') showBudgetsPage();
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
});

function pickType(t) {
  curType = t;
  document.getElementById('tp-out').className = 'topt' + (t === 'out' ? ' out' : '');
  document.getElementById('tp-in').className  = 'topt' + (t === 'in'  ? ' in'  : '');
}

async function addEntry() {
  const date = document.getElementById('f-date').value;
  const aid  = parseInt(document.getElementById('f-acc').value);
  const cid  = document.getElementById('f-cat').value ? parseInt(document.getElementById('f-cat').value) : null;
  const rsn  = document.getElementById('f-reason').value.trim();
  const amt  = parseFloat(document.getElementById('f-amt').value);

  if (!aid || isNaN(aid)) {
    showToast('⚠️ Please create an account first in Manage (⚙️)', true);
    return;
  }

  if (!date || !rsn || isNaN(amt) || amt <= 0) {
    showToast('⚠️ Fill all fields correctly', true); return;
  }

  const btn = document.getElementById('btn-add-entry');
  btn.disabled = true; btn.querySelector('span').textContent = 'Adding…';

  try {
    const newTxn = await apiCall('/transactions', {
      method: 'POST',
      body: JSON.stringify({ date, account_id: aid, category_id: cid, reason: rsn, amount: amt, type: curType })
    });

    // Optimistically add to local list
    const cat = categories.find(c => c.id === cid);
    const acc = accounts.find(a => a.id === aid);
    newTxn.account_name   = acc ? acc.name : '';
    newTxn.category_name  = cat ? cat.name : null;
    newTxn.category_icon  = cat ? cat.icon : null;
    newTxn.category_color = cat ? cat.color : null;
    txns.unshift(newTxn);

    refreshNav();
    drawHomeRecent();

    document.getElementById('f-reason').value = '';
    document.getElementById('f-amt').value    = '';
    document.getElementById('f-cat').value    = '';

    showToast('✅ Entry added!');
  } catch (e) {
    console.error(e);
  } finally {
    btn.disabled = false; btn.querySelector('span').textContent = 'Add Entry';
  }
}

function drawHomeRecent() {
  const container = document.getElementById('home-recent');
  if (!container) return;

  const recent = txns.slice(0, 5);
  if (!recent.length) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <div class="home-recent-title">Recent Activity</div>
    ${recent.map(t => {
      const cat = categories.find(c => c.id === t.category_id);
      const icon = cat ? cat.icon : (t.type === 'in' ? '💰' : '💸');
      return `
      <div class="recent-item">
        <div class="recent-icon">${icon}</div>
        <div class="recent-info">
          <div class="recent-reason">${escHtml(t.reason)}</div>
          <div class="recent-meta">${t.date} · ${t.account_name || ''}</div>
        </div>
        <div class="recent-amount ${t.type === 'in' ? 'gi' : 'ri'}">
          ${t.type === 'in' ? '+' : '-'}${fmt(t.amount)}
        </div>
      </div>`;
    }).join('')}`;
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

async function drawDash() {
  try {
    const [accountBalances, summary] = await Promise.all([
      apiCall('/account-balances'),
      apiCall('/summary')
    ]);

    // Account cards
    document.getElementById('acc-grid').innerHTML = accountBalances.length === 0
      ? '<div class="budget-empty"><div class="ico">🏦</div><div>No accounts yet</div></div>'
      : accountBalances.map((a, i) => `
        <div class="acc-card">
          <div class="acc-name-row">
            <input class="acc-name" value="${escHtml(a.name)}"
              onchange="renameAcc(${a.id}, this.value)" title="Click to rename">
            <span class="edit-ico">✏️</span>
          </div>
          <div class="acc-bal">${fmt(a.balance)}</div>
          <div class="acc-sub">${a.transaction_count} transaction${a.transaction_count !== 1 ? 's' : ''}</div>
        </div>`).join('');

    // Filter buttons by account
    document.getElementById('filt-btns').innerHTML = accounts.map(a =>
      `<button class="fbtn ${curFilter == a.id ? 'on' : ''}" onclick="filt(${a.id}, this)">${a.name}</button>`
    ).join('');

    // Summary stats
    document.getElementById('s-in').textContent  = fmt(summary.total_in);
    document.getElementById('s-out').textContent = fmt(summary.total_out);

    const netEl = document.getElementById('s-net');
    netEl.textContent = fmt(summary.net_balance);
    netEl.className   = summary.net_balance >= 0 ? 'positive' : 'negative';
    document.getElementById('s-cnt').textContent = summary.total_transactions;

    // Load actionable insights and bill reminders
    loadInsights();

    drawTable();
  } catch (e) {
    console.error('Dashboard error:', e);
  }
}

function applyDateRangeFilter() {
  const val = document.getElementById('date-range-filter').value;
  dateRangeDays = val === 'all' ? null : parseInt(val);
  currentPage = 1;
  drawTable();
}

function filt(val, btn) {
  curFilter = val;
  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  currentPage = 1;
  drawTable();
}

function changePageLimit(val) {
  pageSize = val === 'all' ? 'all' : parseInt(val, 10);
  currentPage = 1;
  drawTable();
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    drawTable();
  }
}

function nextPage() {
  currentPage++;
  drawTable();
}

function drawTable() {
  const tbody      = document.getElementById('tbody');
  const empty      = document.getElementById('empty');
  const srch       = document.getElementById('srch');
  const catFilter  = document.getElementById('cat-filter');
  const typeFilter = document.getElementById('type-filter');
  const pgBar      = document.getElementById('pagination-bar');
  const pgInfo     = document.getElementById('pg-info');
  const pgPrev     = document.getElementById('pg-prev');
  const pgNext     = document.getElementById('pg-next');

  if (!tbody || !empty || !srch || !catFilter) return;

  const srchVal = srch.value.toLowerCase().trim();
  const catVal  = catFilter.value;
  const typeVal = typeFilter ? typeFilter.value : 'all';
  const now     = new Date();
  const cutoff  = dateRangeDays
    ? new Date(now.getTime() - dateRangeDays * 86400000).toISOString().slice(0, 10)
    : null;

  const rows = txns.filter(t => {
    const matchSearch  = t.reason.toLowerCase().includes(srchVal) ||
                         (t.account_name||'').toLowerCase().includes(srchVal) ||
                         (t.category_name||'').toLowerCase().includes(srchVal);
    const matchCat     = !catVal || t.category_id == catVal;
    const matchAccount = curFilter === 'all' || t.account_id == curFilter;
    const matchDate    = !cutoff || t.date >= cutoff;

    let matchType = true;
    if (typeVal === 'in') matchType = t.type === 'in' && !t.is_transfer;
    else if (typeVal === 'out') matchType = t.type === 'out' && !t.is_transfer;
    else if (typeVal === 'transfer') matchType = Boolean(t.is_transfer);

    return matchSearch && matchCat && matchAccount && matchDate && matchType;
  });

  if (!rows.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    if (pgBar) pgBar.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  if (pgBar) pgBar.style.display = 'flex';

  // Pagination calculation
  let paginatedRows = rows;
  if (pageSize !== 'all') {
    const totalPages = Math.ceil(rows.length / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * pageSize;
    paginatedRows = rows.slice(startIdx, startIdx + pageSize);

    if (pgInfo) pgInfo.textContent = `Page ${currentPage} of ${totalPages} (${rows.length} total)`;
    if (pgPrev) pgPrev.disabled = currentPage <= 1;
    if (pgNext) pgNext.disabled = currentPage >= totalPages;
  } else {
    if (pgInfo) pgInfo.textContent = `All ${rows.length} entries`;
    if (pgPrev) pgPrev.disabled = true;
    if (pgNext) pgNext.disabled = true;
  }

  tbody.innerHTML = paginatedRows.map(t => {
    const d   = new Date(t.date + 'T00:00:00');
    const day = DAYS[d.getDay()];
    const acc = accounts.find(a => a.id === t.account_id);
    const idx = accounts.findIndex(a => a.id === t.account_id);
    const catLabel = t.category_icon
      ? `${t.category_icon} ${escHtml(t.category_name)}`
      : (t.category_name ? escHtml(t.category_name) : '<span style="color:var(--muted)">—</span>');

    const accountBadge = t.is_transfer
      ? `<span class="badge b0" style="display:inline-flex;align-items:center;gap:4px;">${escHtml(t.account_name || 'Account')} ➔ ${escHtml(t.transfer_account_name || 'Transfer')}</span>`
      : `<span class="badge b${idx % 4}">${acc ? escHtml(acc.name) : '?'}</span>`;

    const typeBadge = t.is_transfer
      ? '<span class="badge-transfer">⇄ Transfer</span>'
      : (t.type === 'in' ? '<span class="tin">IN</span>' : '<span class="tout">OUT</span>');

    return `<tr>
      <td class="dt">${t.date}</td>
      <td class="dy">${day ? day.slice(0,3) : ''}</td>
      <td>${accountBadge}</td>
      <td class="cat-badge">${catLabel}</td>
      <td title="${escHtml(t.reason)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(t.reason)}</td>
      <td>${typeBadge}</td>
      <td class="amt ${t.type === 'in' ? 'gi' : 'ri'}">${t.type === 'in' ? '+' : '-'}${fmt(t.amount)}</td>
      <td style="white-space:nowrap">
        <button class="xbtn" onclick="openEditTxnModal(${t.id})" title="Edit Transaction" style="margin-right:6px;">✏️</button>
        <button class="xbtn" onclick="deleteEntry(${t.id})" title="Delete">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

let curEditType = 'out';

function pickEditType(t) {
  curEditType = t;
  const outBtn = document.getElementById('edit-tp-out');
  const inBtn  = document.getElementById('edit-tp-in');
  if (outBtn) outBtn.className = 'topt' + (t === 'out' ? ' out' : '');
  if (inBtn)  inBtn.className  = 'topt' + (t === 'in'  ? ' in'  : '');
}

function openEditTxnModal(id) {
  const t = txns.find(item => item.id === id);
  if (!t) return;

  fillCategorySelect();
  fillAccSelect();

  document.getElementById('edit-txn-id').value     = t.id;
  document.getElementById('edit-txn-date').value   = t.date;
  document.getElementById('edit-txn-reason').value = t.reason;
  document.getElementById('edit-txn-amt').value    = t.amount;
  document.getElementById('edit-txn-acc').value    = t.account_id;
  document.getElementById('edit-txn-cat').value    = t.category_id || '';

  pickEditType(t.type || 'out');
  document.getElementById('edit-txn-modal').classList.add('show');
}

function closeEditTxnModal() {
  document.getElementById('edit-txn-modal').classList.remove('show');
}

async function saveEditedTxn() {
  const id   = parseInt(document.getElementById('edit-txn-id').value);
  const date = document.getElementById('edit-txn-date').value;
  const aid  = parseInt(document.getElementById('edit-txn-acc').value);
  const cid  = document.getElementById('edit-txn-cat').value ? parseInt(document.getElementById('edit-txn-cat').value) : null;
  const rsn  = document.getElementById('edit-txn-reason').value.trim();
  const amt  = parseFloat(document.getElementById('edit-txn-amt').value);

  if (!date || !aid || !rsn || isNaN(amt) || amt <= 0) {
    showToast('⚠️ Please fill all required fields correctly', true);
    return;
  }

  try {
    await apiCall(`/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        date,
        account_id: aid,
        category_id: cid,
        reason: rsn,
        amount: amt,
        type: curEditType
      })
    });

    const idx = txns.findIndex(item => item.id === id);
    if (idx !== -1) {
      const cat = categories.find(c => c.id === cid);
      const acc = accounts.find(a => a.id === aid);
      txns[idx] = {
        ...txns[idx],
        date,
        account_id: aid,
        account_name: acc ? acc.name : '',
        category_id: cid,
        category_name: cat ? cat.name : null,
        category_icon: cat ? cat.icon : null,
        category_color: cat ? cat.color : null,
        reason: rsn,
        amount: amt,
        type: curEditType
      };
    }

    closeEditTxnModal();
    drawDash();
    drawHomeRecent();
    refreshNav();
    showToast('✅ Transaction updated successfully!');
  } catch (err) {
    console.error('Update txn error:', err);
  }
}

async function deleteEntry(id) {
  if (!confirm('Delete this entry?')) return;
  try {
    await apiCall(`/transactions/${id}`, { method: 'DELETE' });
    txns = txns.filter(t => t.id !== id);
    drawDash();
    drawHomeRecent();
    refreshNav();
    showToast('🗑️ Entry deleted');
  } catch (e) { console.error(e); }
}

async function renameAcc(id, val) {
  if (!val.trim()) return;
  try {
    await apiCall(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify({ name: val.trim() }) });
    await loadData();
    drawDash();
    showToast('✅ Account renamed');
  } catch (e) { console.error(e); }
}

// ─── CHARTS ───────────────────────────────────────────────────────────────────

async function loadCharts() {
  const period = document.getElementById('chart-period')?.value || 'monthly';
  const months = document.getElementById('chart-months')?.value || 6;

  try {
    const [trends, breakdown] = await Promise.all([
      apiCall(`/spending-trends?period=${period}&months=${months}`),
      apiCall(`/category-breakdown?type=out&months=${months}`)
    ]);

    drawTrendChart(trends);
    drawCategoryChart(breakdown);
    drawNetChart(trends);
    drawInsights(trends, breakdown);
  } catch (e) {
    console.error('Charts error:', e);
  }
}

function getChartColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    text:   style.getPropertyValue('--text').trim()   || '#f8fafc',
    muted:  style.getPropertyValue('--muted').trim()  || '#94a3b8',
    border: style.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.08)',
    bg2:    style.getPropertyValue('--bg2').trim()    || '#1e293b',
    green:  style.getPropertyValue('--green').trim()  || '#10b981',
    red:    style.getPropertyValue('--red').trim()    || '#f43f5e',
    a1:     style.getPropertyValue('--a1').trim()     || '#8b5cf6',
  };
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function drawTrendChart(trends) {
  destroyChart('trend');
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;

  const labels = Object.keys(trends).sort();
  const incomeData  = labels.map(l => trends[l].in  || 0);
  const spendData   = labels.map(l => trends[l].out || 0);
  const c = getChartColors();

  charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          borderColor: c.green,
          backgroundColor: 'rgba(16,185,129,0.08)',
          borderWidth: 2.5,
          pointBackgroundColor: c.green,
          pointRadius: 4, pointHoverRadius: 6,
          fill: true, tension: 0.4
        },
        {
          label: 'Spending',
          data: spendData,
          borderColor: '#f43f5e',
          backgroundColor: 'rgba(244,63,94,0.08)',
          borderWidth: 2.5,
          pointBackgroundColor: '#f43f5e',
          pointRadius: 4, pointHoverRadius: 6,
          fill: true, tension: 0.4
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: c.muted, font: { family: 'Outfit', size: 13, weight: '600' } } },
        tooltip: {
          backgroundColor: c.bg2,
          titleColor: c.text, bodyColor: c.muted,
          borderColor: c.border, borderWidth: 1,
          callbacks: { label: ctx => `  ${ctx.dataset.label}: ₹${ctx.parsed.y.toFixed(2)}` }
        }
      },
      scales: {
        x: { ticks: { color: c.muted, font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: {
          ticks: {
            color: c.muted, font: { size: 11 },
            callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(1) + 'k' : v)
          },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    }
  });
}

function drawCategoryChart(breakdown) {
  destroyChart('category');
  const ctx = document.getElementById('categoryChart');
  const legendEl = document.getElementById('category-legend');
  if (!ctx) return;

  const labels = breakdown.map(b => b.category_icon + ' ' + b.category_name);
  const data   = breakdown.map(b => b.total);
  const colors = breakdown.map(b => b.category_color || '#8b5cf6');
  const c = getChartColors();

  charts.category = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderColor: c.bg2, borderWidth: 3, hoverOffset: 8 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.bg2, titleColor: c.text, bodyColor: c.muted,
          borderColor: c.border, borderWidth: 1,
          callbacks: { label: ctx => `  ₹${ctx.parsed.toFixed(2)} (${Math.round(ctx.parsed / data.reduce((a,b)=>a+b,0)*100)}%)` }
        }
      }
    }
  });

  // Custom legend
  if (legendEl) {
    legendEl.innerHTML = breakdown.slice(0, 6).map((b, i) => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${colors[i]}"></span>
        <span>${b.category_icon} ${escHtml(b.category_name)}</span>
      </div>`).join('');
  }
}

function drawNetChart(trends) {
  destroyChart('net');
  const ctx = document.getElementById('netChart');
  if (!ctx) return;

  const labels  = Object.keys(trends).sort();
  const netData = labels.map(l => (trends[l].in || 0) - (trends[l].out || 0));
  const colors  = netData.map(v => v >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(244,63,94,0.7)');
  const c = getChartColors();

  charts.net = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Net Balance',
        data: netData,
        backgroundColor: colors,
        borderColor: colors,
        borderRadius: 6, borderWidth: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.bg2, titleColor: c.text, bodyColor: c.muted,
          borderColor: c.border, borderWidth: 1,
          callbacks: { label: ctx => `  Net: ₹${ctx.parsed.y.toFixed(2)}` }
        }
      },
      scales: {
        x: { ticks: { color: c.muted, font: { size: 11 } }, grid: { display: false } },
        y: {
          ticks: { color: c.muted, font: { size: 11 },
                   callback: v => '₹' + (Math.abs(v) >= 1000 ? (v/1000).toFixed(1) + 'k' : v) },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    }
  });
}

function drawInsights(trends, breakdown) {
  const container = document.getElementById('chart-insights');
  if (!container) return;

  const labels    = Object.keys(trends).sort();
  const totalIn   = labels.reduce((s, l) => s + (trends[l].in  || 0), 0);
  const totalOut  = labels.reduce((s, l) => s + (trends[l].out || 0), 0);
  const avgIn     = labels.length ? totalIn  / labels.length : 0;
  const avgOut    = labels.length ? totalOut / labels.length : 0;
  const topCat    = breakdown[0];
  const savingsRate = totalIn > 0 ? Math.round(((totalIn - totalOut) / totalIn) * 100) : 0;

  container.innerHTML = `
    <div class="insight-card">
      <div class="insight-icon">💰</div>
      <div class="insight-label">Avg Monthly Income</div>
      <div class="insight-value" style="color:var(--green)">${fmt(avgIn)}</div>
    </div>
    <div class="insight-card">
      <div class="insight-icon">💸</div>
      <div class="insight-label">Avg Monthly Spend</div>
      <div class="insight-value" style="color:var(--red)">${fmt(avgOut)}</div>
    </div>
    <div class="insight-card">
      <div class="insight-icon">📊</div>
      <div class="insight-label">Savings Rate</div>
      <div class="insight-value" style="color:${savingsRate >= 0 ? 'var(--green)' : 'var(--red)'}">${savingsRate}%</div>
    </div>
    ${topCat ? `
    <div class="insight-card">
      <div class="insight-icon">${topCat.category_icon || '📌'}</div>
      <div class="insight-label">Top Spending Category</div>
      <div class="insight-value" style="font-size:1.1rem">${escHtml(topCat.category_name)}</div>
    </div>` : ''}`;
}

// ─── BUDGETS PAGE ─────────────────────────────────────────────────────────────

let editingBudgetId = null;

async function loadBudgets() {
  try { budgets = await apiCall('/budgets'); }
  catch (e) { console.error(e); }
}

async function showBudgetsPage() {
  try {
    const summary = await apiCall('/summary');
    await Promise.all([loadBudgets(), loadGoals(), loadRecurring()]);

    const grid = document.getElementById('budget-grid');
    if (grid) {
      if (!budgets.length) {
        grid.innerHTML = `
          <div class="budget-empty">
            <div class="ico">🎯</div>
            <div>No budgets set yet.<br>Click <strong>+ Set Budget</strong> to start tracking.</div>
          </div>`;
      } else {
        grid.innerHTML = budgets.map(b => {
          let spent = 0;
          if (summary.categories?.[b.category_name]) {
            spent = summary.categories[b.category_name].out || 0;
          }
          const pct       = Math.min(100, Math.round((spent / b.amount) * 100));
          const remaining = b.amount - spent;
          let barColor    = '#10b981';
          if (pct > 90) barColor = '#f43f5e';
          else if (pct > 70) barColor = '#f59e0b';

          return `
          <div class="acc-card">
            <div class="acc-name-row">
              <div style="display:flex;align-items:center;gap:8px;font-family:'Outfit',sans-serif;font-weight:700;font-size:1rem">
                <span>${b.category_icon || '📌'}</span> ${escHtml(b.category_name || 'Unknown')}
              </div>
              <button class="xbtn" onclick="deleteBudget(${b.id})" title="Delete">🗑️</button>
            </div>
            <div style="font-size:1.3rem;font-weight:800;margin:10px 0;font-family:'Outfit',sans-serif">
              ${fmt(spent)} <span style="font-size:0.9rem;color:var(--muted);font-weight:500">/ ${fmt(b.amount)}</span>
            </div>
            <div class="budget-progress">
              <div class="budget-progress-fill" style="width:${pct}%;background:${barColor}"></div>
            </div>
            <div class="acc-sub" style="display:flex;justify-content:space-between;margin-top:4px">
              <span>${pct}% used</span>
              <span style="color:${remaining < 0 ? 'var(--red)' : 'var(--green)'}">
                ${fmt(Math.abs(remaining))} ${remaining < 0 ? 'over budget' : 'remaining'}
              </span>
            </div>
            <button onclick="editBudget(${b.id}, ${b.category_id}, ${b.amount})"
              style="margin-top:14px;width:100%;padding:8px;background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--text);border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;transition:0.25s"
              onmouseover="this.style.background='rgba(255,255,255,0.08)'"
              onmouseout="this.style.background='rgba(255,255,255,0.04)'">
              Edit
            </button>
          </div>`;
        }).join('');
      }
    }

    drawGoals();
    drawRecurring();
  } catch (e) {
    console.error('Budgets page error:', e);
  }
}

function showAddBudgetModal() {
  editingBudgetId = null;
  document.getElementById('budget-modal-title').textContent = 'Set Category Budget';
  document.getElementById('budget-category').value = '';
  document.getElementById('budget-amount').value   = '';
  document.getElementById('budget-modal').classList.add('show');
}
function editBudget(id, catId, amount) {
  editingBudgetId = id;
  document.getElementById('budget-modal-title').textContent = 'Edit Budget';
  document.getElementById('budget-category').value = catId;
  document.getElementById('budget-amount').value   = amount;
  document.getElementById('budget-modal').classList.add('show');
}
function closeBudgetModal() {
  document.getElementById('budget-modal').classList.remove('show');
}
async function saveBudget() {
  const catId  = document.getElementById('budget-category').value;
  const amount = parseFloat(document.getElementById('budget-amount').value);
  if (!catId || isNaN(amount) || amount <= 0) {
    showToast('⚠️ Select a category and enter a valid amount', true); return;
  }
  try {
    if (editingBudgetId) {
      await apiCall(`/budgets/${editingBudgetId}`, { method: 'PUT', body: JSON.stringify({ category_id: catId, amount }) });
      showToast('✅ Budget updated');
    } else {
      await apiCall('/budgets', { method: 'POST', body: JSON.stringify({ category_id: catId, amount }) });
      showToast('✅ Budget set');
    }
    closeBudgetModal();
    showBudgetsPage();
  } catch (e) { console.error(e); }
}
async function deleteBudget(id) {
  if (!confirm('Delete this budget?')) return;
  try {
    await apiCall(`/budgets/${id}`, { method: 'DELETE' });
    showToast('🗑️ Budget deleted');
    showBudgetsPage();
  } catch (e) { console.error(e); }
}

function populateBudgetCategoryFilter() {
  const sel = document.getElementById('budget-category');
  if (!sel) return;
  sel.innerHTML = '<option value="">Select Category</option>' +
    categories.map(c => `<option value="${c.id}">${c.icon} ${escHtml(c.name)}</option>`).join('');
}

// ─── MANAGE PAGE ──────────────────────────────────────────────────────────────

let editingAccountId  = null;
let editingCategoryId = null;

async function loadCategories() {
  try {
    categories = await apiCall('/categories');
    fillCategorySelect();
    populateCategoryFilter();
    populateBudgetCategoryFilter();
  } catch (e) { console.error(e); }
}

function fillCategorySelect() {
  const sel = document.getElementById('f-cat');
  const editSel = document.getElementById('edit-txn-cat');
  const opts = '<option value="">No Category</option>' +
    categories.map(c => `<option value="${c.id}">${c.icon} ${escHtml(c.name)}</option>`).join('');
  if (sel) sel.innerHTML = opts;
  if (editSel) editSel.innerHTML = opts;
}

function fillAccSelect() {
  const sel = document.getElementById('f-acc');
  const editSel = document.getElementById('edit-txn-acc');
  const opts = accounts.length
    ? accounts.map(a => `<option value="${a.id}">${escHtml(a.name)}</option>`).join('')
    : '<option value="">-- No accounts (Create in Manage) --</option>';
  if (sel) sel.innerHTML = opts;
  if (editSel) editSel.innerHTML = opts;
}

function populateCategoryFilter() {
  const sel = document.getElementById('cat-filter');
  if (!sel) return;
  sel.innerHTML = '<option value="">All Categories</option>' +
    categories.map(c => `<option value="${c.id}">${c.icon} ${escHtml(c.name)}</option>`).join('');
}

async function showManagePage() {
  try {
    await Promise.all([loadCategories(), loadUserProfile()]);
    const accountBalances = await apiCall('/account-balances');

    document.getElementById('accounts-list').innerHTML = accountBalances.length === 0
      ? '<div class="budget-empty" style="padding:24px 12px;"><div class="ico">🏦</div><div style="font-weight:600;">No accounts created yet</div><div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">Click "+ Add Account" above to create your first account (e.g. Cash, Bank, GPay)</div></div>'
      : accountBalances.map(a => `
      <div class="manage-item">
        <div class="manage-item-info">
          <div class="manage-item-name">🏦 ${escHtml(a.name)}</div>
          <div class="manage-item-details">
            ${a.transaction_count} transactions &nbsp;|&nbsp; Balance: ${fmt(a.balance)}
          </div>
        </div>
        <div class="manage-item-actions">
          <button class="btn-edit" onclick="editAccount(${a.id}, '${escHtml(a.name)}')">Edit</button>
          ${a.transaction_count === 0 ? `<button class="btn-delete" onclick="deleteAccount(${a.id})">Delete</button>` : ''}
        </div>
      </div>`).join('');

    document.getElementById('categories-list').innerHTML = categories.map(c => `
      <div class="manage-item">
        <div class="manage-item-info">
          <div class="manage-item-name">${c.icon} ${escHtml(c.name)}</div>
          <div class="manage-item-details">
            <span style="display:inline-block;width:12px;height:12px;background:${c.color};border-radius:50%"></span>
            ${c.color}
          </div>
        </div>
        <div class="manage-item-actions">
          <button class="btn-edit" onclick="editCategory(${c.id}, '${escHtml(c.name)}', '${c.color}', '${c.icon}')">Edit</button>
          <button class="btn-delete" onclick="deleteCategory(${c.id})">Delete</button>
        </div>
      </div>`).join('');
  } catch (e) { console.error(e); }
}

// Account modal
function showAddAccountModal() {
  editingAccountId = null;
  document.getElementById('account-modal-title').textContent = 'Add New Account';
  document.getElementById('account-name').value = '';
  document.getElementById('account-modal').classList.add('show');
}
function editAccount(id, name) {
  editingAccountId = id;
  document.getElementById('account-modal-title').textContent = 'Edit Account';
  document.getElementById('account-name').value = name;
  document.getElementById('account-modal').classList.add('show');
}
function closeAccountModal() {
  document.getElementById('account-modal').classList.remove('show');
  editingAccountId = null;
}
async function saveAccount() {
  const name = document.getElementById('account-name').value.trim();
  if (!name) { showToast('⚠️ Account name is required', true); return; }
  try {
    if (editingAccountId) {
      await apiCall(`/accounts/${editingAccountId}`, { method: 'PUT', body: JSON.stringify({ name }) });
      showToast('✅ Account updated');
    } else {
      await apiCall('/accounts', { method: 'POST', body: JSON.stringify({ name }) });
      showToast('✅ Account created');
    }
    closeAccountModal();
    await loadData();
    showManagePage();
  } catch (e) { console.error(e); }
}
async function deleteAccount(id) {
  if (!confirm('Delete this account?')) return;
  try {
    await apiCall(`/accounts/${id}`, { method: 'DELETE' });
    showToast('🗑️ Account deleted');
    await loadData();
    showManagePage();
  } catch (e) { console.error(e); }
}

// Category modal
function showAddCategoryModal() {
  editingCategoryId = null;
  document.getElementById('category-modal-title').textContent = 'Add New Category';
  document.getElementById('category-name').value  = '';
  document.getElementById('category-color').value = '#7c6af7';
  document.getElementById('category-icon').value  = '';
  document.getElementById('category-modal').classList.add('show');
}
function editCategory(id, name, color, icon) {
  editingCategoryId = id;
  document.getElementById('category-modal-title').textContent = 'Edit Category';
  document.getElementById('category-name').value  = name;
  document.getElementById('category-color').value = color;
  document.getElementById('category-icon').value  = icon;
  document.getElementById('category-modal').classList.add('show');
}
function closeCategoryModal() {
  document.getElementById('category-modal').classList.remove('show');
  editingCategoryId = null;
}
async function saveCategory() {
  const name  = document.getElementById('category-name').value.trim();
  const color = document.getElementById('category-color').value;
  const icon  = document.getElementById('category-icon').value.trim() || '📌';
  if (!name) { showToast('⚠️ Category name is required', true); return; }
  try {
    if (editingCategoryId) {
      await apiCall(`/categories/${editingCategoryId}`, { method: 'PUT', body: JSON.stringify({ name, color, icon }) });
      showToast('✅ Category updated');
    } else {
      await apiCall('/categories', { method: 'POST', body: JSON.stringify({ name, color, icon }) });
      showToast('✅ Category created');
    }
    closeCategoryModal();
    await loadCategories();
    showManagePage();
  } catch (e) { console.error(e); }
}
async function deleteCategory(id) {
  if (!confirm('Delete this category?')) return;
  try {
    await apiCall(`/categories/${id}`, { method: 'DELETE' });
    showToast('🗑️ Category deleted');
    await loadCategories();
    showManagePage();
  } catch (e) { console.error(e); }
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────

function showExportModal() {
  const today         = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
  document.getElementById('export-start-date').value = thirtyDaysAgo.toISOString().split('T')[0];
  document.getElementById('export-end-date').value   = today.toISOString().split('T')[0];
  document.getElementById('export-modal').classList.add('show');
}
function setExportRange(days) {
  const today = new Date();
  document.getElementById('export-end-date').value = today.toISOString().split('T')[0];
  if (days === 'all') {
    let earliest = '2024-01-01';
    if (txns.length > 0) {
      const dates = txns.map(t => t.date).sort();
      earliest = dates[0] || '2024-01-01';
    }
    document.getElementById('export-start-date').value = earliest;
  } else {
    const past = new Date(today.getTime() - days * 86400000);
    document.getElementById('export-start-date').value = past.toISOString().split('T')[0];
  }
}
function closeExportModal() {
  document.getElementById('export-modal').classList.remove('show');
}
async function exportTransactions() {
  const start  = document.getElementById('export-start-date').value;
  const end    = document.getElementById('export-end-date').value;
  if (!start || !end) { showToast('⚠️ Please select both dates', true); return; }

  const format = document.querySelector('input[name="export-format"]:checked')?.value || 'csv';
  const token  = localStorage.getItem('token');
  const endpoint = format === 'json' ? '/export/json' : '/export/csv';
  const url    = `${API_BASE}${endpoint}?start=${start}&end=${end}&token=${encodeURIComponent(token)}`;
  window.open(url, '_blank');
  closeExportModal();
  showToast(`📥 ${format.toUpperCase()} export started!`);
}

// ─── TOAST ────────────────────────────────────────────────────────────────────

let toastTimeout;
function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent      = msg;
  el.style.borderColor = isError ? 'var(--red)' : 'var(--a1)';
  el.style.borderLeftColor = isError ? 'var(--red)' : 'var(--a1)';
  el.classList.add('on');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('on'), 3500);
}

// ─── LOAD DATA ────────────────────────────────────────────────────────────────

async function loadData() {
  if (!checkAuth()) return;
  showLoading();

  try {
    const [accountsData, txnsData, budgetsData, goalsData, recurringData] = await Promise.all([
      apiCall('/accounts'),
      apiCall('/transactions'),
      apiCall('/budgets'),
      apiCall('/goals').catch(() => []),
      apiCall('/recurring').catch(() => [])
    ]);

    accounts       = accountsData  || [];
    txns           = txnsData      || [];
    budgets        = budgetsData   || [];
    savingsGoals   = goalsData     || [];
    recurringBills = recurringData || [];

    await Promise.all([loadCategories(), loadUserProfile()]);
    fillAccSelect();
    updateUserDisplay();
    refreshNav();
    await go(activePage);
  } catch (e) {
    console.error('Load error:', e);
  } finally {
    hideLoading();
  }
}

// ─── TRANSFERS ────────────────────────────────────────────────────────────────

function showTransferModal() {
  const fromSel = document.getElementById('transfer-from-acc');
  const toSel   = document.getElementById('transfer-to-acc');
  if (!fromSel || !toSel) return;

  const opts = accounts.map(a => `<option value="${a.id}">${escHtml(a.name)}</option>`).join('');
  fromSel.innerHTML = opts;
  toSel.innerHTML   = opts;

  if (accounts.length > 1) {
    toSel.selectedIndex = 1;
  }

  document.getElementById('transfer-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('transfer-amt').value = '';
  document.getElementById('transfer-reason').value = '';
  document.getElementById('transfer-modal').classList.add('show');
}

function closeTransferModal() {
  document.getElementById('transfer-modal').classList.remove('show');
}

async function executeTransfer() {
  const fromId = parseInt(document.getElementById('transfer-from-acc').value, 10);
  const toId   = parseInt(document.getElementById('transfer-to-acc').value, 10);
  const amt    = parseFloat(document.getElementById('transfer-amt').value);
  const date   = document.getElementById('transfer-date').value;
  const reason = document.getElementById('transfer-reason').value.trim();

  if (!fromId || !toId) {
    showToast('⚠️ Please select both source and destination accounts', true);
    return;
  }
  if (fromId === toId) {
    showToast('⚠️ Source and destination accounts must be different', true);
    return;
  }
  if (isNaN(amt) || amt <= 0) {
    showToast('⚠️ Transfer amount must be greater than 0', true);
    return;
  }
  if (!date) {
    showToast('⚠️ Please select a transfer date', true);
    return;
  }

  try {
    showLoading();
    await apiCall('/transfers', {
      method: 'POST',
      body: JSON.stringify({
        from_account_id: fromId,
        to_account_id: toId,
        amount: amt,
        date,
        reason: reason || 'Account Transfer'
      })
    });

    closeTransferModal();
    await loadData();
    showToast('✅ Transfer completed successfully!');
  } catch (err) {
    console.error('Transfer error:', err);
  } finally {
    hideLoading();
  }
}

// ─── ACTIONABLE INSIGHTS & REMINDERS ──────────────────────────────────────────

async function loadInsights() {
  const banner = document.getElementById('insights-banner');
  if (!banner) return;

  try {
    const data = await apiCall('/insights');
    const bills = data.upcoming_bills || [];
    const alerts = data.budget_alerts || [];

    if (!bills.length && !alerts.length) {
      banner.style.display = 'none';
      return;
    }

    let itemsHtml = '';

    bills.forEach(b => {
      itemsHtml += `
        <div class="insight-item">
          <div>
            <strong>📅 Due Soon:</strong> ${escHtml(b.reason)} (${fmt(b.amount)}) — due on <strong>${b.next_date}</strong> (${escHtml(b.account_name)})
          </div>
          <button class="insight-btn" onclick="processRecurringDirect(${b.id}, '${escHtml(b.reason)}')">⚡ Process / Pay</button>
        </div>`;
    });

    alerts.forEach(a => {
      itemsHtml += `
        <div class="insight-item warning">
          <div>
            <strong>⚠️ Budget Warning:</strong> ${a.category_icon || '📌'} ${escHtml(a.category_name)} is at <strong>${a.percent}%</strong> of budget (${fmt(a.spent)} / ${fmt(a.budget_limit)})
          </div>
        </div>`;
    });

    banner.innerHTML = `
      <div class="insights-header">
        <span>💡 Actionable Insights & Reminders</span>
        <span style="font-size:0.75rem;font-weight:normal;color:var(--text-muted);">${bills.length} bill(s) due, ${alerts.length} budget warning(s)</span>
      </div>
      ${itemsHtml}
    `;
    banner.style.display = 'flex';
  } catch (e) {
    console.warn('Insights fetch error:', e);
  }
}

async function processRecurringDirect(id, name) {
  if (!confirm(`Process and log payment for "${name}" now?`)) return;
  try {
    showLoading();
    await apiCall(`/recurring/${id}/process`, { method: 'POST' });
    showToast('✅ Recurring payment processed and schedule updated!');
    await loadData();
  } catch (e) {
    console.error(e);
  } finally {
    hideLoading();
  }
}

// ─── SAVINGS GOALS ────────────────────────────────────────────────────────────

async function loadGoals() {
  try {
    savingsGoals = await apiCall('/goals');
  } catch (e) {
    savingsGoals = [];
  }
}

function drawGoals() {
  const grid = document.getElementById('goals-grid');
  if (!grid) return;

  if (!savingsGoals.length) {
    grid.innerHTML = `
      <div class="budget-empty">
        <div class="ico">🏆</div>
        <div>No savings goals created yet.<br>Click <strong>+ New Goal</strong> to set a target!</div>
      </div>`;
    return;
  }

  grid.innerHTML = savingsGoals.map(g => {
    const cur = g.current_amount || 0;
    const tgt = g.target_amount;
    const pct = Math.min(100, Math.round((cur / tgt) * 100));
    const remaining = Math.max(0, tgt - cur);

    return `
      <div class="goal-card">
        <div class="goal-header">
          <div class="goal-title">${escHtml(g.name)}</div>
          <button class="xbtn" onclick="deleteGoal(${g.id})" title="Delete Goal">🗑️</button>
        </div>
        <div class="goal-amounts">
          <div>Saved: <strong>${fmt(cur)}</strong></div>
          <div>Target: <strong>${fmt(tgt)}</strong></div>
        </div>
        <div class="goal-progress">
          <div class="goal-progress-fill" style="width:${pct}%;background:${g.color || '#10b981'}"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--text-muted);">
          <span>${pct}% achieved</span>
          <span>${remaining > 0 ? fmt(remaining) + ' remaining' : '🎉 Goal Reached!'}</span>
        </div>
        <div class="goal-actions">
          <button class="fbtn" onclick="showContributeModal(${g.id}, '${escHtml(g.name)}')" style="flex:1;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);padding:8px 12px;font-weight:600;">
            + Contribute
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function showAddGoalModal() {
  document.getElementById('goal-id').value = '';
  document.getElementById('goal-name').value = '';
  document.getElementById('goal-target-amt').value = '';
  document.getElementById('goal-current-amt').value = '0';
  document.getElementById('goal-target-date').value = '';
  document.getElementById('goal-color').value = '#10b981';
  document.getElementById('goal-modal-title').textContent = '🏆 New Savings Goal';
  document.getElementById('goal-modal').classList.add('show');
}

function closeGoalModal() {
  document.getElementById('goal-modal').classList.remove('show');
}

async function saveGoal() {
  const name = document.getElementById('goal-name').value.trim();
  const tgt  = parseFloat(document.getElementById('goal-target-amt').value);
  const cur  = parseFloat(document.getElementById('goal-current-amt').value) || 0;
  const date = document.getElementById('goal-target-date').value;
  const col  = document.getElementById('goal-color').value;

  if (!name || isNaN(tgt) || tgt <= 0) {
    showToast('⚠️ Please enter a goal name and valid target amount', true);
    return;
  }

  try {
    await apiCall('/goals', {
      method: 'POST',
      body: JSON.stringify({ name, target_amount: tgt, current_amount: cur, target_date: date, color: col })
    });
    closeGoalModal();
    await loadGoals();
    drawGoals();
    showToast('🏆 Savings goal created!');
  } catch (e) {
    console.error(e);
  }
}

async function deleteGoal(id) {
  if (!confirm('Delete this savings goal?')) return;
  try {
    await apiCall(`/goals/${id}`, { method: 'DELETE' });
    showToast('🗑️ Savings goal deleted');
    await loadGoals();
    drawGoals();
  } catch (e) { console.error(e); }
}

function showContributeModal(id, name) {
  document.getElementById('contrib-goal-id').value = id;
  document.getElementById('contrib-goal-title').innerHTML = `Contributing towards: <strong>${name}</strong>`;
  document.getElementById('contrib-amt').value = '';

  const accSel = document.getElementById('contrib-acc');
  accSel.innerHTML = '<option value="">Do not log account transaction</option>' +
    accounts.map(a => `<option value="${a.id}">Deduct from ${escHtml(a.name)}</option>`).join('');

  document.getElementById('goal-contribute-modal').classList.add('show');
}

function closeGoalContributeModal() {
  document.getElementById('goal-contribute-modal').classList.remove('show');
}

async function submitGoalContribution() {
  const id  = parseInt(document.getElementById('contrib-goal-id').value, 10);
  const amt = parseFloat(document.getElementById('contrib-amt').value);
  const aid = document.getElementById('contrib-acc').value ? parseInt(document.getElementById('contrib-acc').value, 10) : null;

  if (isNaN(amt) || amt <= 0) {
    showToast('⚠️ Please enter a valid contribution amount', true);
    return;
  }

  try {
    showLoading();
    await apiCall(`/goals/${id}/contribute`, {
      method: 'POST',
      body: JSON.stringify({ amount: amt, account_id: aid })
    });
    closeGoalContributeModal();
    await loadGoals();
    drawGoals();
    if (aid) await loadData();
    showToast('💰 Contribution added!');
  } catch (e) {
    console.error(e);
  } finally {
    hideLoading();
  }
}

// ─── RECURRING TRANSACTIONS & BILLS ──────────────────────────────────────────

async function loadRecurring() {
  try {
    recurringBills = await apiCall('/recurring');
  } catch (e) {
    recurringBills = [];
  }
}

function drawRecurring() {
  const list = document.getElementById('recurring-list');
  if (!list) return;

  if (!recurringBills.length) {
    list.innerHTML = `
      <div class="budget-empty">
        <div class="ico">🔄</div>
        <div>No recurring bills setup yet.<br>Track subscriptions, rent, and utility bills automatically.</div>
      </div>`;
    return;
  }

  list.innerHTML = recurringBills.map(r => `
    <div class="recurring-card">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:1.6rem;">${r.category_icon || (r.type === 'in' ? '💰' : '💡')}</div>
        <div>
          <div style="font-weight:700;color:var(--text);font-size:0.95rem;">${escHtml(r.reason)}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);display:flex;gap:8px;margin-top:2px;">
            <span>${escHtml(r.account_name)}</span> ·
            <span style="text-transform:capitalize;">${r.frequency}</span> ·
            <span>Next: <strong>${r.next_date}</strong></span>
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;">
        <strong style="color:${r.type === 'in' ? 'var(--green)' : 'var(--red)'};font-size:1.05rem;">
          ${r.type === 'in' ? '+' : '-'}${fmt(r.amount)}
        </strong>
        <button class="insight-btn" onclick="processRecurringDirect(${r.id}, '${escHtml(r.reason)}')" title="Log payment and advance date">
          ⚡ Pay / Process
        </button>
        <button class="xbtn" onclick="deleteRecurring(${r.id})" title="Delete">🗑️</button>
      </div>
    </div>
  `).join('');
}

function showAddRecurringModal() {
  const accSel = document.getElementById('rec-account');
  const catSel = document.getElementById('rec-category');

  accSel.innerHTML = accounts.map(a => `<option value="${a.id}">${escHtml(a.name)}</option>`).join('');
  catSel.innerHTML = '<option value="">No Category</option>' +
    categories.map(c => `<option value="${c.id}">${c.icon} ${escHtml(c.name)}</option>`).join('');

  document.getElementById('recurring-id').value = '';
  document.getElementById('rec-reason').value = '';
  document.getElementById('rec-amt').value = '';
  document.getElementById('rec-next-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('recurring-modal').classList.add('show');
}

function closeRecurringModal() {
  document.getElementById('recurring-modal').classList.remove('show');
}

async function saveRecurring() {
  const aid  = parseInt(document.getElementById('rec-account').value, 10);
  const cid  = document.getElementById('rec-category').value ? parseInt(document.getElementById('rec-category').value, 10) : null;
  const amt  = parseFloat(document.getElementById('rec-amt').value);
  const type = document.getElementById('rec-type').value;
  const freq = document.getElementById('rec-frequency').value;
  const next = document.getElementById('rec-next-date').value;
  const rsn  = document.getElementById('rec-reason').value.trim();

  if (!aid || !rsn || isNaN(amt) || amt <= 0 || !next) {
    showToast('⚠️ Please fill all required recurring fields', true);
    return;
  }

  try {
    await apiCall('/recurring', {
      method: 'POST',
      body: JSON.stringify({ account_id: aid, category_id: cid, amount: amt, type, frequency: freq, next_date: next, reason: rsn })
    });
    closeRecurringModal();
    await loadRecurring();
    drawRecurring();
    showToast('🔄 Recurring bill scheduled!');
  } catch (e) {
    console.error(e);
  }
}

async function deleteRecurring(id) {
  if (!confirm('Delete this recurring bill?')) return;
  try {
    await apiCall(`/recurring/${id}`, { method: 'DELETE' });
    showToast('🗑️ Recurring schedule deleted');
    await loadRecurring();
    drawRecurring();
  } catch (e) { console.error(e); }
}

// ─── CSV IMPORT WITH PREVIEW & DUPLICATE DETECTION ────────────────────────────

function showImportModal() {
  resetImportModal();
  document.getElementById('import-modal').classList.add('show');
}

function closeImportModal() {
  document.getElementById('import-modal').classList.remove('show');
}

function resetImportModal() {
  document.getElementById('import-step-upload').style.display = 'block';
  document.getElementById('import-step-preview').style.display = 'none';
  document.getElementById('btn-execute-import').style.display = 'none';
  document.getElementById('csv-file-input').value = '';
  pendingCSVRows = [];
}

function handleCSVFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    const csvText = evt.target.result;
    try {
      showLoading();
      const res = await apiCall('/import/csv/preview', {
        method: 'POST',
        body: JSON.stringify({ csvData: csvText })
      });

      pendingCSVRows = res.rows || [];
      document.getElementById('import-stats').innerHTML =
        `Found <strong>${res.total_rows}</strong> records: ` +
        `<span style="color:var(--green)">${res.valid_rows} new</span>, ` +
        `<span style="color:#f59e0b">${res.duplicate_rows} duplicates</span>` +
        (res.invalid_rows ? `, <span style="color:var(--red)">${res.invalid_rows} invalid</span>` : '');

      const tbody = document.getElementById('import-preview-tbody');
      tbody.innerHTML = pendingCSVRows.slice(0, 50).map(r => `
        <tr>
          <td>
            ${r.is_duplicate ? '<span class="import-tag-duplicate">Duplicate</span>' : (r.is_valid ? '<span class="import-tag-valid">Ready</span>' : '<span style="color:var(--red);font-size:0.75rem;">Invalid</span>')}
          </td>
          <td>${r.date}</td>
          <td>${escHtml(r.account_name)}</td>
          <td>${escHtml(r.category_name)}</td>
          <td>${escHtml(r.reason)}</td>
          <td>${fmt(r.amount)}</td>
        </tr>
      `).join('');

      document.getElementById('import-step-upload').style.display = 'none';
      document.getElementById('import-step-preview').style.display = 'block';
      document.getElementById('btn-execute-import').style.display = 'inline-block';
      document.getElementById('btn-execute-import').textContent = `Import ${res.valid_rows} Records`;
    } catch (err) {
      console.error(err);
    } finally {
      hideLoading();
    }
  };
  reader.readAsText(file);
}

async function executeCSVImport() {
  if (!pendingCSVRows.length) return;
  const skipDuplicates = document.getElementById('skip-duplicates-check').checked;

  try {
    showLoading();
    const res = await apiCall('/import/csv', {
      method: 'POST',
      body: JSON.stringify({ rows: pendingCSVRows, skip_duplicates: skipDuplicates })
    });

    closeImportModal();
    await loadData();
    showToast(`✅ Imported ${res.imported} transactions successfully!`);
  } catch (err) {
    console.error('Import error:', err);
  } finally {
    hideLoading();
  }
}

// ─── VALIDATED JSON BACKUP & RESTORE ──────────────────────────────────────────

async function downloadBackupJSON() {
  try {
    showLoading();
    const data = await apiCall('/backup');
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moneyflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('💾 Backup file downloaded successfully!');
  } catch (e) {
    console.error('Backup download error:', e);
  } finally {
    hideLoading();
  }
}

function handleRestoreFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const backupData = JSON.parse(evt.target.result);
      if (!backupData || backupData.schema_version !== '1.0') {
        showToast('⚠️ Unsupported or invalid backup schema version', true);
        return;
      }

      const txCount = (backupData.transactions || []).length;
      if (!confirm(`Restore backup containing ${txCount} transactions from ${backupData.exported_at?.slice(0,10) || 'file'}?`)) {
        return;
      }

      showLoading();
      const res = await apiCall('/backup/restore', {
        method: 'POST',
        body: JSON.stringify(backupData)
      });

      await loadData();
      showToast(`✅ Restored ${res.restored?.transactions || 0} transactions successfully!`);
    } catch (err) {
      console.error('Restore error:', err);
      showToast('❌ Failed to parse or restore backup: ' + err.message, true);
    } finally {
      hideLoading();
      e.target.value = '';
    }
  };
  reader.readAsText(file);
}

// ─── CALCULATOR (modal) ───────────────────────────────────────────────────────

let calcDisplay        = '0';
let calcPrev           = 0;
let calcOp             = null;
let calcExpression     = '';
let shouldResetDisplay = false;

function toggleCalculator() {
  document.getElementById('calculator-modal').classList.toggle('show');
}

function updateCalcDisplay() {
  document.getElementById('calc-display').value = calcDisplay;
  document.getElementById('calc-expression').textContent = calcExpression;
}

function appendToCalc(v) {
  if (shouldResetDisplay) { calcDisplay = ''; shouldResetDisplay = false; }
  if (v === '.' && calcDisplay.includes('.')) return;
  if (calcDisplay === '0' && v !== '.') calcDisplay = v;
  else calcDisplay += v;
  updateCalcDisplay();
}

function setOperation(op) {
  if (calcOp && !shouldResetDisplay) calculate(false);
  calcExpression = calcDisplay + ' ' + op;
  calcPrev = parseFloat(calcDisplay) || 0;
  calcOp   = op;
  shouldResetDisplay = true;
  updateCalcDisplay();
}

function calculate(finalize = true) {
  const cur    = parseFloat(calcDisplay) || 0;
  let result   = 0;
  switch (calcOp) {
    case '+': result = calcPrev + cur; break;
    case '-': result = calcPrev - cur; break;
    case '*': result = calcPrev * cur; break;
    case '/': result = cur !== 0 ? calcPrev / cur : 0; break;
    default:  return;
  }
  if (finalize) { calcExpression = ''; calcOp = null; }
  calcDisplay = parseFloat(result.toFixed(8)).toString();
  shouldResetDisplay = true;
  updateCalcDisplay();
}

function clearCalc() {
  calcDisplay = '0'; calcPrev = 0; calcOp = null; calcExpression = '';
  shouldResetDisplay = false; updateCalcDisplay();
}

function backspaceCalc() {
  if (shouldResetDisplay) return;
  calcDisplay = calcDisplay.slice(0, -1) || '0';
  updateCalcDisplay();
}

function setPercent() {
  calcDisplay = (parseFloat(calcDisplay) / 100).toString();
  shouldResetDisplay = true; updateCalcDisplay();
}

function togglePlusMinus() {
  calcDisplay = (parseFloat(calcDisplay) * -1).toString(); updateCalcDisplay();
}

function useCalcResult() {
  const amtField = document.getElementById('f-amt');
  if (amtField) {
    amtField.value = parseFloat(calcDisplay) || 0;
    toggleCalculator();
    showToast('✅ Amount filled from calculator');
  }
}

// ─── FLOATING CALCULATOR ─────────────────────────────────────────────────────

let fCalcDisplay = '0', fCalcPrev = 0, fCalcOp = null, fCalcReset = false;

function toggleFloatingCalculator() {
  document.getElementById('floating-calculator').classList.toggle('open');
}

function appendToFloatingCalc(v) {
  if (fCalcReset) { fCalcDisplay = ''; fCalcReset = false; }
  if (v === '.' && fCalcDisplay.includes('.')) return;
  if (fCalcDisplay === '0' && v !== '.') fCalcDisplay = v;
  else fCalcDisplay += v;
  document.getElementById('floating-calc-display').value = fCalcDisplay;
}

function setFloatingOperation(op) {
  if (fCalcOp && !fCalcReset) calculateFloating();
  fCalcPrev  = parseFloat(fCalcDisplay) || 0;
  fCalcOp    = op; fCalcReset = true;
  document.getElementById('floating-calc-display').value = fCalcDisplay;
}

function calculateFloating() {
  const cur = parseFloat(fCalcDisplay) || 0;
  let result = 0;
  switch (fCalcOp) {
    case '+': result = fCalcPrev + cur; break;
    case '-': result = fCalcPrev - cur; break;
    case '*': result = fCalcPrev * cur; break;
    case '/': result = cur !== 0 ? fCalcPrev / cur : 0; break;
    default:  return;
  }
  fCalcDisplay = parseFloat(result.toFixed(8)).toString();
  document.getElementById('floating-calc-display').value = fCalcDisplay;
  fCalcOp = null; fCalcReset = true;
}

function clearFloatingCalc() {
  fCalcDisplay = '0'; fCalcPrev = 0; fCalcOp = null; fCalcReset = false;
  document.getElementById('floating-calc-display').value = '0';
}

function backspaceFloatingCalc() {
  if (fCalcReset) return;
  fCalcDisplay = fCalcDisplay.slice(0, -1) || '0';
  document.getElementById('floating-calc-display').value = fCalcDisplay;
}

function setFloatingPercent() {
  fCalcDisplay = (parseFloat(fCalcDisplay) / 100).toString();
  fCalcReset   = true;
  document.getElementById('floating-calc-display').value = fCalcDisplay;
}

function toggleFloatingPlusMinus() {
  fCalcDisplay = (parseFloat(fCalcDisplay) * -1).toString();
  document.getElementById('floating-calc-display').value = fCalcDisplay;
}

// ─── CLOSE MODALS ON BACKGROUND CLICK ────────────────────────────────────────

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('show');
  }
});

// ─── UTILITY ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

loadTheme();
loadData();
