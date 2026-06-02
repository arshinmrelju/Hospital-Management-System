const ALLOWED_PAGES = {
  '/admin/dashboard': ['Admin'],
  '/admin/patients': ['Admin'],
  '/admin/appointments': ['Admin'],
  '/admin/doctors': ['Admin'],
  '/admin/pharmacy': ['Admin'],
  '/admin/lab': ['Admin'],
  '/admin/reports': ['Admin'],
  '/admin/administration': ['Admin'],
  '/admin/settings': ['Admin'],
  '/admin/csv-export': ['Admin'],
  '/admin/import-patients': ['Admin'],
  '/admin/import-inventory': ['Admin'],
  '/doctor/dashboard': ['Doctor'],
  '/doctor/patients': ['Doctor'],
  '/doctor/appointments': ['Doctor'],
  '/doctor/doctors': ['Doctor'],
  '/doctor/settings': ['Doctor'],
  '/staff/dashboard': ['Staff'],
  '/staff/patients': ['Staff'],
  '/staff/appointments': ['Staff'],
  '/staff/csv-export': ['Staff'],
  '/staff/settings': ['Staff'],
  '/pharmacist/dashboard': ['Pharmacist'],
  '/pharmacist/pharmacy': ['Pharmacist'],
  '/pharmacist/import-inventory': ['Pharmacist'],
  '/pharmacist/csv-export': ['Pharmacist'],
  '/pharmacist/settings': ['Pharmacist'],
  '/labtech/dashboard': ['Lab Tech'],
  '/labtech/lab': ['Lab Tech'],
  '/labtech/settings': ['Lab Tech']
};

const ROLE_LOGIN_PAGES = {
  Admin: '/login-admin',
  Doctor: '/login-doctor',
  Staff: '/login-staff',
  Pharmacist: '/login-pharmacist',
  'Lab Tech': '/login-labtech'
};

function getCurrentRoute() {
  const path = window.location.pathname.replace(/\.html$/, '');
  return path;
}

function requireRole(allowedRoles) {
  return new Promise((resolve) => {
    const check = () => {
      const user = window.HMS ? window.HMS.getUser() : null;
      if (!user) {
        window.location.href = '/';
        return;
      }
      if (!allowedRoles.includes(user.role)) {
        const redirect = user.role ? (ROLE_LOGIN_PAGES[user.role] || '/') : '/';
        window.location.href = redirect;
        return;
      }
      resolve(user);
    };
    if (window._authReady) {
      window._authReady.then(check);
    } else {
      const poll = setInterval(() => {
        if (window._authReady !== undefined) {
          clearInterval(poll);
          window._authReady.then(check);
        }
      }, 50);
      setTimeout(() => { clearInterval(poll); check(); }, 3000);
    }
  });
}

function getRoleLoginUrl(role) {
  return ROLE_LOGIN_PAGES[role] || '/';
}
