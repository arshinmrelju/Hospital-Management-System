'use strict';

const pwInput = document.getElementById('password');
const pwIcon = document.getElementById('pwIcon');
document.getElementById('togglePw')?.addEventListener('click', () => {
  const isText = pwInput.type === 'text';
  pwInput.type = isText ? 'password' : 'text';
  pwIcon.textContent = isText ? 'visibility' : 'visibility_off';
});

document.getElementById('forgotPwLink')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  if (!email) {
    alert('Please enter your email address first, then click "Forgot password?".');
    return;
  }
  try {
    await window.sendFirebasePasswordReset(email);
    alert('Password reset email sent. Check your inbox (and spam folder).');
  } catch (err) {
    alert(err.message || 'Failed to send reset email.');
  }
});

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('loginBtn');
  const errorMsg = document.getElementById('errorMsg');

  btn.classList.add('loading');
  errorMsg.classList.remove('visible');

  try {
    const auth = window.HMS_AUTH;
    if (!auth) throw new Error('Auth system not initialized');

    const userProfile = await auth.login(email, password);
    const sessionData = {
      uid: userProfile.uid,
      email: userProfile.email,
      name: userProfile.name || email.split('@')[0],
      title: userProfile.title || '',
      role: userProfile.role || 'Staff',
      redirect: auth.getRedirect(userProfile.role)
    };
    auth.setSession(sessionData);

    btn.innerHTML = '<span class="material-icons-round">check_circle</span><span class="btn-text">Authenticated!</span>';
    btn.style.background = '#10B981';
    setTimeout(() => { location.href = sessionData.redirect; }, 700);
  } catch (err) {
    btn.classList.remove('loading');
    let message = 'Invalid credentials. Please try again.';
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      message = 'Invalid email or password.';
    } else if (err.code === 'auth/too-many-requests') {
      message = 'Too many attempts. Account temporarily locked.';
    } else if (err.code === 'auth/invalid-email') {
      message = 'Please enter a valid email address.';
    } else if (err.code === 'auth/network-request-failed') {
      message = 'Network error. Check your connection.';
    } else {
      message = err.message || 'Login failed.';
    }
    errorMsg.innerHTML = `<span class="material-icons-round">error</span> ${message.replace(/[<>&"']/g, '')}`;
    errorMsg.classList.add('visible');
    const form = document.getElementById('loginForm');
    form.style.animation = 'none';
    void form.offsetWidth;
    form.style.animation = 'shake 0.4s ease';
  }
});

const style = document.createElement('style');
style.textContent = '@keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }';
document.head.appendChild(style);

// If already logged in (session in sessionStorage or Firebase Auth restores), redirect
(async () => {
  try {
    if (window._authReady) await window._authReady;
  } catch (_) {}
  const existing = sessionStorage.getItem('hms_session');
  if (existing) {
    try {
      const u = JSON.parse(existing);
      if (u && u.redirect && u.redirect !== window.location.href) location.href = u.redirect;
    } catch (_) { }
  }
})();
