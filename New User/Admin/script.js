// ===========================
// Bacolor Civil ID Portal
// script.js  (login + register page)
// ===========================

var STORAGE_ADMINS_KEY = 'ncrs_admins';
var BUILTIN_ADMIN_KEY = 'ncrs_builtin_admin';
var SESSION_KEY = 'ncrs_session';
var DASHBOARD_PAGE = 'admin-dashboard.html';

function getAdmins() {
  var stored = localStorage.getItem(STORAGE_ADMINS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    return [];
  }
}

function saveAdmins(admins) {
  localStorage.setItem(STORAGE_ADMINS_KEY, JSON.stringify(admins));
}

function getBuiltInAdmin() {
  var defaults = { name: 'Registry Admin', username: 'admin', password: 'admin123' };
  try {
    var saved = JSON.parse(localStorage.getItem(BUILTIN_ADMIN_KEY) || '{}');
    return {
      name: saved.name || defaults.name,
      username: 'admin',
      password: saved.password || defaults.password
    };
  } catch (e) {
    return defaults;
  }
}

function showToast(msg) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function () {
    toast.classList.remove('show');
  }, 2800);
}

function loginAndGoToDashboard(name, username) {
  var session = { name: name, role: 'admin', username: username };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.location.href = DASHBOARD_PAGE;
}

function setupAuthHandlers() {
  var tabLogin = document.getElementById('tabLogin');
  var tabRegister = document.getElementById('tabRegister');
  var formLogin = document.getElementById('formLogin');
  var formRegister = document.getElementById('formRegister');

  tabLogin.addEventListener('click', function () {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.classList.add('active-form');
    formRegister.classList.remove('active-form');
  });

  tabRegister.addEventListener('click', function () {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.classList.add('active-form');
    formLogin.classList.remove('active-form');
  });

  // Password visibility toggle buttons
  var toggleBtns = document.querySelectorAll('.toggle-pass-btn');
  for (var t = 0; t < toggleBtns.length; t++) {
    toggleBtns[t].addEventListener('click', function () {
      var targetId = this.getAttribute('data-target');
      var inputField = document.getElementById(targetId);
      if (inputField) {
        if (inputField.type === 'password') {
          inputField.type = 'text';
          this.textContent = '👁‍🗨'; // changed icon when visible
          this.setAttribute('aria-label', 'Hide password');
        } else {
          inputField.type = 'password';
          this.textContent = '👁';
          this.setAttribute('aria-label', 'Show password');
        }
      }
    });
  }

  formLogin.addEventListener('submit', function (e) {
    e.preventDefault();
    var inputUser = document.getElementById('loginUser').value.trim();
    var inputPass = document.getElementById('loginPass').value.trim();

    var builtIn = getBuiltInAdmin();
    var matchesBuiltInUser =
      inputUser.toLowerCase() === 'admin' ||
      inputUser.toLowerCase() === builtIn.name.toLowerCase();

    if (matchesBuiltInUser && inputPass === builtIn.password) {
      loginAndGoToDashboard(builtIn.name, 'admin');
      return;
    }

    var admins = getAdmins();
    var found = null;
    for (var i = 0; i < admins.length; i++) {
      var sameUsername = admins[i].username.toLowerCase() === inputUser.toLowerCase();
      var sameName = admins[i].name.toLowerCase() === inputUser.toLowerCase();
      if (sameUsername || sameName) {
        found = admins[i];
        break;
      }
    }

    if (!found) {
      alert('Admin account not found. Please register first.');
      return;
    }

    if (found.password !== inputPass) {
      alert('Incorrect password. Please try again.');
      return;
    }

    loginAndGoToDashboard(found.name, found.username);
  });

  formRegister.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('regName').value.trim();
    var username = document.getElementById('regUsername').value.trim();
    var phone = document.getElementById('regPhone').value.trim();
    var password = document.getElementById('regPass').value.trim();
    var confirmPass = document.getElementById('regPassConfirm').value.trim();

    if (password !== confirmPass) {
      alert('Passwords do not match. Please try again.');
      return;
    }

    var admins = getAdmins();
    var taken = username.toLowerCase() === 'admin';
    for (var i = 0; i < admins.length; i++) {
      if (admins[i].username.toLowerCase() === username.toLowerCase()) {
        taken = true;
      }
    }
    if (taken) {
      alert('That username is already taken. Please pick another one.');
      return;
    }

    admins.push({
      name: name,
      username: username,
      phone: phone,
      password: password,
      createdAt: new Date().toISOString().split('T')[0]
    });
    saveAdmins(admins);

    document.getElementById('loginUser').value = username;
    document.getElementById('loginPass').value = password;
    formRegister.reset();

    tabLogin.click();
    showToast('Admin account created for ' + name + '. You can now sign in.');
  });
}

document.addEventListener('DOMContentLoaded', function () {
  if (sessionStorage.getItem(SESSION_KEY)) {
    window.location.href = DASHBOARD_PAGE;
    return;
  }

  setupAuthHandlers();

  var notice = sessionStorage.getItem('ncrs_notice');
  if (notice) {
    showToast(notice);
    sessionStorage.removeItem('ncrs_notice');
  }
});

function enforceNumericOnly(inputElement) {
  if (!inputElement) return;

  // Strip non-digits on typing or pasting
  inputElement.addEventListener('input', function () {
    this.value = this.value.replace(/[^0-9]/g, '');
  });

  // Block non-digit keypresses immediately
  inputElement.addEventListener('keydown', function (e) {
    // Allow navigation/editing keys (Backspace, Delete, Tab, Escape, Enter, Arrows) and Ctrl/Cmd shortcuts
    if (
      [8, 9, 13, 27, 46, 37, 38, 39, 40].indexOf(e.keyCode) !== -1 ||
      (e.ctrlKey || e.metaKey)
    ) {
      return;
    }
    // Block anything that is not 0-9
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  });
}

// Function to enforce numbers-only on mobile input fields
function enforceNumericOnly(inputElement) {
  if (!inputElement) return;

  // 1. Clean value instantly if anything non-numeric gets through (e.g. pasting)
  inputElement.addEventListener('input', function () {
    this.value = this.value.replace(/[^0-9]/g, '');
  });

  // 2. Block non-numeric keypresses before they appear in the field
  inputElement.addEventListener('keydown', function (e) {
    // Allow navigation and editing control keys (Backspace, Tab, Enter, Escape, Delete, Arrows)
    var allowedKeys = [8, 9, 13, 27, 46, 37, 38, 39, 40];
    if (allowedKeys.indexOf(e.keyCode) !== -1 || (e.ctrlKey || e.metaKey)) {
      return;
    }

    // Prevent default if the pressed key is not a digit (0-9)
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  });
}

// Attach it to your phone input field(s) when the page loads
document.addEventListener('DOMContentLoaded', function () {
  var phoneInput = document.getElementById('regPhone');
  enforceNumericOnly(phoneInput);
});