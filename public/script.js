const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const API_BASE = window.location.origin + '/api';

let accounts = [];
let txns = [];
let budgets = [];
let curFilter = 'all';
let curType = 'out';
let charts = {};
let activePage = localStorage.getItem('activePage') || 'home';
let pageScrollPositions = {};

try {
  pageScrollPositions = JSON.parse(localStorage.getItem('pageScrollPositions') || '{}');
} catch (error) {
  pageScrollPositions = {};
}

const fmt = n => {
  const abs = Math.abs(n);
  const formatted = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '');
  return '§' + formatted;
};

// Theme Management
function toggleTheme() {
  const body = document.body;
  const currentTheme = body.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  body.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  const themeBtn = document.querySelector('.theme-toggle');
  themeBtn.textContent = newTheme === 'light' ? '§' : '§';
}

function loadTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.body.setAttribute('data-theme', savedTheme);
  const themeBtn = document.querySelector('.theme-toggle');
  themeBtn.textContent = savedTheme === 'light' ? '§' : '§';
}

// Check authentication status
function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

// API Functions
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
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    showToast('§ ' + error.message, true);
    throw error;
  }
}

// Logout function
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login.html';
}

document.getElementById('f-date').value = new Date().toISOString().slice(0,10);

function pickType(t) {
  curType = t;
  document.getElementById('tp-out').className = 'topt' + (t==='out' ? ' out' : '');
  document.getElementById('tp-in').className  = 'topt' + (t==='in'  ? ' in' : '');
}

async function addEntry() {
  const date = document.getElementById('f-date').value;
  const aid  = parseInt(document.getElementById('f-acc').value);
  const cid  = document.getElementById('f-cat').value ? parseInt(document.getElementById('f-cat').value) : null;
  const rsn  = document.getElementById('f-reason').value.trim();
  const amt  = parseFloat(document.getElementById('f-amt').value);
  
  if (!date || !rsn || isNaN(amt) || amt <= 0) {
    showToast('Fill all fields correctly', true); return;
  }
  
  try {
    const newTransaction = await apiCall('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        date,
        account_id: aid,
        category_id: cid,
        reason: rsn,
        amount: amt,
        type: curType
      })
    });
    
    txns.unshift(newTransaction);
    refreshNav();
    
    document.getElementById('f-reason').value = '';
    document.getElementById('f-amt').value = '';
    document.getElementById('f-cat').value = '';
    
    showToast('Entry added!');
  } catch (error) {
    console.error('Failed to add entry:', error);
  }
}

async function deleteEntry(id) {
  if (!confirm('Are you sure you want to delete this entry?')) return;
  
  try {
    await apiCall(`/transactions/${id}`, { method: 'DELETE' });
    txns = txns.filter(t => t.id !== id);
    drawDash(); 
    refreshNav();
    showToast('Entry deleted');
  } catch (error) {
    console.error('Failed to delete entry:', error);
  }
}

async function renameAcc(id, val) {
  if (!val.trim()) return;
  
  try {
    await apiCall(`/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: val.trim() })
    });
    
    drawDash(); 
    fillAccSelect();
    showToast('Account renamed');
  } catch (error) {
    console.error('Failed to rename account:', error);
  }
}

function fillAccSelect() {
  const select = document.getElementById('f-acc');
  if (!select) return;
  
  select.innerHTML = accounts.length > 0 
    ? accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('')
    : '<option value="">No accounts available</option>';
}

async function refreshNav() {
  try {
    const summary = await apiCall('/summary');
    const n = summary.net_balance;
    const el = document.getElementById('nav-bal');
    el.textContent = (n<0?'-':'')+fmt(n);
    el.className = n>=0 ? 'bal-pill positive' : 'bal-pill negative';
  } catch (error) {
    console.error('Failed to refresh nav:', error);
  }
}

function filt(val, btn) {
  curFilter = val;
  document.querySelectorAll('.fbtn').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  drawTable();
}

async function drawDash() {
  try {
    const [accountBalances, summary] = await Promise.all([
      apiCall('/account-balances'),
      apiCall('/summary')
    ]);
    
    document.getElementById('acc-grid').innerHTML = accountBalances.map((a,i) => {
      return `<div class="acc-card">
        <div class="acc-name-row">
          <input class="acc-name" value="${a.name}" onchange="renameAcc(${a.id},this.value)" title="Click to rename">
          <span class="edit-ico">§</span>
        </div>
        <div class="acc-bal">${fmt(a.balance)}</div>
        <div class="acc-sub">${a.transaction_count} transaction${a.transaction_count!==1?'s':''}</div>
      </div>`;
    }).join('');

    document.getElementById('filt-btns').innerHTML = accounts.map(a =>
      `<button class="fbtn ${curFilter==a.id?'on':''}" onclick="filt(${a.id},this)">${a.name}</button>`
    ).join('');

    document.getElementById('s-in').textContent  = fmt(summary.total_in);
    document.getElementById('s-out').textContent = fmt(summary.total_out);
    document.getElementById('s-net').textContent = fmt(summary.net_balance);
    document.getElementById('s-net').className = summary.net_balance>=0 ? 'positive' : 'negative';
    document.getElementById('s-cnt').textContent = summary.total_transactions;
    
    drawTable();
  } catch (error) {
    console.error('Failed to draw dashboard:', error);
  }
}

function drawTable() {
  // Check if we're on the dashboard page
  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('empty');
  const srch = document.getElementById('srch');
  const catFilter = document.getElementById('cat-filter');
  
  // If any required elements don't exist, return early
  if (!tbody || !empty || !srch || !catFilter) {
    return;
  }
  
  const srchValue = srch.value.toLowerCase();
  const catFilterValue = catFilter.value;
  const rows = txns.filter(t => {
    const matchesSearch = t.reason.toLowerCase().includes(srchValue) || 
                         t.account_name.toLowerCase().includes(srchValue) || 
                         (t.category_name||'').toLowerCase().includes(srchValue);
    const matchesCategory = !catFilterValue || t.category_id == catFilterValue;
    return matchesSearch && matchesCategory;
  });
  
  if (!rows.length) { tbody.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  tbody.innerHTML = rows.map(t => {
    const d   = new Date(t.date+'T00:00:00');
    const day = DAYS[d.getDay()];
    const acc = accounts.find(a=>a.id===t.account_id);
    const idx = accounts.findIndex(a=>a.id===t.account_id);
    return `<tr>
      <td class="dt">${t.date}</td>
      <td class="dy">${day}</td>
      <td><span class="badge b${idx%3}">${acc?acc.name:'?'}</span></td>
      <td>${t.category_name || 'Uncategorized'}</td>
      <td>${t.reason}</td>
      <td>${t.type==='in'?'<span class="tin">IN</span>':'<span class="tout">OUT</span>'}</td>
      <td class="amt ${t.type==='in'?'gi':'ri'}">${t.type==='in'?'+':'-'}${fmt(t.amount)}</td>
      <td><button class="xbtn" onclick="deleteEntry(${t.id})">🗑️</button></td>
    </tr>`;
  }).join('');
}

function exportCSV() {
  window.open(API_BASE + '/export/csv', '_blank');
  showToast('₹ Export started!');
}

// Export Modal Functions
function showExportModal() {
  // Set default date range (last 30 days)
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
  
  document.getElementById('export-start-date').value = thirtyDaysAgo.toISOString().split('T')[0];
  document.getElementById('export-end-date').value = today.toISOString().split('T')[0];
  
  document.getElementById('export-modal').classList.add('show');
}

function closeExportModal() {
  document.getElementById('export-modal').classList.remove('show');
}

async function exportTransactions() {
  const startDate = document.getElementById('export-start-date').value;
  const endDate = document.getElementById('export-end-date').value;
  const format = document.querySelector('input[name="export-format"]:checked').value;
  
  if (!startDate || !endDate) {
    showToast('₹ Please select both start and end dates', true);
    return;
  }
  
  try {
    // Create a form and submit it to avoid CORS issues
    const form = document.createElement('form');
    form.method = 'GET';
    form.action = `${API_BASE}/export/${format}`;
    form.target = '_blank';
    
    // Add date parameters
    const startInput = document.createElement('input');
    startInput.type = 'hidden';
    startInput.name = 'start';
    startInput.value = startDate;
    form.appendChild(startInput);
    
    const endInput = document.createElement('input');
    endInput.type = 'hidden';
    endInput.name = 'end';
    endInput.value = endDate;
    form.appendChild(endInput);
    
    // Add token
    const tokenInput = document.createElement('input');
    tokenInput.type = 'hidden';
    tokenInput.name = 'token';
    tokenInput.value = localStorage.getItem('token');
    form.appendChild(tokenInput);
    
    // Submit form
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
    
    closeExportModal();
    showToast(`₹ Export started in ${format.toUpperCase()} format!`);
  } catch (error) {
    console.error('Export error:', error);
    showToast('₹ Export failed', true);
  }
}

let toastTimeout;
function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent  = msg;
  el.style.borderColor = isError?'var(--a2)':'var(--a1)';
  el.style.color       = isError?'var(--a2)':'var(--a1)';
  el.classList.add('on');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(()=>el.classList.remove('on'), 3000);
}

// Account and Category Management
let categories = [];
let editingAccountId = null;
let editingCategoryId = null;

// Load categories
async function loadCategories() {
  try {
    categories = await apiCall('/categories');
    fillCategorySelect();
  } catch (error) {
    console.error('Failed to load categories:', error);
  }
}

// Fill category select in form
function fillCategorySelect() {
  const select = document.getElementById('f-cat');
  if (!select) return;
  
  select.innerHTML = '<option value="">No Category</option>' + 
    categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
}

// Show manage page
async function showManagePage() {
  try {
    await loadCategories();
    
    // Load accounts
    const accountBalances = await apiCall('/account-balances');
    
    // Display accounts
    document.getElementById('accounts-list').innerHTML = accountBalances.map(a => `
      <div class="manage-item">
        <div class="manage-item-info">
          <div class="manage-item-name">${a.name}</div>
          <div class="manage-item-details">${a.transaction_count} transactions Balance: ${fmt(a.balance)}</div>
        </div>
        <div class="manage-item-actions">
          <button class="btn-edit" onclick="editAccount(${a.id}, '${a.name}')">Edit</button>
          ${a.transaction_count === 0 ? `<button class="btn-delete" onclick="deleteAccount(${a.id})">Delete</button>` : ''}
        </div>
      </div>
    `).join('');
    
    // Display categories
    document.getElementById('categories-list').innerHTML = categories.map(c => `
      <div class="manage-item">
        <div class="manage-item-info">
          <div class="manage-item-name">${c.icon} ${c.name}</div>
          <div class="manage-item-details" style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 12px; height: 12px; background: ${c.color}; border-radius: 50%;"></span>
            ${c.color}
          </div>
        </div>
        <div class="manage-item-actions">
          <button class="btn-edit" onclick="editCategory(${c.id}, '${c.name}', '${c.color}', '${c.icon}')">Edit</button>
          <button class="btn-delete" onclick="deleteCategory(${c.id})">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Failed to load manage page:', error);
  }
}

// Account Management Functions
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
  if (!name) {
    showToast('₹ Account name is required', true);
    return;
  }
  
  try {
    if (editingAccountId) {
      await apiCall(`/accounts/${editingAccountId}`, {
        method: 'PUT',
        body: JSON.stringify({ name })
      });
      showToast('Account updated successfully');
    } else {
      await apiCall('/accounts', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      showToast('Account created successfully');
    }
    
    closeAccountModal();
    await loadData();
    await showManagePage();
  } catch (error) {
    console.error('Failed to save account:', error);
  }
}

async function deleteAccount(id) {
  if (!confirm('Are you sure you want to delete this account?')) return;
  
  try {
    await apiCall(`/accounts/${id}`, { method: 'DELETE' });
    showToast('Account deleted successfully');
    await loadData();
    await showManagePage();
  } catch (error) {
    console.error('Failed to delete account:', error);
  }
}

// Category Management Functions
function showAddCategoryModal() {
  editingCategoryId = null;
  document.getElementById('category-modal-title').textContent = 'Add New Category';
  document.getElementById('category-name').value = '';
  document.getElementById('category-color').value = '#7c6af7';
  document.getElementById('category-icon').value = '🍔';
  document.getElementById('category-modal').classList.add('show');
}

function editCategory(id, name, color, icon) {
  editingCategoryId = id;
  document.getElementById('category-modal-title').textContent = 'Edit Category';
  document.getElementById('category-name').value = name;
  document.getElementById('category-color').value = color;
  document.getElementById('category-icon').value = icon;
  document.getElementById('category-modal').classList.add('show');
}

function closeCategoryModal() {
  document.getElementById('category-modal').classList.remove('show');
  editingCategoryId = null;
}

async function saveCategory() {
  const name = document.getElementById('category-name').value.trim();
  const color = document.getElementById('category-color').value;
  const icon = document.getElementById('category-icon').value.trim() || '🍔';
  
  if (!name) {
    showToast('₹ Category name is required', true);
    return;
  }
  
  try {
    if (editingCategoryId) {
      await apiCall(`/categories/${editingCategoryId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, color, icon })
      });
      showToast('Category updated successfully');
    } else {
      await apiCall('/categories', {
        method: 'POST',
        body: JSON.stringify({ name, color, icon })
      });
      showToast('Category created successfully');
    }
    
    closeCategoryModal();
    await loadCategories();
    await showManagePage();
  } catch (error) {
    console.error('Failed to save category:', error);
  }
}

async function deleteCategory(id) {
  if (!confirm('Are you sure you want to delete this category?')) return;
  
  try {
    await apiCall(`/categories/${id}`, { method: 'DELETE' });
    showToast('Category deleted successfully');
    await loadCategories();
    await showManagePage();
  } catch (error) {
    console.error('Failed to delete category:', error);
  }
}

// Update go function to handle manage page
async function go(page) {
  const pageId = 'pg-' + page;
  const tabId = 't-' + page;
  if (!document.getElementById(pageId) || !document.getElementById(tabId)) {
    page = 'home';
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('on'));
  document.getElementById('pg-'+page).classList.add('on');
  document.getElementById('t-'+page).classList.add('on');
  
  // Show/hide calculator based on page
  const calculator = document.getElementById('floating-calculator');
  if (page === 'dash') {
    calculator.style.display = 'block';
  } else {
    calculator.style.display = 'none';
  }
  
  if (page==='dash') drawDash();
  if (page==='manage') showManagePage();
  if (page==='budgets') showBudgetsPage();
}

// --- BUDGET MANAGEMENT ---
let editingBudgetId = null;

async function loadBudgets() {
  try {
    budgets = await apiCall('/budgets');
  } catch (error) {
    console.error('Failed to load budgets:', error);
  }
}

function populateBudgetCategoryFilter() {
  const select = document.getElementById('budget-category');
  if (!select) return;
  select.innerHTML = '<option value="">Select Category</option>' + 
    categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
}

async function showBudgetsPage() {
  try {
    const summary = await apiCall('/summary');
    await loadBudgets();
    
    const grid = document.getElementById('budget-grid');
    if (!grid) return;
    
    if (budgets.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 20px; color: var(--text-muted)">No budgets set. Click "+ Set Budget" to start tracking.</div>';
      return;
    }
    
    grid.innerHTML = budgets.map(b => {
      let spent = 0;
      if (summary.categories && summary.categories[b.category_name]) {
        spent = summary.categories[b.category_name].out || 0;
      }
      
      const pct = Math.min(100, Math.round((spent / b.amount) * 100));
      const remaining = b.amount - spent;
      let barColor = 'var(--a1)';
      if (pct > 90) barColor = 'var(--a2)';
      else if (pct > 75) barColor = 'orange';
      
      return `
      <div class="acc-card">
        <div class="acc-name-row">
          <div class="acc-name">${b.category_icon || ''} ${b.category_name || 'Unknown'}</div>
          <button class="xbtn" onclick="deleteBudget(${b.id})" title="Delete" style="background:transparent; border:none; cursor:pointer;">🗑️</button>
        </div>
        <div style="font-size: 1.2rem; margin: 10px 0; color: var(--text)">${fmt(spent)} / ${fmt(b.amount)}</div>
        <div style="width: 100%; height: 8px; background: var(--bg2); border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
          <div style="width: ${pct}%; height: 100%; background: ${barColor}; border-radius: 4px;"></div>
        </div>
        <div class="acc-sub" style="display: flex; justify-content: space-between;">
          <span>${pct}% used</span>
          <span style="color: ${remaining < 0 ? 'var(--a2)' : 'var(--green)'}">${fmt(Math.abs(remaining))} ${remaining < 0 ? 'over' : 'left'}</span>
        </div>
        <button style="margin-top:12px; width:100%; padding: 6px; background: var(--bg2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; cursor: pointer;" onclick="editBudget(${b.id}, ${b.category_id}, ${b.amount})">Edit</button>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('Error drawing budgets page:', err);
  }
}

function showAddBudgetModal() {
  editingBudgetId = null;
  document.getElementById('budget-modal-title').textContent = 'Set Category Budget';
  document.getElementById('budget-category').value = '';
  document.getElementById('budget-amount').value = '';
  document.getElementById('budget-modal').classList.add('show');
}

function editBudget(id, category_id, amount) {
  editingBudgetId = id;
  document.getElementById('budget-modal-title').textContent = 'Edit Budget';
  document.getElementById('budget-category').value = category_id;
  document.getElementById('budget-amount').value = amount;
  document.getElementById('budget-modal').classList.add('show');
}

function closeBudgetModal() {
  document.getElementById('budget-modal').classList.remove('show');
}

async function saveBudget() {
  const category_id = document.getElementById('budget-category').value;
  const amount = parseFloat(document.getElementById('budget-amount').value);
  
  if (!category_id || isNaN(amount) || amount <= 0) {
    showToast('Select a category and enter a valid amount', true);
    return;
  }
  
  try {
    if (editingBudgetId) {
      await apiCall(`/budgets/${editingBudgetId}`, {
        method: 'PUT',
        body: JSON.stringify({ category_id, amount })
      });
      showToast('Budget updated');
    } else {
      await apiCall('/budgets', {
        method: 'POST',
        body: JSON.stringify({ category_id, amount })
      });
      showToast('Budget set');
    }
    closeBudgetModal();
    showBudgetsPage();
  } catch (error) {
    console.error('Failed to save budget:', error);
  }
}

async function deleteBudget(id) {
  if (!confirm('Delete this budget?')) return;
  try {
    await apiCall(`/budgets/${id}`, { method: 'DELETE' });
    showToast('Budget deleted');
    showBudgetsPage();
  } catch (error) {
    console.error('Failed to delete budget:', error);
  }
}

// Populate category filter dropdown
function populateCategoryFilter() {
  const catFilter = document.getElementById('cat-filter');
  catFilter.innerHTML = '<option value="">All Categories</option>';
  
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat.id;
    option.textContent = `${cat.icon || ''} ${cat.name}`;
    catFilter.appendChild(option);
  });
}

// Update loadData to include categories
async function loadData() {
  if (!checkAuth()) return;
  
  try {
    const [accountsData, transactionsData, budgetsData] = await Promise.all([
      apiCall('/accounts'),
      apiCall('/transactions'),
      apiCall('/budgets')
    ]);
    
    accounts = accountsData;
    txns = transactionsData;
    budgets = budgetsData || [];
    
    await loadCategories();
    fillAccSelect();
    populateCategoryFilter();
    populateBudgetCategoryFilter();
    refreshNav();
    await go(activePage);
  } catch (error) {
    console.error('Failed to load data:', error);
  }
}

// Calculator Variables
let calcDisplay = '0';
let previousValue = 0;
let operation = null;
let shouldResetDisplay = false;

// Calculator Functions
function toggleCalculator() {
  const modal = document.getElementById('calculator-modal');
  modal.classList.toggle('show');
}

function appendToCalc(value) {
  const display = document.getElementById('calc-display');
  
  if (shouldResetDisplay) {
    calcDisplay = '';
    shouldResetDisplay = false;
  }
  
  if (value === '.' && calcDisplay.includes('.')) {
    return;
  }
  
  calcDisplay += value;
  display.value = calcDisplay;
}

function setOperation(op) {
  const display = document.getElementById('calc-display');
  
  if (operation !== null && !shouldResetDisplay) {
    calculate();
  }
  
  previousValue = parseFloat(calcDisplay) || 0;
  operation = op;
  shouldResetDisplay = true;
}

function calculate() {
  const display = document.getElementById('calc-display');
  const currentValue = parseFloat(calcDisplay) || 0;
  let result = 0;
  
  switch (operation) {
    case '+':
      result = previousValue + currentValue;
      break;
    case '-':
      result = previousValue - currentValue;
      break;
    case '*':
      result = previousValue * currentValue;
      break;
    case '/':
      result = currentValue !== 0 ? previousValue / currentValue : 0;
      break;
    default:
      return;
  }
  
  calcDisplay = result.toString();
  display.value = calcDisplay;
  operation = null;
  shouldResetDisplay = true;
}

function clearCalc() {
  calcDisplay = '0';
  previousValue = 0;
  operation = null;
  shouldResetDisplay = false;
  document.getElementById('calc-display').value = calcDisplay;
}

function backspaceCalc() {
  if (shouldResetDisplay) {
    return;
  }
  
  calcDisplay = calcDisplay.slice(0, -1);
  if (calcDisplay === '') {
    calcDisplay = '0';
  }
  document.getElementById('calc-display').value = calcDisplay;
}

function setPercent() {
  const display = document.getElementById('calc-display');
  const currentValue = parseFloat(calcDisplay) || 0;
  calcDisplay = (currentValue / 100).toString();
  display.value = calcDisplay;
  shouldResetDisplay = true;
}

function togglePlusMinus() {
  const display = document.getElementById('calc-display');
  const currentValue = parseFloat(calcDisplay) || 0;
  calcDisplay = (currentValue * -1).toString();
  display.value = calcDisplay;
}

// Floating Calculator Variables
let floatingCalcDisplay = '0';
let floatingPreviousValue = 0;
let floatingOperation = null;
let floatingShouldResetDisplay = false;

// Floating Calculator Functions
function toggleFloatingCalculator() {
  const calculator = document.getElementById('floating-calculator');
  calculator.classList.toggle('open');
}

function appendToFloatingCalc(value) {
  const display = document.getElementById('floating-calc-display');
  
  if (floatingShouldResetDisplay) {
    floatingCalcDisplay = '';
    floatingShouldResetDisplay = false;
  }
  
  if (value === '.' && floatingCalcDisplay.includes('.')) {
    return;
  }
  
  floatingCalcDisplay += value;
  display.value = floatingCalcDisplay;
}

function setFloatingOperation(op) {
  const display = document.getElementById('floating-calc-display');
  
  if (floatingOperation !== null && !floatingShouldResetDisplay) {
    calculateFloating();
  }
  
  floatingPreviousValue = parseFloat(floatingCalcDisplay) || 0;
  floatingOperation = op;
  floatingShouldResetDisplay = true;
}

function calculateFloating() {
  const display = document.getElementById('floating-calc-display');
  const currentValue = parseFloat(floatingCalcDisplay) || 0;
  let result = 0;
  
  switch (floatingOperation) {
    case '+':
      result = floatingPreviousValue + currentValue;
      break;
    case '-':
      result = floatingPreviousValue - currentValue;
      break;
    case '*':
      result = floatingPreviousValue * currentValue;
      break;
    case '/':
      result = currentValue !== 0 ? floatingPreviousValue / currentValue : 0;
      break;
    default:
      return;
  }
  
  floatingCalcDisplay = result.toString();
  display.value = floatingCalcDisplay;
  floatingOperation = null;
  floatingShouldResetDisplay = true;
}

function clearFloatingCalc() {
  floatingCalcDisplay = '0';
  floatingPreviousValue = 0;
  floatingOperation = null;
  floatingShouldResetDisplay = false;
  document.getElementById('floating-calc-display').value = floatingCalcDisplay;
}

function backspaceFloatingCalc() {
  if (floatingShouldResetDisplay) {
    return;
  }
  
  floatingCalcDisplay = floatingCalcDisplay.slice(0, -1);
  if (floatingCalcDisplay === '') {
    floatingCalcDisplay = '0';
  }
  document.getElementById('floating-calc-display').value = floatingCalcDisplay;
}

function setFloatingPercent() {
  const display = document.getElementById('floating-calc-display');
  const currentValue = parseFloat(floatingCalcDisplay) || 0;
  floatingCalcDisplay = (currentValue / 100).toString();
  display.value = floatingCalcDisplay;
  floatingShouldResetDisplay = true;
}

function toggleFloatingPlusMinus() {
  const display = document.getElementById('floating-calc-display');
  const currentValue = parseFloat(floatingCalcDisplay) || 0;
  floatingCalcDisplay = (currentValue * -1).toString();
  display.value = floatingCalcDisplay;
}

// Initialize
loadTheme();
loadData();
