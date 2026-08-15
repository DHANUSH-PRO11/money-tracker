const API_BASE = window.location.origin + '/api';

function showMessage(message, isError = false) {
  const messageDiv = document.getElementById('message');
  messageDiv.className = isError ? 'error-message' : 'success-message';
  messageDiv.textContent = message;
  messageDiv.style.display = 'block';
  
  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 5000);
}

async function handleLogin(event) {
  event.preventDefault();
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  try {
    const response = await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Store token and user info
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      showMessage('Login successful! Redirecting...', false);
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 2000);
    } else {
      showMessage(data.error || 'Login failed. Please try again.', true);
    }
  } catch (error) {
    console.error('Login error:', error);
    showMessage('Network error. Please try again.', true);
  }
}

// Check if user is already logged in
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  if (token) {
    // Verify token is still valid
    fetch(API_BASE + '/auth/verify', {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    })
    .then(response => {
      if (response.ok) {
        window.location.href = '/index.html';
      }
    })
    .catch(() => {
      // Token invalid, clear it
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    });
  }
});
