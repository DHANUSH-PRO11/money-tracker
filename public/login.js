/**
 * MoneyFlow Tracker - Authentication Helper (Login)
 */
const API_BASE = window.location.origin + '/api';

function showMessage(message, isError = false) {
  const messageDiv = document.getElementById('message');
  if (!messageDiv) return;
  messageDiv.className = isError ? 'error-msg' : 'success-msg';
  messageDiv.textContent = message;
  messageDiv.style.display = 'block';
  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 5000);
}

async function handleLogin(event) {
  event.preventDefault();
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const btn = document.getElementById('submit-btn');

  if (!emailInput || !passwordInput) return;
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage('Please enter both email and password.', true);
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Signing in…';
  }

  try {
    const response = await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();

    if (response.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      showMessage('✅ Signed in successfully! Redirecting…', false);
      setTimeout(() => {
        window.location.replace('/index.html');
      }, 400);
    } else {
      showMessage(data.error || 'Login failed. Please check credentials.', true);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    }
  } catch (error) {
    console.error('Login error:', error);
    showMessage('Network error. Please try again.', true);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }
}
