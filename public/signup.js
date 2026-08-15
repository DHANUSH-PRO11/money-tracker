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

async function handleSignup(event) {
  event.preventDefault();
  
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  
  // Validation
  if (password !== confirmPassword) {
    showMessage('Passwords do not match. Please try again.', true);
    return;
  }
  
  if (password.length < 6) {
    showMessage('Password must be at least 6 characters long.', true);
    return;
  }
  
  try {
    const response = await fetch(API_BASE + '/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showMessage('Account created successfully! Redirecting to login...', false);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = '/login.html';
      }, 2000);
    } else {
      showMessage(data.error || 'Signup failed. Please try again.', true);
    }
  } catch (error) {
    console.error('Signup error:', error);
    showMessage('Network error. Please try again.', true);
  }
}
