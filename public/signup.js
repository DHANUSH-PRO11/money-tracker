/**
 * MoneyFlow Tracker - Authentication Helper (Signup)
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

async function handleSignup(event) {
  event.preventDefault();
  const name = document.getElementById('name')?.value.trim();
  const email = document.getElementById('email')?.value.trim();
  const password = document.getElementById('password')?.value;
  const confirmPassword = document.getElementById('confirmPassword')?.value;
  const btn = document.getElementById('submit-btn');

  if (!name || !email || !password) {
    showMessage('Please fill in all required fields.', true);
    return;
  }

  if (password !== confirmPassword) {
    showMessage('Passwords do not match. Please verify.', true);
    return;
  }

  if (password.length < 6) {
    showMessage('Password must be at least 6 characters long.', true);
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Creating account…';
  }

  try {
    const response = await fetch(API_BASE + '/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await response.json();

    if (response.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      showMessage('✅ Account created successfully! Redirecting…', false);
      setTimeout(() => {
        window.location.replace('/index.html');
      }, 400);
    } else {
      showMessage(data.error || 'Signup failed. Please try again.', true);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Create Account';
      }
    }
  } catch (error) {
    console.error('Signup error:', error);
    showMessage('Network error. Please try again.', true);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  }
}
