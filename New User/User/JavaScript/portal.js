/* Bacolor Civil ID citizen portal; resident data is provided by the User API. */
(function () {
  'use strict';

  var SES = 'ncrs_user_token', activeResident = null;
  var REGISTRATION_DRAFT_KEY = 'ncrs_registration_draft';
  var DEMO_RESIDENTS_KEY = 'ncrs_demo_residents';
  var FAMILY_PROFILES_KEY = 'ncrs_family_profiles';
  var DEMO_PASSWORDS_KEY = 'ncrs_demo_passwords';
  var FAMILY_RELATIONSHIPS = ['Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Spouse', 'Parent', 'Child', 'Grandparent', 'Grandchild', 'Other relative'];
  var REG = [['CLB','Calibutbut'],['SIS','San Isidro'],['CBL','Cabalantian'],['CBT','Cabetican'],['MLW','Maliwalu'],['TNJ','Tinajero'],['SVT','San Vicente'],['MGL','Magliman'],['STB','Santa Barbara'],['STI','Santa Ines'],['SAN','San Antonio'],['MCB','Macabacle'],['PRL','Parulog'],['PTR','Potrero'],['DLR','Dolores'],['CBB','Cabambangan (Poblacion)'],['BLS','Balas'],['DUA','Duat'],['CON','Concepcion'],['MSL','Mesalipit'],['TLB','Talba']];
  var PAGES = { home: 'Homepage.html', citizenLookup: 'Login.html', citizenRegister: 'Register.html', citizenRegisterDetails: 'Registerpg2.html', citizenRegisterVerify: 'Registerpg3.html', citizenRegisterReview: 'Registerpg4.html', forgot: 'forgot.html', citizenCard: 'UserDashboard.html' };

  var app = document.getElementById('app');
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  /* ---------- theme (light / dark / device) ---------- */
  var THEME_KEY = 'ncrs_theme';
  function setTheme(choice) {
    var root = document.documentElement;
    if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice); else root.removeAttribute('data-theme');
    try { if (choice === 'light' || choice === 'dark') localStorage.setItem(THEME_KEY, choice); else localStorage.removeItem(THEME_KEY); } catch (e) {}
  }
  try { var savedTheme = localStorage.getItem(THEME_KEY); if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme); } catch (e) {}
  /* ---------- automatic capital letters ----------
     Every text box and text area turns what is typed into CAPITALS. Passwords (even while shown),
     email boxes, numbers, dates, files, and read-only boxes are left alone. */
  var CAPS_SKIP = { password: 1, email: 1, file: 1, number: 1, date: 1, checkbox: 1, radio: 1, hidden: 1, range: 1, color: 1, button: 1, submit: 1 };
  function wantsCaps(el) {
    if (!el || el.readOnly || el.disabled || el.hasAttribute('data-no-caps') || (el.closest && el.closest('.password-field'))) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return false;
    return !CAPS_SKIP[(el.getAttribute('type') || 'text').toLowerCase()];
  }
  document.addEventListener('input', function (event) {
    var el = event.target;
    if (!wantsCaps(el)) return;
    var upper = el.value.toUpperCase();
    if (el.value === upper) return;
    var start = el.selectionStart, end = el.selectionEnd;
    el.value = upper;
    try { el.setSelectionRange(start, end); } catch (e) {}
  }, true);
  /* Removes the paper background from a signature photo so only the ink remains (transparent PNG, white ink for the green card). */
  function transparentSignature(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(src);
      var img = new Image();
      img.onload = function () {
        try {
          var scale = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight)),
              w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale)),
              canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
          var data = ctx.getImageData(0, 0, w, h), px = data.data, lum = new Uint8Array(w * h), hist = new Uint32Array(256), n = 0, i;
          for (i = 0; i < px.length; i += 4) {
            var l = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
            lum[i / 4] = l;
            if (px[i + 3] > 128) { hist[l]++; n++; }
          }
          var acc = 0, bg = 255, target = n * 0.9;
          for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) { bg = i; break; } }
          var hi = Math.max(60, bg - 14), lo = Math.max(10, bg * 0.45);
          for (i = 0; i < px.length; i += 4) {
            var a = px[i + 3] < 128 ? 0 : Math.max(0, Math.min(1, (hi - lum[i / 4]) / (hi - lo)));
            px[i] = px[i + 1] = px[i + 2] = 255;
            px[i + 3] = Math.round(a * 255);
          }
          ctx.putImageData(data, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) { resolve(src); }
      };
      img.onerror = function () { resolve(src); };
      img.src = src;
    });
  }
  var regionName = function (c) { var r = REG.filter(function (x) { return x[0] === c; })[0]; return r ? r[1] : (c || '—'); };

  /* ---------- helpers ---------- */
  var digits = function (v) { return String(v || '').replace(/\D/g, ''); };
  // Contact = 11-digit mobile number or email. Mobile numbers are stored as 09XXXXXXXXX and shown as (+63)9XX-XXX-XXXX (the leading 0 is dropped after +63).
  function normPhone(v) {
    var s = String(v == null ? '' : v).trim();
    if (s.indexOf('@') !== -1) return s.toLowerCase();
    var d = digits(s);
    if (d.indexOf('63') === 0 && d.length === 13 && d.charAt(2) === '0') d = d.slice(2);
    else if (d.indexOf('63') === 0 && d.length === 12) d = '0' + d.slice(2);
    else if (d.length === 10 && d.charAt(0) === '9') d = '0' + d;   // the leading 0 is optional
    return d;
  }
  function fmtPhone(v) {
    var d = normPhone(v);
    if (d.indexOf('@') !== -1) return d;
    return /^09\d{9}$/.test(d) ? '(+63)' + d.slice(1, 4) + '-' + d.slice(4, 7) + '-' + d.slice(7) : d;
  }
  function fmtDate(v) { var d = new Date(v); return !v || isNaN(d) ? '—' : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }); }
  function ymd(v) { var d = new Date(v); return isNaN(d) ? '' : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function initials(n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(function (p) { return p[0] || ''; }).join('').toUpperCase(); }
  var safeImg = function (v) { return typeof v === 'string' && /^data:image\/(png|jpeg|jpg|webp|svg\+xml);/i.test(v) ? v : ''; };
  // Documents the resident still has to hand in. Only the Government ID can be added later
  // (the face photo and signature are required when registering).
  function missingDocs(r) { var out = []; if (!r || !safeImg(r.idPhoto)) out.push({ key: 'id', label: 'Government ID' }); return out; }
  var ID_TYPES = ['Philippine National ID (PhilID / PhilSys)', 'Philippine Passport', 'Driver’s License', 'UMID', 'SSS ID', 'GSIS ID', 'PRC ID', 'PhilHealth ID', 'Postal ID', 'Voter’s ID'];
  function idTypeOptions(placeholder) {
    return '<option value="">' + esc(placeholder) + '</option>' + ID_TYPES.map(function (name) { return '<option>' + esc(name) + '</option>'; }).join('') + '<option value="other">Other Philippine government-issued ID</option>';
  }

  function sessionId() {
    try { return sessionStorage.getItem(SES) || ''; } catch (e) { return ''; }
  }
  function setSession(token) {
    try { if (token) sessionStorage.setItem(SES, token); else sessionStorage.removeItem(SES); } catch (e) {}
  }
  function loadRegistrationDraft() {
    try { return JSON.parse(sessionStorage.getItem(REGISTRATION_DRAFT_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveRegistrationDraft(draft) {
    try {
      sessionStorage.setItem(REGISTRATION_DRAFT_KEY, JSON.stringify(draft));
      return true;
    } catch (e) {
      return false;
    }
  }
  function clearRegistrationDraft() {
    try { sessionStorage.removeItem(REGISTRATION_DRAFT_KEY); } catch (e) {}
  }
  function currentRecord() {
    return activeResident;
  }
  /* One-time clean-up: earlier builds stored a sample resident (BAC-2026-2000) and test accounts in this browser.
     The first time this version runs, all of that is cleared so the registry starts empty. */
  var DATA_VERSION_KEY = 'ncrs_data_version', DATA_VERSION = '2';
  try {
    if (localStorage.getItem(DATA_VERSION_KEY) !== DATA_VERSION) {
      localStorage.removeItem(DEMO_RESIDENTS_KEY);
      localStorage.removeItem(DEMO_PASSWORDS_KEY);
      localStorage.removeItem(FAMILY_PROFILES_KEY);
      try { sessionStorage.removeItem(SES); sessionStorage.removeItem(REGISTRATION_DRAFT_KEY); } catch (e) {}
      localStorage.setItem(DATA_VERSION_KEY, DATA_VERSION);
    }
  } catch (e) {}
  function demoResidents() {
    try {
      var raw = localStorage.getItem(DEMO_RESIDENTS_KEY);
      if (!raw) return [];
      var residents = JSON.parse(raw), migrated = false;
      residents.forEach(function (resident) {
        if (resident.verificationSource === 'government-id-upload') {
          resident.verified = false;
          resident.verificationSource = 'awaiting-admin-review';
          migrated = true;
        }
      });
      if (migrated) localStorage.setItem(DEMO_RESIDENTS_KEY, JSON.stringify(residents));
      return residents;
    } catch (e) {
      return [];
    }
  }
  // One user, one email / mobile number: no two login accounts may share the same contact.
  function assertContactAvailable(residents, contact) {
    var key = normPhone(contact);
    if (!key) return;
    var taken = residents.some(function (item) { return item.loginEnabled !== false && item.phone && normPhone(item.phone) === key; });
    if (taken) throw new Error(key.indexOf('@') !== -1
      ? 'This email is already registered to another account. Log in, or use a different email.'
      : 'This mobile number is already registered to another account. Log in, or use a different number.');
  }
  function storeResidents(residents) {
    try {
      localStorage.setItem(DEMO_RESIDENTS_KEY, JSON.stringify(residents));
      return true;
    } catch (e) {
      return false;
    }
  }
  function demoPasswords() {
    try {
      var raw = localStorage.getItem(DEMO_PASSWORDS_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }
  function setDemoPasswords(passwords) {
    try { localStorage.setItem(DEMO_PASSWORDS_KEY, JSON.stringify(passwords)); } catch (e) {}
  }
  function loadFamilyProfiles() {
    try { return JSON.parse(localStorage.getItem(FAMILY_PROFILES_KEY) || '[]'); } catch (e) { return []; }
  }
  function storeFamilyProfiles(profiles) {
    try {
      localStorage.setItem(FAMILY_PROFILES_KEY, JSON.stringify(profiles));
      return true;
    } catch (e) {
      return false;
    }
  }
  function storeFamilyData(residents, profiles, previousProfiles) {
    if (!storeFamilyProfiles(profiles)) return false;
    if (!storeResidents(residents)) {
      storeFamilyProfiles(previousProfiles);
      return false;
    }
    return true;
  }
  function normalizedFamilyName(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
  function localId(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function familyMember(profileId, residents, profiles) {
    var resident = residents.filter(function (item) { return item.id === profileId; })[0];
    if (resident) return resident;
    var profile = profiles.filter(function (item) { return item.id === profileId; })[0];
    if (profile && profile.residentId) {
      resident = residents.filter(function (item) { return item.id === profile.residentId; })[0];
      if (resident) return resident;
    }
    return profile || null;
  }
  function familyProfileIdForContact(contact, owner, residents, profiles) {
    if (contact.personId) {
      var selected = residents.filter(function (item) {
        return item.id === contact.personId && item.loginEnabled !== false;
      })[0];
      if (!selected || selected.id === owner.id) throw new Error('Select a valid registered family member.');
      return selected.id;
    }
    var name = String(contact.name || '').trim().replace(/\s+/g, ' '), phone = normPhone(contact.phone);
    if (name.length < 2) throw new Error('Enter the family member’s full name.');
    if (!/^09\d{9}$/.test(phone)) throw new Error('Enter a valid family member mobile number.');
    var matchingResidents = residents.filter(function (item) {
      return item.loginEnabled !== false && normalizedFamilyName(item.name) === normalizedFamilyName(name) &&
        normPhone(item.phone) === phone;
    });
    if (matchingResidents.length) {
      if (matchingResidents[0].id === owner.id) throw new Error('You cannot add yourself as a family member.');
      return matchingResidents[0].id;
    }
    var profile = profiles.filter(function (item) {
      return !item.residentId && normalizedFamilyName(item.name) === normalizedFamilyName(name) && normPhone(item.phone) === phone;
    })[0];
    if (!profile) {
      profile = { id: localId('FAM'), name: name, phone: fmtPhone(phone), createdAt: new Date().toISOString() };
      profiles.push(profile);
    }
    return profile.id;
  }
  function addFamilyRelation(owner, contact, residents, profiles) {
    var relationship = String(contact.relationship || '').trim();
    if (FAMILY_RELATIONSHIPS.indexOf(relationship) === -1) throw new Error('Select the family relationship.');
    var profileId = familyProfileIdForContact(contact, owner, residents, profiles);
    var relations = Array.isArray(owner.familyRelations) ? owner.familyRelations : (owner.familyRelations = []);
    var emergencyContacts = Array.isArray(owner.emergencyContacts) ? owner.emergencyContacts : (owner.emergencyContacts = []);
    var existing = relations.filter(function (item) { return item.profileId === profileId; })[0];
    if (existing) {
      if (existing.relationship !== relationship) {
        throw new Error('This person is already linked as ' + existing.relationship + '. Existing family relationships were not changed.');
      }
      var emergencyUpdated = contact.isEmergencyContact && emergencyContacts.indexOf(existing.id) === -1;
      if (emergencyUpdated) emergencyContacts.push(existing.id);
      return { relation: existing, created: false, emergencyUpdated: emergencyUpdated };
    }
    var relation = {
      id: localId('REL'),
      profileId: profileId,
      relationship: relationship,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    relations.push(relation);
    if (contact.isEmergencyContact) emergencyContacts.push(relation.id);
    return { relation: relation, created: true, emergencyUpdated: !!contact.isEmergencyContact };
  }
  function isBlankContact(c) {
    return !c || (!String(c.name || '').trim() && !String(c.phone || '').trim() && !c.relationship);
  }
  function familyRelationshipOptions(selected) {
    return '<option value="">Select relationship…</option>' + FAMILY_RELATIONSHIPS.map(function (relationship) {
      return '<option value="' + esc(relationship) + '"' + (selected === relationship ? ' selected' : '') + '>' + esc(relationship) + '</option>';
    }).join('');
  }
  function migrateLegacyEmergencyContacts(residents, profiles) {
    var changed = false;
    residents.forEach(function (owner) {
      var legacy = owner.emergencyContact;
      if (!legacy || !legacy.name || !legacy.relationship || !legacy.phone || Array.isArray(owner.familyRelations)) return;
      var name = String(legacy.name).trim().replace(/\s+/g, ' '), phone = normPhone(legacy.phone);
      var registered = residents.filter(function (item) {
        return item.id !== owner.id && item.loginEnabled !== false &&
          normalizedFamilyName(item.name) === normalizedFamilyName(name) && normPhone(item.phone) === phone;
      });
      var profileId;
      if (registered.length === 1) {
        profileId = registered[0].id;
      } else {
        var profile = profiles.filter(function (item) {
          return !item.residentId && normalizedFamilyName(item.name) === normalizedFamilyName(name) && normPhone(item.phone) === phone;
        })[0];
        if (!profile) {
          profile = { id: localId('FAM'), name: name, phone: fmtPhone(phone), createdAt: new Date().toISOString() };
          profiles.push(profile);
        }
        profileId = profile.id;
      }
      var relation = { id: localId('REL'), profileId: profileId, relationship: String(legacy.relationship), status: 'pending', createdAt: new Date().toISOString() };
      owner.familyRelations = [relation];
      owner.emergencyContacts = [relation.id];
      delete owner.emergencyContact;
      changed = true;
    });
    return changed;
  }
  function residentById(id) {
    var residents = demoResidents();
    return residents.filter(function (resident) { return resident.id === id; })[0] || null;
  }
  function residentByIdentifier(identifier) {
    var value = String(identifier || '').trim();
    if (!value) return null;
    var residents = demoResidents();
    var byId = residents.filter(function (resident) { return resident.id.toUpperCase() === value.toUpperCase(); })[0];
    if (byId) return byId;
    var contact = normPhone(value);
    if (!contact) return null;
    return residents.filter(function (resident) { return resident.phone && normPhone(resident.phone) === contact; })[0] || null;
  }
  function residentFromToken(token) {
    var value = String(token || '').trim();
    if (!value || value.indexOf('demo-') !== 0) return null;
    return residentById(value.slice(5));
  }
  async function api(path, options) {
    options = options || {};
    var token = sessionId();
    if (path === '/me') {
      var resident = residentFromToken(token) || activeResident;
      if (!resident) {
        var error = new Error('Your session has expired. Please log in again.');
        error.status = 401;
        throw error;
      }
      return { resident: resident };
    }
    if (path === '/logout') {
      setSession('');
      activeResident = null;
      return null;
    }
    if (path === '/login') {
      var body = options.body || {};
      var loginResident = residentByIdentifier(body.identifier);
      var passwords = demoPasswords();
      if (!loginResident) {
        throw new Error('No resident account matches that Civil ID, mobile number, or email.');
      }
      if (String(passwords[loginResident.id] || '') !== String(body.password || '')) {
        throw new Error('Incorrect password.');
      }
      var loginToken = 'demo-' + loginResident.id;
      setSession(loginToken);
      activeResident = loginResident;
      return { token: loginToken, resident: loginResident };
    }
    if (path === '/password-reset') {
      var resetBody = options.body || {};
      var resetResident = residentByIdentifier(resetBody.identifier);
      if (!resetResident || ymd(resetResident.dob) !== String(resetBody.dob || '')) {
        throw new Error('We could not match that account to the date of birth you entered.');
      }
      var resetPasswords = demoPasswords();
      resetPasswords[resetResident.id] = String(resetBody.password || '');
      setDemoPasswords(resetPasswords);
      return { ok: true };
    }
    if (path === '/register') {
      var registerBody = options.body || {};
      var resident = registerBody.resident || {};
      var residents = demoResidents();
      var profiles = loadFamilyProfiles();
      var previousProfiles = JSON.parse(JSON.stringify(profiles));
      migrateLegacyEmergencyContacts(residents, profiles);
      var contacts = Array.isArray(resident.familyContacts) ? resident.familyContacts : [];
      delete resident.familyContacts;
      assertContactAvailable(residents, resident.phone);
      var nextNumber = residents.reduce(function (max, item) { return Math.max(max, parseInt(String(item.id || '').split('-').pop(), 10) || 0); }, 999) + 1;
      var nextId = 'BAC-' + String(new Date().getFullYear()) + '-' + String(nextNumber).padStart(4, '0');
      resident.id = resident.id || nextId;
      var issueDate = new Date(resident.registeredAt || Date.now());
      resident.registeredAt = issueDate.toISOString();
      var expiryDate = new Date(issueDate);
      expiryDate.setUTCFullYear(expiryDate.getUTCFullYear() + 3);
      if (expiryDate.getUTCMonth() !== issueDate.getUTCMonth()) expiryDate.setUTCDate(0);
      resident.validUntil = expiryDate.toISOString().slice(0, 10);
      // A complete registration is verified automatically. If a document is missing, the account stays
      // unverified until the resident uploads it from the dashboard and the registry reviews it.
      var registrationComplete = !!(safeImg(resident.idPhoto) && resident.idType && safeImg(resident.facePhoto) && safeImg(resident.signaturePhoto));
      resident.verified = registrationComplete;
      resident.verificationSource = registrationComplete ? 'auto-verified' : 'missing-documents';
      resident.verifiedAt = registrationComplete ? new Date().toISOString() : '';
      resident.verifiedBy = registrationComplete ? 'Automatic check (complete registration)' : '';
      resident.loginEnabled = true;
      resident.familyRelations = [];
      resident.emergencyContacts = [];
      var matchingProfile = profiles.filter(function (profile) {
        return !profile.residentId && normalizedFamilyName(profile.name) === normalizedFamilyName(resident.name) &&
          normPhone(profile.phone) === normPhone(resident.phone);
      })[0];
      if (matchingProfile) matchingProfile.residentId = resident.id;
      residents.push(resident);
      contacts.forEach(function (contact) { addFamilyRelation(resident, contact, residents, profiles); });
      if (!storeFamilyData(residents, profiles, previousProfiles)) {
        throw new Error('Could not save registration and family relationships in this browser.');
      }
      var registerPasswords = demoPasswords();
      registerPasswords[resident.id] = String(registerBody.password || '');
      setDemoPasswords(registerPasswords);
      var token = 'demo-' + resident.id;
      setSession(token);
      activeResident = resident;
      return { token: token, resident: resident };
    }
    if (path === '/change-password') {
      var pwOwner = residentFromToken(token) || activeResident;
      if (!pwOwner) {
        var pwError = new Error('Your session has expired. Please log in again.');
        pwError.status = 401;
        throw pwError;
      }
      var pwBody = options.body || {}, pwStore = demoPasswords();
      if (String(pwStore[pwOwner.id] || '') !== String(pwBody.current || '')) throw new Error('Current password is incorrect.');
      pwStore[pwOwner.id] = String(pwBody.password || '');
      setDemoPasswords(pwStore);
      return { ok: true };
    }
    if (path === '/upload-document') {
      var docOwner = residentFromToken(token) || activeResident;
      if (!docOwner) {
        var docError = new Error('Your session has expired. Please log in again.');
        docError.status = 401;
        throw docError;
      }
      var docBody = options.body || {};
      if (!String(docBody.idType || '').trim()) throw new Error('Select your Government ID type.');
      if (!safeImg(docBody.idPhoto)) throw new Error('Choose a clear photo of your Government ID.');
      var docResidents = demoResidents();
      var docRecord = docResidents.filter(function (item) { return item.id === docOwner.id; })[0];
      if (!docRecord) throw new Error('Your resident profile could not be found.');
      docRecord.idType = String(docBody.idType).trim();
      docRecord.idPhoto = docBody.idPhoto;
      // A newly uploaded document goes to the registry for review.
      docRecord.verified = false;
      docRecord.verificationSource = 'awaiting-admin-review';
      docRecord.verifiedAt = '';
      docRecord.verifiedBy = '';
      docRecord.documentsSubmittedAt = new Date().toISOString();
      if (!storeResidents(docResidents)) throw new Error('Could not save your document in this browser. Try a smaller photo.');
      activeResident = docRecord;
      return { resident: docRecord };
    }
    if (path === '/contact-available') {
      assertContactAvailable(demoResidents(), (options.body || {}).phone);
      return { ok: true };
    }
    if (path === '/family') {
      var familyResidents = demoResidents(), familyProfiles = loadFamilyProfiles();
      var originalFamilyProfiles = JSON.parse(JSON.stringify(familyProfiles));
      if (migrateLegacyEmergencyContacts(familyResidents, familyProfiles)) {
        if (!storeFamilyData(familyResidents, familyProfiles, originalFamilyProfiles)) {
          throw new Error('Could not migrate existing family contacts in this browser.');
        }
      }
      return { residents: familyResidents, familyProfiles: familyProfiles };
    }
    if (path === '/family-relations') {
      var owner = residentFromToken(token) || activeResident;
      if (!owner) {
        var familyError = new Error('Your session has expired. Please log in again.');
        familyError.status = 401;
        throw familyError;
      }
      var owners = demoResidents(), profiles = loadFamilyProfiles();
      var originalProfiles = JSON.parse(JSON.stringify(profiles));
      var residentOwner = owners.filter(function (item) { return item.id === owner.id; })[0];
      if (!residentOwner) throw new Error('Your resident profile could not be found.');
      migrateLegacyEmergencyContacts(owners, profiles);
      var result = addFamilyRelation(residentOwner, options.body || {}, owners, profiles);
      if (!storeFamilyData(owners, profiles, originalProfiles)) {
        throw new Error('Could not save this family relationship in this browser.');
      }
      activeResident = residentOwner;
      var addedPerson = familyMember(result.relation.profileId, owners, profiles);
      var addedRegistered = !!(addedPerson && owners.some(function (item) { return item.id === addedPerson.id && item.loginEnabled !== false; }));
      return {
        resident: residentOwner,
        relation: result.relation,
        created: result.created,
        emergencyUpdated: result.emergencyUpdated,
        registered: addedRegistered
      };
    }
    throw new Error('The portal is running without the User API.');
  }
  async function initializeSession() {
    if (!sessionId()) return;
    try {
      var result = await api('/me');
      activeResident = result.resident;
    } catch (error) {
      if (error.status === 401) {
        setSession('');
        activeResident = null;
        return;
      }
      throw error;
    }
  }

  // Shrink uploaded photos before sending them to the User API.
  function readImage(file, max) {
    max = max || 640;
    return new Promise(function (resolve, reject) {
      if (!file) return resolve('');
      if (!/^image\//.test(file.type)) return reject(new Error('Please choose an image file.'));
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('Could not read that file.')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('That image could not be opened.')); };
        img.onload = function () {
          var s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
          var context = c.getContext('2d');
          context.fillStyle = '#fff';
          context.fillRect(0, 0, c.width, c.height);
          context.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.72));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function applySeal() {
    document.querySelectorAll('[data-seal]').forEach(function (i) { if (window.SEAL_SRC) i.src = window.SEAL_SRC; });
  }
  function msg(id, text, ok) { var e = $(id); if (e) { e.textContent = text || ''; e.className = ok ? 'ok' : 'error'; } }
  function bindPasswordToggles() {
    app.querySelectorAll('[data-password-target]').forEach(function (button) {
      button.onclick = function () {
        var input = $(button.getAttribute('data-password-target')), show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.textContent = show ? 'Hide' : 'Show';
        button.setAttribute('aria-label', (show ? 'Hide' : 'Show') + ' password');
        button.setAttribute('aria-pressed', show ? 'true' : 'false');
      };
    });
  }

  function registrationHelpAnswer(question) {
    var normalized = String(question || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var q = normalized.replace(/[^a-z0-9\s]/g, ' ');
    var tagalog = /\b(ano|paano|saan|alin|bakit|ako|ko|akin|aking|iyong|mo|ninyo|namin|natin|ang|ng|mga|ba|po|opo|ito|iyan|dito|diyan|kailangan|ilagay|piliin|pumili|kuha|kumuha|larawan|litrato|mukha|tirahan|bahay|kalye|barangay|telepono|cellphone|numero|password|lihim|kapanganakan|kaarawan|kasarian|pangalan|beripikado|aprubado|rehistro|magrehistro|magrehistro|pagpaparehistro)\b/.test(q);
    var answers = [
      [/government|govt|\bid\b|identification|document|upload|gobyerno|pagkakakilanlan|dokumento|i upload|i-upload|id larawan|id litrato/,
        'Your Government ID is optional when you register. If you have one, choose its type and use “Take Government ID photo” (or pick a file), with the full ID in frame and in good light. If you do not have it yet, skip it and upload it later from your dashboard under “Missing documents.” The portal does not check whether the ID is authentic.',
        'Opsyonal ang Government ID sa pagpaparehistro. Kung mayroon ka na, piliin ang uri nito at pindutin ang “Take Government ID photo” o pumili ng file. Kung wala pa, laktawan muna ito at i-upload sa dashboard sa ilalim ng “Missing documents.” Hindi sinusuri ng portal kung tunay ang ID.'],
      [/face|selfie|camera|photo of me|picture of me|mukha|sarili|selfie|kamera|larawan ko|litrato ko/,
        'Use “Take face photo” and follow the camera prompts. Center your face in good lighting, review the captured photo, then confirm it.',
        'Pindutin ang “Take face photo” at sundin ang mga tagubilin sa camera. Igitna ang iyong mukha sa maliwanag na lugar, tingnan muna ang kuha, at kumpirmahin kung maayos.'],
      [/barangay|village|community|nayon|pamayanan|baranggay/,
        'Choose the barangay where you currently live from the list. If you are unsure which barangay your address belongs to, check with your local barangay office.',
        'Piliin sa listahan ang barangay kung saan ka kasalukuyang nakatira. Kung hindi ka sigurado kung saang barangay kabilang ang iyong tirahan, magtanong sa barangay hall.'],
      [/address|street|house|reside|live|tirahan|bahay|kalye|daan|nakatira/,
        'Enter your house or unit number and street name, for example “12 Rizal St.” The portal adds the selected barangay and Bacolor to the saved address.',
        'Ilagay ang numero ng bahay o unit at pangalan ng kalye, halimbawa “12 Rizal St.” Awtomatikong idaragdag ng portal sa address ang napiling barangay at Bacolor.'],
      [/phone|mobile|number|otp|code|sms|text message|telepono|cellphone|numero|text|kodigo|code/,
        'Enter your own active mobile number in the 09… format.',
        'Ilagay ang sarili mong aktibong mobile number sa format na 09….'],
      [/password|passcode|login|log in|account|lihim|pag log in|mag login|mag log in|account ko/,
        'Choose a password with at least 8 characters and enter the same password in Confirm password. Keep it private; do not send your password in this chat.',
        'Gumawa ng password na may hindi bababa sa 8 karakter at ilagay ang parehong password sa Confirm password. Panatilihin itong sikreto at huwag ipadala rito sa chat.'],
      [/birth|dob|birthday|date|kapanganakan|kaarawan|petsa|ipinanganak/,
        'Enter your date of birth as it appears on your official records. Use the date picker, and make sure it is not a future date.',
        'Ilagay ang petsa ng kapanganakan ayon sa iyong opisyal na dokumento. Gamitin ang date picker at tiyaking hindi ito petsa sa hinaharap.'],
      [/sex|gender|kasarian|babae|lalaki/,
        'Select the option that matches your official records.',
        'Piliin ang opsyong tumutugma sa iyong opisyal na dokumento.'],
      [/name|full name|pangalan|buong pangalan/,
        'Enter your full legal name as it appears on your Government ID. Include your first name, middle name if applicable, and surname.',
        'Ilagay ang buong legal na pangalan ayon sa iyong Government ID. Isama ang first name, middle name kung mayroon, at apelyido.'],
      [/verify|verified|approved|approval|status|beripikado|naaprubahan|aprubado|katayuan|beripikasyon/,
        'A registration that is complete, including a Government ID photo, is verified automatically. If a document such as the Government ID is missing, the registry reviews your account after you upload it from your dashboard. The portal does not check whether the ID is authentic.',
        'Awtomatikong maberipika ang kumpletong rehistro, kasama ang larawan ng Government ID. Kung may kulang na dokumento, susuriin ng registry ang account mo pagkatapos mong i-upload ito sa dashboard. Hindi sinusuri ng portal kung tunay ang ID.']
    ];
    for (var i = 0; i < answers.length; i++) {
      if (answers[i][0].test(q)) return tagalog ? answers[i][2] : answers[i][1];
    }
    return tagalog
      ? 'Makakatulong ako tungkol sa pangalan, kasarian, petsa ng kapanganakan, barangay, tirahan, mobile number, password, Government ID, o face photo. Aling bahagi ng rehistro ang gusto mong itanong? Huwag magpadala rito ng personal na detalye, password, o code.'
      : 'I can help with full name, sex, date of birth, barangay, address, mobile/code, password, Government ID photo, or face photo. Which registration field are you asking about? Please do not send personal details, passwords, or codes.';
  }

  function initRegistrationHelp() {
    var widget = document.createElement('section');
    widget.className = 'registration-chat';
    widget.innerHTML = '<button class="registration-chat-launcher" id="registrationChatToggle" type="button" aria-expanded="false" aria-controls="registrationChatPanel">Registration help</button>' +
      '<div class="registration-chat-panel" id="registrationChatPanel" aria-label="Registration help chatbot" hidden>' +
      '<div class="registration-chat-header"><div><strong>Registration help</strong><span>Ask what to enter in a field</span></div><button class="registration-chat-close" id="registrationChatClose" type="button" aria-label="Close registration help">×</button></div>' +
      '<div class="registration-chat-messages" id="registrationChatMessages" role="log" aria-live="polite" aria-relevant="additions text">' +
      '<p class="registration-chat-message bot">Hi! I can explain the registration fields in English or Tagalog. Please do not share personal details, passwords, or codes here.<br><br>Kumusta! Maipapaliwanag ko ang mga bahagi ng rehistro sa English o Tagalog. Huwag magbahagi rito ng personal na detalye, password, o code.</p></div>' +
      '<div class="registration-chat-suggestions" aria-label="Suggested questions">' +
      '<button type="button">What goes in my address?</button><button type="button">How do I take a face photo?</button><button type="button">What is the ID photo for?</button></div>' +
      '<form class="registration-chat-form" id="registrationChatForm"><label class="sr-only" for="registrationChatInput">Ask a registration question</label>' +
      '<input id="registrationChatInput" type="text" maxlength="240" autocomplete="off" placeholder="Ask in English or Tagalog… / Magtanong sa English o Tagalog…">' +
      '<button type="submit">Ask</button></form></div>';
    document.body.appendChild(widget);

    var toggle = $('registrationChatToggle');
    var panel = $('registrationChatPanel');
    var input = $('registrationChatInput');
    var messages = $('registrationChatMessages');
    function setOpen(open) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) input.focus();
      else toggle.focus();
    }
    function addMessage(text, kind) {
      var message = document.createElement('p');
      message.className = 'registration-chat-message ' + kind;
      message.textContent = text;
      messages.appendChild(message);
      messages.scrollTop = messages.scrollHeight;
    }
    function submitQuestion(question) {
      var text = question.trim();
      if (!text) return;
      addMessage(text, 'user');
      addMessage(registrationHelpAnswer(text), 'bot');
      input.value = '';
      input.focus();
    }

    toggle.addEventListener('click', function () { setOpen(panel.hidden); });
    $('registrationChatClose').addEventListener('click', function () { setOpen(false); });
    $('registrationChatForm').addEventListener('submit', function (event) {
      event.preventDefault();
      submitQuestion(input.value);
    });
    widget.querySelectorAll('.registration-chat-suggestions button').forEach(function (button) {
      button.addEventListener('click', function () { submitQuestion(button.textContent); });
    });
  }

  /* ---------- global functions used by the HTML buttons ---------- */
  window.setView = function (v) { location.href = PAGES[v] || 'index.html'; };
  window.logout = async function () {
    try {
      if (sessionId()) await api('/logout', { method: 'POST' });
    } catch (error) {
      if (error.status !== 401) console.error('Could not revoke the User API session:', error);
    }
    activeResident = null;
    setSession('');
    location.href = PAGES.home;
  };

  /* ---------- views ---------- */
  function viewHome() {
    var me = currentRecord();
    if (me) {
      app.innerHTML = '<section class="portal-returning"><div class="portal-returning-copy"><span class="portal-eyebrow">YOUR RESIDENT ACCOUNT</span><h1>Welcome back, ' + esc(me.name.split(/\s+/)[0]) + '.</h1>' +
        '<p>Your Bacolor resident profile and digital ID are ready to view.</p><div class="portal-returning-id"><span>CIVIL ID NUMBER</span><b>' + esc(me.id) + '</b></div>' +
        '<div class="actions"><button class="btn brass" onclick="setView(\'citizenCard\')">Open my dashboard <span aria-hidden="true">→</span></button><button class="btn secondary" onclick="logout()">Log out</button></div></div>' +
        '<div class="portal-returning-seal"><img src="' + esc(window.SEAL_SRC || 'BacolorLogo-removebg-preview.png') + '" alt=""><span>Municipality of Bacolor<br>Pampanga</span></div></section>';
      return;
    }
    app.innerHTML = '<div class="portal-home"><section class="portal-hero"><div class="portal-hero-copy">' +
      '<span class="portal-eyebrow"><i></i> DIGITAL RESIDENT SERVICES</span>' +
      '<h1>Your Bacolor ID.<br><em>Always within reach.</em></h1>' +
      '<p class="portal-intro">A simple way to view your resident information, Civil ID, and family connections in one place.</p>' +
      '<div class="portal-hero-actions"><button class="btn brass" onclick="setView(\'citizenRegister\')">Create your account <span aria-hidden="true">→</span></button><button class="btn secondary" onclick="setView(\'citizenLookup\')">Sign in</button></div>' +
      '<div class="portal-assurance"><span class="portal-check" aria-hidden="true">✓</span><span>For residents of Bacolor, Pampanga</span></div></div>' +
      '<div class="portal-id-preview" aria-label="Preview of the Bacolor Civil ID design"><div class="preview-orbit"></div><div class="preview-card">' +
      '<div class="preview-head"><img src="' + esc(window.SEAL_SRC || 'BacolorLogo-removebg-preview.png') + '" alt=""><div><b>BACOLOR CIVIL ID</b><span>MUNICIPALITY OF BACOLOR</span></div><span class="preview-chip" aria-hidden="true">ID</span></div>' +
      '<div class="preview-person"><div class="preview-avatar" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="17" r="9"></circle><path d="M7 43c1-10 7-16 17-16s16 6 17 16"></path></svg></div><div><span>RESIDENT NAME</span><b>Your name here</b><span class="preview-id">BAC-20XX-0000</span></div></div>' +
      '<div class="preview-stripe"></div></div><div class="preview-caption"><span class="preview-caption-dot"></span>YOUR DIGITAL ID, IN ONE PLACE</div></div></section>' +
      '<section class="portal-benefits" aria-label="Resident portal features"><article class="portal-benefit"><span class="benefit-number">01</span><div><h2>Your information</h2><p>Keep your registered details easy to view.</p></div><span class="benefit-arrow" aria-hidden="true">↗</span></article>' +
      '<article class="portal-benefit"><span class="benefit-number">02</span><div><h2>Your Civil ID</h2><p>See the front and back of your digital card.</p></div><span class="benefit-arrow" aria-hidden="true">↗</span></article>' +
      '<article class="portal-benefit"><span class="benefit-number">03</span><div><h2>Your family tree</h2><p>View family connections linked to your record.</p></div><span class="benefit-arrow" aria-hidden="true">↗</span></article></section>' +
      '<footer class="portal-home-footer"><span>BUILT FOR THE PEOPLE OF BACOLOR</span><span>Municipality of Bacolor <i>·</i> Pampanga</span></footer></div>';
  }

  function badge(r) {
    if (r.verified === true) {
      return '<span class="verify-badge ok">' + (r.verificationSource === 'auto-verified' ? 'Verified' : 'Verified by registry') + '</span>';
    }
    if (missingDocs(r).length) return '<span class="verify-badge review">Missing documents</span>';
    return '<span class="verify-badge review">Awaiting Review</span>';
  }

  function viewLogin() {
    if (currentRecord()) { location.replace(PAGES.citizenCard); return; }
    app.innerHTML = '<div class="card"><h2>Log in</h2><p class="sub">Use your Civil ID number, mobile number, or email.</p>' +
      '<label for="lid">Civil ID, mobile number, or email</label><input id="lid" autocomplete="username" placeholder="BAC-2026-1000, 09171234567, or name@email.com">' +
      '<label for="lpw">Password</label><div class="password-field"><input id="lpw" type="password" autocomplete="current-password"><button type="button" class="password-toggle" data-password-target="lpw" aria-label="Show password" aria-pressed="false">Show</button></div>' +
      '<div id="lmsg" class="error" role="alert"></div>' +
      '<div class="actions"><button class="btn brass" id="lgo">Log in</button><button class="btn secondary" onclick="setView(\'home\')">Cancel</button></div>' +
      '<div class="linkrow"><a href="forgot.html">Forgot password?</a><a href="Register.html">Create an account</a></div></div>';
    bindPasswordToggles();
    async function go() {
      $('lgo').disabled = true;
      try {
        var result = await api('/login', { method: 'POST', body: { identifier: $('lid').value, password: $('lpw').value } });
        setSession(result.token);
        activeResident = result.resident;
        location.href = PAGES.citizenCard;
      } catch (error) {
        msg('lmsg', error.message);
        $('lgo').disabled = false;
      }
    }
    $('lgo').onclick = go;
    $('lpw').onkeydown = function (e) { if (e.key === 'Enter') go(); };
    $('lid').onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }

  function viewForgot() {
    app.innerHTML = '<div class="card"><h2>Reset password</h2><p class="sub">Confirm who you are with your date of birth, then choose a new password.</p>' +
      '<label for="fid">Civil ID, mobile number, or email</label><input id="fid">' +
      '<label for="fdob">Date of birth</label><input id="fdob" inputmode="numeric" maxlength="10" placeholder="MM/DD/YYYY">' +
      '<div class="grid2"><div><label for="fpw">New password</label><div class="password-field"><input id="fpw" type="password" autocomplete="new-password"><button type="button" class="password-toggle" data-password-target="fpw" aria-label="Show password" aria-pressed="false">Show</button></div></div><div><label for="fpw2">Confirm password</label><div class="password-field"><input id="fpw2" type="password" autocomplete="new-password"><button type="button" class="password-toggle" data-password-target="fpw2" aria-label="Show password" aria-pressed="false">Show</button></div></div></div>' +
      '<div id="fmsg" class="error" role="alert"></div>' +
      '<div class="actions"><button class="btn brass" id="fgo">Reset password</button><button class="btn secondary" onclick="setView(\'citizenLookup\')">Back to log in</button></div></div>';
    bindPasswordToggles();
    $('fdob').addEventListener('input', function () { this.value = maskDob(this.value); });
    $('fgo').onclick = async function () {
      var identifier = $('fid').value, dob = dobToYmd($('fdob').value), pw = $('fpw').value;
      if (!identifier || !dob) return msg('fmsg', 'Enter your Civil ID, mobile number, or email, and your date of birth as MM/DD/YYYY.');
      if (pw.length < 8) return msg('fmsg', 'Password must be at least 8 characters.');
      if (pw !== $('fpw2').value) return msg('fmsg', 'Passwords do not match.');
      $('fgo').disabled = true;
      try {
        await api('/password-reset', { method: 'POST', body: { identifier: identifier, dob: dob, password: pw } });
        msg('fmsg', 'Password updated. Redirecting to log in…', true);
        setTimeout(function () { location.href = PAGES.citizenLookup; }, 1200);
      } catch (error) {
        msg('fmsg', error.message);
        $('fgo').disabled = false;
      }
    };
  }

  /* ---------- registration (3 pages) ----------
     Page 1  Register.html     resident information
     Page 2  Registerpg2.html  ID details, Government ID type, family members
     Page 3  Registerpg3.html  verification of ID (ID photo, face photo, signature) + password */
  var REQ = '<span class="req" aria-hidden="true">*</span>';

  function maskDob(v) {
    var d = String(v || '').replace(/\D/g, '').slice(0, 8), out = d.slice(0, 2);
    if (d.length > 2) out += '/' + d.slice(2, 4);
    if (d.length > 4) out += '/' + d.slice(4);
    return out;
  }
  // Accepts MM/DD/YYYY (any year) or YYYY-MM-DD; returns YYYY-MM-DD or '' when it is not a real date.
  function dobToYmd(raw) {
    var s = String(raw || '').trim(), m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s), y, mo, d;
    if (m) { mo = +m[1]; d = +m[2]; y = +m[3]; }
    else if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else return '';
    if (y < 1) return '';
    var t = new Date(Date.UTC(2000, 0, 1, 12)); t.setUTCFullYear(y, mo - 1, d);
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return '';
    return String(y).padStart(4, '0') + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function dobToDisplay(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
    return m ? m[2] + '/' + m[3] + '/' + m[1] : String(v || '');
  }
  // Live mask: emails pass through untouched; anything that starts with a digit becomes (+63)0000-000-0000.
  function maskContact(v) {
    var s = String(v || '');
    if (/[@a-z]/i.test(s)) return s;
    var d = digits(s), stripped = false;
    // Philippine mobile numbers never start with 63 once the leading 0 is dropped, so 63 is always the country code.
    while (d.indexOf('63') === 0) { d = d.slice(2); stripped = true; }
    if (d.charAt(0) === '0') d = d.slice(1);   // the 0 is dropped because the number already starts with (+63)
    d = d.slice(0, 10);
    if (!d) {
      var compact = s.replace(/\s/g, '');
      if (compact === '(+63)' || compact === '(+63' || compact === '(+6') return '';   // lets Backspace clear the prefix
      return (stripped || compact === '+') ? '(+63)' : '';
    }
    var out = '(+63)' + d.slice(0, 3);
    if (d.length > 3) out += '-' + d.slice(3, 6);
    if (d.length > 6) out += '-' + d.slice(6, 10);
    return out;
  }
  function setContactMode(input, mode) {
    input.type = mode === 'email' ? 'email' : 'tel';
    input.setAttribute('inputmode', mode === 'email' ? 'email' : 'numeric');
    input.placeholder = mode === 'email' ? 'name@email.com' : '(+63)917-123-4567';
  }
  function maskByMode(v, mode) {
    return mode === 'email' ? String(v || '').replace(/\s/g, '') : maskContact(String(v || '').replace(/[^\d+()\-\s]/g, ''));
  }
  // A house number written with # (e.g. "#12" or "#12 Rizal St.") is enough; otherwise a street name of 3+ characters is needed.
  function validAddress(a) { return /#\s*[0-9A-Za-z][0-9A-Za-z-]*/.test(a) || a.length >= 3; }
  function isContact(v) {
    return /^09\d{9}$/.test(v) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }
  var CONTACT_ERROR = 'Enter a valid mobile number, like (+63)917-123-4567, or an email address with @.';

  function viewRegister() {
    if (currentRecord()) { location.replace(PAGES.citizenCard); return; }
    var page = document.body.dataset.view === 'citizenRegisterDetails' ? 2 :
      document.body.dataset.view === 'citizenRegisterVerify' ? 3 :
      document.body.dataset.view === 'citizenRegisterReview' ? 4 : 1;
    var today = new Date().toISOString().slice(0, 10), draft = loadRegistrationDraft();
    var photos = draft.photos || { id: '', idType: '', confirmedIdType: '', face: '', signature: '' };
    var registrationContacts = Array.isArray(draft.familyContacts) ? draft.familyContacts : [];

    function regNotice(pageNo) {
      var notes = {
        1: ['Please enter correct information only',
            ['Your name, date of birth, barangay and address must be <b>true and exactly as written on your government ID</b>.',
             'Use your own mobile number or email. One number or email can only be used for one account.',
             ]],
        2: ['Double-check your details',
            ['Enter your real height, weight and nationality.',
             'Family member / emergency contact is optional. If you add one, use the person\u2019s <b>real full name and correct mobile number</b>, because this is who may be contacted in an emergency.',
             'A family member only appears in your family tree after they register their own account using the same name and number.']],
        3: ['Last step: photos and password',
            ['Government ID is <b>optional for now</b>. If you have a valid ID, choose its type and upload a clear photo of it (all four corners and the text readable). If you do not have one yet, skip it and upload it later from your dashboard under <b>Missing documents</b>.',
             'Face photo: take a recent, clear photo of yourself, facing the camera, with no filters, mask, cap or sunglasses.',
             'Signature: sign on plain white paper and upload a clear photo of it.',
             'A complete registration (ID, face photo and signature) is verified automatically. If the Government ID is missing, the registry reviews your account after you upload it.',
             'Make sure all details from the previous pages are correct before you continue to the review page. Keep your password private.']],
        4: ['Final check: make sure everything is correct',
            ['Read every detail below carefully. Your name, date of birth, address and contact must match your government ID.',
             'If something is wrong, press <b>Edit</b> on that section to go back and fix it. Your answers are kept.',
             'Once you submit, you cannot edit these details yourself. Corrections must go through the Bacolor Population Registry.']]
      };
      var n = notes[pageNo];
      return '<div class="reg-notice" role="note"><div class="reg-notice-title"><span aria-hidden="true">\u26A0</span> ' + n[0] + '</div><ul>' +
        n[1].map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>';
    }
    var pageOne = regNotice(1) + '<p class="req-note">' + REQ + ' Required</p>' +
      '<label for="rname">Full name ' + REQ + '</label><input id="rname" autocomplete="name" placeholder="JUAN DELA CRUZ">' +
      '<div class="grid2"><div><label for="rsex">Sex ' + REQ + '</label><select id="rsex"><option value="">Select…</option><option>Female</option><option>Male</option></select></div>' +
      '<div><label for="rdob">Date of birth ' + REQ + '</label><input id="rdob" inputmode="numeric" autocomplete="bday" maxlength="10" placeholder="MM/DD/YYYY"></div></div>' +
      '<label for="rbrgy">Barangay ' + REQ + '</label><select id="rbrgy"><option value="">Select…</option>' + REG.map(function (r) { return '<option value="' + r[0] + '">' + esc(r[1]) + '</option>'; }).join('') + '</select>' +
      '<label for="raddr">House number / street ' + REQ + '</label><input id="raddr" autocomplete="street-address" placeholder="#12 RIZAL ST. or #12">' +
      '<div class="help">Start a house number with #, like #12. A street name is optional when you use #.</div>' +
      '<label for="rcontacttype">Register with ' + REQ + '</label><select id="rcontacttype"><option value="mobile">Mobile number</option><option value="email">Email</option></select>' +
      '<label for="rphone" id="rphonelabel">Mobile number ' + REQ + '</label><input id="rphone" autocomplete="username">' +
      '<div class="help" id="rphonehelp"></div>' +
      '<div id="rmsg" class="error" role="alert"></div>' +
      '<div class="actions"><button type="button" class="btn brass" id="rnext">Next</button><button type="button" class="btn secondary" onclick="setView(\'home\')">Cancel</button></div>' +
      '<div class="linkrow"><span>Already registered?</span><a href="Login.html">Log in</a></div>';

    var pageTwo = regNotice(2) + '<p class="req-note">' + REQ + ' Required</p>' +
      '<div class="grid2"><div><label for="rheight">Height (cm) ' + REQ + '</label><input id="rheight" type="number" min="50" max="250" step="1" placeholder="e.g. 165"></div>' +
      '<div><label for="rweight">Weight (kg) ' + REQ + '</label><input id="rweight" type="number" min="2" max="500" step="0.1" placeholder="e.g. 60"></div></div>' +
      '<div class="grid2"><div><label for="rnationality">Nationality ' + REQ + '</label><input id="rnationality" autocomplete="country-name" placeholder="e.g. Filipino"></div>' +
      '<div><label for="rocupation">Occupation</label><input id="rocupation" autocomplete="organization-title" placeholder="Occupation"></div></div>' +
      '<div class="grid2"><div><label for="rstatus">Civil status</label><select id="rstatus"><option value="">Select…</option><option>Single</option><option>Married</option><option>Widowed</option><option>Divorced</option><option>Separated</option></select></div>' +
      '<div><label for="rblood">Blood type</label><select id="rblood"><option value="">Select…</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option><option>Unknown</option></select></div></div>' +
      '<div class="registration-section-heading">Emergency contact / family member (optional)</div>' +
      '<div class="help">Optional. Anyone you list here is saved as an emergency contact only. They appear in your family tree once they register their own account.</div>' +
      '<div id="rcontacts"></div><button type="button" class="btn secondary" id="raddcontact">Add a family member</button>' +
      '<div id="rmsg" class="error" role="alert"></div>' +
      '<div class="actions"><button type="button" class="btn secondary" id="rback">Back</button><button type="button" class="btn brass" id="rnext">Next</button></div>';

    var pageThree = regNotice(3) + '<p class="req-note">' + REQ + ' Required</p>' +
      '<label for="ridtype">Type of Philippine Government ID (optional)</label><select id="ridtype"><option value="">Skip for now — I’ll upload it later</option><option>Philippine National ID (PhilID / PhilSys)</option><option>Philippine Passport</option><option>Driver’s License</option><option>UMID</option><option>SSS ID</option><option>GSIS ID</option><option>PRC ID</option><option>PhilHealth ID</option><option>Postal ID</option><option>Voter’s ID</option><option value="other">Other Philippine government-issued ID</option></select>' +
      '<div id="ridtypeotherwrap" hidden><label for="ridtypeother">Specify the ID type ' + REQ + '</label><input id="ridtypeother" maxlength="80" autocomplete="off"></div>' +
      '<div class="help">Optional. Choose the ID you will photograph below, or skip it and upload it later from your dashboard (Missing documents). Civil ID expiry is set automatically to three years from the issue date.</div>' +
      '<label for="ridupload">Government ID photo (optional)</label><div class="id-photo-box" id="ridbox"><img id="ridprev" alt="Your confirmed Government ID photo"><span id="ridplaceholder">Your confirmed Government ID photo will appear here</span></div>' +
      '<div class="camera-actions"><input id="ridupload" type="file" accept="image/*" aria-label="Choose Government ID photo"><button type="button" class="btn secondary" id="ridstart">Take Government ID photo</button><button type="button" class="btn link" id="ridreset" hidden>Reset</button></div>' +
      '<label for="rfaceupload">Face photo (clear, front-facing) ' + REQ + '</label><div class="face-photo-box" id="rfacebox"><img id="rfaceprev" alt="Your confirmed face photo"><span id="rfaceplaceholder">Your confirmed face photo will appear here</span></div>' +
      '<div class="camera-actions"><input id="rfaceupload" type="file" accept="image/*" aria-label="Choose face photo"><button type="button" class="btn secondary" id="rstart">Take face photo</button><button type="button" class="btn link" id="rfacereset" hidden>Reset</button></div>' +
      '<label for="rsignature">Your signature ' + REQ + '</label><div class="signature-upload"><input id="rsignature" type="file" accept="image/png,image/jpeg,image/webp"><div class="signature-preview" id="rsignaturebox"><img id="rsignatureprev" alt="Preview of your signature"><span id="rsignatureplaceholder">Upload a clear image of your signature</span></div></div>' +
      '<div class="camera-actions"><button type="button" class="btn link" id="rsignaturereset" hidden>Reset</button></div>' +
      '<div class="help">Sign on plain white paper and upload a clear photo. It will appear below your photo on the Civil ID.</div>' +
      '<div class="registration-section-heading">Create your password</div>' +
      '<div class="grid2"><div><label for="rpw">Password ' + REQ + '</label><div class="password-field"><input id="rpw" type="password" autocomplete="new-password"><button type="button" class="password-toggle" data-password-target="rpw" aria-label="Show password" aria-pressed="false">Show</button></div></div>' +
      '<div><label for="rpw2">Confirm password ' + REQ + '</label><div class="password-field"><input id="rpw2" type="password" autocomplete="new-password"><button type="button" class="password-toggle" data-password-target="rpw2" aria-label="Show password" aria-pressed="false">Show</button></div></div></div>' +
      '<div class="help">At least 8 characters.</div>' +
      '<div id="rmsg" class="error" role="alert"></div>' +
      '<div class="actions"><button type="button" class="btn secondary" id="rback">Back</button><button type="button" class="btn brass" id="rgo">Review information</button></div>';

    var titles = ['Register for a Civil ID', 'ID details', 'Verify your ID', 'Review your information'];
    var pageFour = page === 4 ? buildReviewPage() : '';
    var subs = [
      'Enter your resident information to get started. Your details will be saved while you continue to the next page.',
      'Add your physical details and, if you wish, an emergency contact.',
      'Add clear photos of your face and signature, and your Government ID if you have one, then set your password. You will review everything on the next page before submitting.',
      'Check that every detail below is correct. Use Edit to fix anything, then submit your registration. A complete registration is verified automatically; if a document is missing, the registry reviews your account once you upload it.'
    ];
    app.innerHTML = '<div class="card"><div class="step-indicator" aria-label="Step ' + page + ' of 4">Step ' + page + ' of 4</div><h2>' + titles[page - 1] + '</h2><p class="sub">' + subs[page - 1] + '</p>' +
      [pageOne, pageTwo, pageThree, pageFour][page - 1] + '</div>' +
      (page === 3 ? '<div class="camera-portal" id="rcameraportal" role="dialog" aria-modal="true" aria-labelledby="rcameratitle" hidden>' +
      '<div class="camera-portal-card"><div class="camera-portal-header"><div><div class="kicker" id="rcamerakicker">FACE PHOTO</div><h2 id="rcameratitle">Take your photo</h2></div><button type="button" class="camera-close" id="rcancel" aria-label="Close camera">×</button></div>' +
      '<p class="camera-instructions" id="rcamerainstructions">Center your face in the frame, then take a photo to review it.</p>' +
      '<div class="camera-stage"><video id="rfacevideo" autoplay muted playsinline hidden></video><img id="rfacecandidate" alt="Photo for review" hidden><div id="rcameraloading">Camera preview will appear here</div></div>' +
      '<div id="rcammsg" class="camera-status" role="status" aria-live="polite"></div>' +
      '<div class="camera-actions"><button type="button" class="btn brass" id="rcapture" hidden>Take photo</button><button type="button" class="btn secondary" id="rretake" hidden>Retake</button><button type="button" class="btn secondary" id="rconfirm" hidden>Confirm photo</button><button type="button" class="btn secondary" id="rcancelaction">Back to form</button></div>' +
      '</div></div>' : '');

    /* ----- family members (page 2) ----- */
    function collectRegistrationContacts() {
      if (page !== 2) return registrationContacts;
      return Array.prototype.map.call(app.querySelectorAll('[data-registration-contact]'), function (row) {
        return {
          personId: '',
          name: row.querySelector('[data-family-name]').value.trim().replace(/\s+/g, ' '),
          phone: normPhone(row.querySelector('[data-family-phone]').value),
          relationship: row.querySelector('[data-family-relationship]').value,
          isEmergencyContact: true
        };
      });
    }
    function renderRegistrationContacts() {
      $('rcontacts').innerHTML = registrationContacts.map(function (contact, index) {
        return '<div class="family-contact-entry" data-registration-contact><div class="family-contact-heading"><b>Family member ' + (index + 1) + '</b>' +
          '<button type="button" class="btn link" data-remove-contact="' + index + '">Remove</button>' + '</div>' +
          '<label for="rcontactname' + index + '">Full name ' + REQ + '</label><input id="rcontactname' + index + '" data-family-name autocomplete="off" value="' + esc(contact.name || '') + '">' +
          '<label for="rcontactphone' + index + '">Mobile number ' + REQ + '</label><input id="rcontactphone' + index + '" data-family-phone type="tel" inputmode="numeric" autocomplete="off" placeholder="(+63)917-123-4567" value="' + esc(/^09\d{9}$/.test(contact.phone || '') ? fmtPhone(contact.phone) : '') + '">' +
          '<label for="rcontactrelationship' + index + '">Family relationship ' + REQ + '</label><select id="rcontactrelationship' + index + '" data-family-relationship>' +
          familyRelationshipOptions(contact.relationship) + '</select></div>';
      }).join('');
      $('rcontacts').querySelectorAll('[data-remove-contact]').forEach(function (button) {
        button.onclick = function () {
          registrationContacts = collectRegistrationContacts();
          registrationContacts.splice(Number(button.getAttribute('data-remove-contact')), 1);
          renderRegistrationContacts();
          saveDraft();
        };
      });
    }

    /* ----- collect + validate the whole registration (used by step 3 and step 4) ----- */
    function collectRegistration() {
      var fields = draft.fields || {};
      var name = String(fields.rname || '').trim().replace(/\s+/g, ' '), sex = fields.rsex || '', dob = dobToYmd(fields.rdob), region = fields.rbrgy || '',
          address = String(fields.raddr || '').trim(), contact = normPhone(fields.rphone || ''), password = String(draft.pw || ''),
          height = Number(fields.rheight), weight = Number(fields.rweight), nationality = String(fields.rnationality || '').trim().replace(/\s+/g, ' '),
          occupation = String(fields.rocupation || '').trim().replace(/\s+/g, ' '), civilStatus = fields.rstatus || '', bloodType = fields.rblood || '',
          familyContacts = (Array.isArray(draft.familyContacts) ? draft.familyContacts : []).filter(function (c) { return !isBlankContact(c); });
      var fail = function (pg, text) { return { error: text, page: pg }; };
      if (name.length < 3 || !sex || !dob || dob > today || !region || !validAddress(address) || !isContact(contact)) return fail(1, 'Your resident information on the first page is incomplete or invalid.');
      if (!Number.isFinite(height) || height < 50 || height > 250 || !Number.isFinite(weight) || weight < 2 || weight > 500) return fail(2, 'Check your height and weight on the second page.');
      if (nationality.length < 2) return fail(2, 'Enter your nationality on the second page.');
      for (var i = 0; i < familyContacts.length; i++) {
        var fc = familyContacts[i];
        if (!fc.relationship || String(fc.name || '').length < 2 || !/^09\d{9}$/.test(fc.phone)) return fail(2, 'Complete every family member on the second page, or remove the incomplete one.');
      }
      var hasIdPhoto = !!(photos.idType && photos.id && photos.confirmedIdType === photos.idType);
      if (photos.idType && !hasIdPhoto) return fail(3, 'Add a photo of your ' + photos.idType + ' on the third page, or choose “Skip for now” for the ID type.');
      if (!photos.face) return fail(3, 'Add a face photo on the third page.');
      if (!photos.signature) return fail(3, 'Upload a clear image of your signature on the third page.');
      if (password.length < 8) return fail(3, 'Set a password of at least 8 characters on the third page.');
      var parts = dob.split('-').map(Number), born = new Date(Date.UTC(2000, 0, 1, 12));
      born.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
      return {
        password: password,
        resident: {
          name: name, sex: sex, region: region, dob: born.toISOString(),
          address: address + ', ' + regionName(region) + ', Bacolor, Pampanga', phone: fmtPhone(contact),
          heightCm: height, weightKg: weight, nationality: nationality, occupation: occupation,
          civilStatus: civilStatus, bloodType: bloodType,
          familyContacts: familyContacts,
          idPhoto: hasIdPhoto ? photos.id : '', idType: hasIdPhoto ? photos.idType : '',
          facePhoto: photos.face, signaturePhoto: photos.signature
        }
      };
    }

    /* ----- step 4: review page ----- */
    function buildReviewPage() {
      var f = draft.fields || {};
      var row = function (label, val) { return '<div class="review-row"><dt>' + label + '</dt><dd>' + (val ? esc(val) : '<i>Not provided</i>') + '</dd></div>'; };
      var sec = function (title, href, body) {
        return '<section class="review-section"><div class="review-head"><h3>' + title + '</h3><a class="review-edit" href="' + href + '">Edit</a></div>' + body + '</section>';
      };
      var photo = function (label, src, cls) {
        var im = safeImg(src);
        return '<figure class="review-photo' + (cls ? ' ' + cls : '') + '">' + (im ? '<img alt="' + label + '" src="' + im + '">' : '<span>Not provided</span>') + '<figcaption>' + label + '</figcaption></figure>';
      };
      var rawContact = String(f.rphone || '');
      var isEmail = rawContact.indexOf('@') !== -1;
      var contactValue = isEmail ? rawContact : fmtPhone(normPhone(rawContact));
      var people = (Array.isArray(draft.familyContacts) ? draft.familyContacts : []).filter(function (c) { return !isBlankContact(c); });
      var familyRows = people.length ? people.map(function (c, i) {
        return row('Family member ' + (i + 1), [c.name, c.relationship, fmtPhone(c.phone)].filter(Boolean).join(' · '));
      }).join('') : row('Emergency contact / family member', '').replace('<i>Not provided</i>', '<i>None added (optional)</i>');
      var check = collectRegistration();
      var problem = check.error
        ? '<div class="reg-notice review-problem" role="alert"><div class="reg-notice-title"><span aria-hidden="true">\u26A0</span> Please fix this before submitting</div><p>' + esc(check.error) +
          ' <a href="' + ['Register.html', 'Registerpg2.html', 'Registerpg3.html'][check.page - 1] + '">Go back and fix it</a></p></div>'
        : '';
      var pwLen = String(draft.pw || '').length;
      var idNote = photos.id ? '' : '<div class="reg-notice" role="note"><div class="reg-notice-title"><span aria-hidden="true">\u26A0</span> Government ID not added</div><p>Your account will wait for registry review until you upload your Government ID from your dashboard (Missing documents).</p></div>';
      return regNotice(4) + problem + idNote +
        sec('Resident information', 'Register.html', '<dl class="review-grid">' +
          row('Full name', f.rname) + row('Sex', f.rsex) + row('Date of birth', f.rdob) + row('Barangay', f.rbrgy ? regionName(f.rbrgy) : '') +
          row('House number / street', f.raddr) + row(isEmail ? 'Email' : 'Mobile number', contactValue) + '</dl>') +
        sec('ID details', 'Registerpg2.html', '<dl class="review-grid">' +
          row('Height', f.rheight ? f.rheight + ' cm' : '') + row('Weight', f.rweight ? f.rweight + ' kg' : '') + row('Nationality', f.rnationality) +
          row('Occupation', f.rocupation) + row('Civil status', f.rstatus) + row('Blood type', f.rblood) + familyRows + '</dl>') +
        sec('Verification', 'Registerpg3.html', '<dl class="review-grid">' + row('Government ID type', photos.idType || 'Not added yet — upload it later under Missing documents') +
          row('Password', pwLen ? '\u2022'.repeat(Math.min(pwLen, 12)) + ' (' + pwLen + ' characters)' : '') + '</dl>' +
          '<div class="review-photos">' + photo('Government ID photo', photos.id) + photo('Face photo', photos.face) + photo('Signature', photos.signature, 'sig') + '</div>') +
        '<label class="review-confirm"><input type="checkbox" id="rconfirm4"> <span>I confirm that all the information above is true and correct, and that it belongs to me.</span></label>' +
        '<div id="rmsg" class="error" role="alert"></div>' +
        '<div class="actions"><button type="button" class="btn secondary" id="rback">Back</button><button type="button" class="btn brass" id="rgo"' + (check.error ? ' disabled' : '') + '>Submit registration</button></div>';
    }

    /* ----- draft handling ----- */
    var NOT_STORED = { rpw: 1, rpw2: 1 };
    app.querySelectorAll('input[id],select[id]').forEach(function (field) {
      if (field.type === 'file' || field.closest('[data-registration-contact]') || NOT_STORED[field.id]) return;
      if (draft.fields && Object.prototype.hasOwnProperty.call(draft.fields, field.id)) {
        field.value = field.id === 'rdob' ? dobToDisplay(draft.fields[field.id]) : field.id === 'rphone' ? fmtPhone(draft.fields[field.id]) : draft.fields[field.id];
      }
    });
    function saveDraft() {
      var fields = draft.fields || {};
      app.querySelectorAll('input[id],select[id]').forEach(function (field) {
        if (field.type !== 'file' && !field.closest('[data-registration-contact]') && !NOT_STORED[field.id]) fields[field.id] = field.value;
      });
      ['remergencyname', 'remergencyrelation', 'remergencyphone', 'rprecinct'].forEach(function (k) { delete fields[k]; });
      draft = { fields: fields, photos: photos, familyContacts: page === 2 ? collectRegistrationContacts() : registrationContacts, pw: draft.pw || '' };
      return saveRegistrationDraft(draft);
    }
    var SAVE_ERROR = 'Could not save your registration details in this browser. Check available storage and try again.';
    if (page === 3 && draft.pw) { $('rpw').value = draft.pw; $('rpw2').value = draft.pw; }
    if (page === 4) {
      $('rback').onclick = function () { location.href = 'Registerpg3.html'; };
      $('rgo').onclick = async function () {
        if (!$('rconfirm4').checked) return msg('rmsg', 'Tick the box to confirm that your information is correct.');
        var r = collectRegistration();
        if (r.error) return msg('rmsg', r.error);
        this.disabled = true;
        try {
          var result = await api('/register', { method: 'POST', body: { resident: r.resident, password: r.password } });
          clearRegistrationDraft();
          setSession(result.token);
          activeResident = result.resident;
          location.href = PAGES.citizenCard;
        } catch (error) {
          this.disabled = false;
          msg('rmsg', error.message);
        }
      };
      return;
    }
    app.addEventListener('input', function (event) {
      var t = event.target;
      if (t.id === 'rdob') t.value = maskDob(t.value);
      if (t.id === 'rphone') t.value = maskByMode(t.value, $('rcontacttype').value);
      else if (t.hasAttribute && t.hasAttribute('data-family-phone')) t.value = maskByMode(t.value, 'mobile');
      saveDraft();
    });
    app.addEventListener('change', function (event) {
      var t = event.target;
      if (t.id === 'rcontacttype') { $('rphone').value = ''; applyPageOneMode(); }

      saveDraft();
    });
    function applyPageOneMode() {
      var email = $('rcontacttype').value === 'email';
      setContactMode($('rphone'), email ? 'email' : 'mobile');
      $('rphonelabel').innerHTML = (email ? 'Email ' : 'Mobile number ') + REQ;
      $('rphonehelp').textContent = email ? 'Use an email address that includes @.' : 'Enter the 10 digits after +63, like 917-123-4567. A leading 0 is removed for you.';
    }
    if (page === 1) {
      if (!(draft.fields && draft.fields.rcontacttype) && draft.fields && String(draft.fields.rphone || '').indexOf('@') !== -1) $('rcontacttype').value = 'email';
      applyPageOneMode();
      if ($('rcontacttype').value === 'email' && $('rphone').value && $('rphone').value.indexOf('@') === -1) $('rphone').value = '';
    }

    /* ================= page 1 ================= */
    if (page === 1) {
      $('rnext').onclick = async function () {
        var name = $('rname').value.trim().replace(/\s+/g, ' '), dob = dobToYmd($('rdob').value),
          region = $('rbrgy').value, address = $('raddr').value.trim(), contact = normPhone($('rphone').value);
        if (name.length < 3) return msg('rmsg', 'Enter your full name.');
        if (!$('rsex').value) return msg('rmsg', 'Select your sex.');
        if (!dob) return msg('rmsg', 'Enter your date of birth as MM/DD/YYYY.');
        if (dob > today) return msg('rmsg', 'Date of birth cannot be in the future.');
        if (!region) return msg('rmsg', 'Select your barangay.');
        if (!validAddress(address)) return msg('rmsg', 'Enter a house number like #12, with or without a street name.');
        if ($('rcontacttype').value === 'email' ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) : !/^09\d{9}$/.test(contact)) {
          return msg('rmsg', $('rcontacttype').value === 'email' ? 'Enter a valid email address with @.' : 'Enter a valid mobile number, like (+63)917-123-4567.');
        }
        try { await api('/contact-available', { method: 'POST', body: { phone: contact } }); }
        catch (error) { return msg('rmsg', error.message); }
        if (!saveDraft()) return msg('rmsg', SAVE_ERROR);
        location.href = 'Registerpg2.html';
      };
      return;
    }

    /* ================= page 2 ================= */
    if (page === 2) {
      renderRegistrationContacts();
      $('raddcontact').onclick = function () {
        registrationContacts = collectRegistrationContacts();
        registrationContacts.push({ personId: '', name: '', phone: '', relationship: '', isEmergencyContact: true });
        renderRegistrationContacts();
        saveDraft();
      };
      $('rback').onclick = function () {
        if (!saveDraft()) return msg('rmsg', SAVE_ERROR);
        location.href = 'Register.html';
      };
      $('rnext').onclick = function () {
        var height = Number($('rheight').value), weight = Number($('rweight').value);
        if (!Number.isFinite(height) || height < 50 || height > 250 || !$('rheight').value) return msg('rmsg', 'Enter a height between 50 and 250 cm.');
        if (!Number.isFinite(weight) || weight < 2 || weight > 500 || !$('rweight').value) return msg('rmsg', 'Enter a weight between 2 and 500 kg.');
        if ($('rnationality').value.trim().length < 2) return msg('rmsg', 'Enter your nationality.');
        var contacts = collectRegistrationContacts().filter(function (c) { return !isBlankContact(c); });
        for (var i = 0; i < contacts.length; i++) {
          if (contacts[i].name.length < 2) return msg('rmsg', 'Enter the full name for each family member.');
          if (!/^09\d{9}$/.test(contacts[i].phone)) return msg('rmsg', 'Enter each family member’s mobile number, like (+63)917-123-4567.');
          if (!contacts[i].relationship) return msg('rmsg', 'Select a family relationship for each person.');
        }
        if (!saveDraft()) return msg('rmsg', SAVE_ERROR);
        location.href = 'Registerpg3.html';
      };
      return;
    }

    /* ================= page 3 : verification of ID ================= */
    bindPasswordToggles();
    function currentIdType() { return $('ridtype').value === 'other' ? $('ridtypeother').value.trim() : $('ridtype').value; }
    function syncIdType() {
      $('ridtypeotherwrap').hidden = $('ridtype').value !== 'other';
      var type = currentIdType();
      if (type !== photos.idType) { photos.id = ''; photos.confirmedIdType = ''; $('ridupload').value = ''; }
      photos.idType = type;
    }
    if (photos.idType) {
      var known = Array.prototype.some.call($('ridtype').options, function (o) { return o.value === photos.idType; });
      if (known) $('ridtype').value = photos.idType;
      else { $('ridtype').value = 'other'; $('ridtypeother').value = photos.idType; }
    }
    $('ridtypeotherwrap').hidden = $('ridtype').value !== 'other';
    function paintBox(boxId, imgId, placeholderId, cls, src) {
      $(boxId).classList.toggle(cls, !!src);
      $(imgId).src = src || '';
      $(placeholderId).hidden = !!src;
    }
    function paint() {
      paintBox('ridbox', 'ridprev', 'ridplaceholder', 'has-photo', photos.id);
      paintBox('rfacebox', 'rfaceprev', 'rfaceplaceholder', 'has-photo', photos.face);
      paintBox('rsignaturebox', 'rsignatureprev', 'rsignatureplaceholder', 'has-signature', photos.signature);
      $('ridstart').textContent = photos.id ? 'Retake Government ID photo' : 'Take Government ID photo';
      $('rstart').textContent = photos.face ? 'Change face photo' : 'Take face photo';
      $('ridreset').hidden = !photos.id;
      $('rfacereset').hidden = !photos.face;
      $('rsignaturereset').hidden = !photos.signature;
    }
    function commit() { paint(); if (!saveDraft()) msg('rmsg', SAVE_ERROR); else msg('rmsg', ''); }
    paint();
    $('ridtype').onchange = function () { syncIdType(); commit(); };
    $('ridtypeother').oninput = function () { syncIdType(); commit(); };

    $('rback').onclick = function () {
      if (!saveDraft()) return msg('rmsg', SAVE_ERROR);
      location.href = 'Registerpg2.html';
    };
    // Reset buttons clear one picture at a time.
    $('ridreset').onclick = function () { photos.id = ''; photos.confirmedIdType = ''; $('ridupload').value = ''; commit(); };
    $('rfacereset').onclick = function () { photos.face = ''; $('rfaceupload').value = ''; commit(); };
    $('rsignaturereset').onclick = function () { photos.signature = ''; $('rsignature').value = ''; commit(); };

    $('ridupload').onchange = async function () {
      var file = this.files && this.files[0];
      if (!file) return;
      if (!photos.idType) { this.value = ''; return msg('rmsg', 'Select your Government ID type first.'); }
      try {
        photos.id = await readImage(file, 1280);
        photos.confirmedIdType = photos.idType;
        commit();
      } catch (error) { this.value = ''; msg('rmsg', error.message); }
    };
    $('rfaceupload').onchange = async function () {
      var file = this.files && this.files[0];
      if (!file) return;
      try { photos.face = await readImage(file, 640); commit(); }
      catch (error) { this.value = ''; msg('rmsg', error.message); }
    };
    $('rsignature').onchange = async function () {
      var file = this.files && this.files[0];
      if (!file) return;
      try { photos.signature = await readImage(file, 800); commit(); }
      catch (error) { photos.signature = ''; this.value = ''; msg('rmsg', error.message); }
    };

    var cameraVideo = $('rfacevideo'), cameraStream = null, capturedPhoto = '', cameraRequest = 0, cameraTarget = 'face';
    var cameraPortal = $('rcameraportal');
    function stopCamera() {
      if (cameraStream) {
        cameraStream.getTracks().forEach(function (track) { track.stop(); });
        cameraStream = null;
      }
      cameraVideo.srcObject = null;
      cameraVideo.hidden = true;
    }
    function cameraMessage(text, isError) {
      var status = $('rcammsg');
      status.textContent = text;
      status.className = isError ? 'camera-status error' : 'camera-status';
    }
    async function startCamera(target) {
      var request = ++cameraRequest;
      cameraTarget = target || cameraTarget;
      capturedPhoto = '';
      var isId = cameraTarget === 'id';
      $('rcamerakicker').textContent = isId ? 'GOVERNMENT ID' : 'FACE PHOTO';
      $('rcameratitle').textContent = isId ? 'Photograph your ID' : 'Take your photo';
      $('rcamerainstructions').textContent = isId
        ? 'Place the selected ID flat in good light. Fit the full ID inside the frame and avoid glare before taking the photo.'
        : 'Center your face in the frame, then take a photo to review it.';
      $('rfacecandidate').alt = isId ? 'Government ID photo for review' : 'Face photo for review';
      cameraPortal.hidden = false;
      $('rcameraloading').hidden = false;
      $('rfacecandidate').hidden = true;
      $('rcapture').hidden = true;
      $('rretake').hidden = true;
      $('rconfirm').hidden = true;
      $('rcancel').focus();
      cameraMessage('Requesting camera access…');
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        cameraMessage('Camera access is unavailable. Use a supported browser over HTTPS or localhost.', true);
        return;
      }
      try {
        var stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: isId ? 'environment' : 'user' } }, audio: false });
        if (request !== cameraRequest || cameraPortal.hidden) {
          stream.getTracks().forEach(function (track) { track.stop(); });
          return;
        }
        cameraStream = stream;
        cameraVideo.srcObject = cameraStream;
        cameraVideo.hidden = false;
        $('rcameraloading').hidden = true;
        await cameraVideo.play();
        if (request !== cameraRequest || cameraPortal.hidden) return;
        $('rcapture').hidden = false;
        cameraMessage(isId ? 'Position your Government ID in the camera, then take a photo.' : 'Position your face in the camera, then take a photo.');
      } catch (error) {
        if (request !== cameraRequest) return;
        stopCamera();
        $('rcameraloading').hidden = false;
        var message = error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser settings, then try again.' :
          error.name === 'NotFoundError' ? 'No camera was found on this device.' :
          error.name === 'NotReadableError' ? 'The camera is already in use or could not be started.' :
          'Unable to start the camera. Check camera access and try again.';
        cameraMessage(message, true);
      }
    }
    function closeCameraPortal() {
      cameraRequest++;
      stopCamera();
      capturedPhoto = '';
      cameraPortal.hidden = true;
      $('rfacecandidate').src = '';
      (cameraTarget === 'id' ? $('ridstart') : $('rstart')).focus();
    }
    $('ridstart').onclick = function () {
      if (!photos.idType) return msg('rmsg', 'Select your Government ID type first.');
      startCamera('id');
    };
    $('rstart').onclick = function () { startCamera('face'); };
    $('rcancel').onclick = closeCameraPortal;
    $('rcancelaction').onclick = closeCameraPortal;
    $('rretake').onclick = function () { startCamera(cameraTarget); };
    $('rconfirm').onclick = function () {
      if (!capturedPhoto) return;
      if (cameraTarget === 'id') {
        photos.id = capturedPhoto;
        photos.confirmedIdType = photos.idType;
        $('ridupload').value = '';
      } else {
        photos.face = capturedPhoto;
        $('rfaceupload').value = '';
      }
      commit();
      closeCameraPortal();
    };
    cameraPortal.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeCameraPortal();
    });
    $('rcapture').onclick = function () {
      if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
        cameraMessage('The camera is not ready yet. Wait a moment and try again.', true);
        return;
      }
      var max = cameraTarget === 'id' ? 1280 : 640;
      var scale = Math.min(1, max / Math.max(cameraVideo.videoWidth, cameraVideo.videoHeight));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(cameraVideo.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(cameraVideo.videoHeight * scale));
      var context = canvas.getContext('2d');
      if (!context) {
        cameraMessage('Could not capture the photo. Please try again.', true);
        return;
      }
      try {
        context.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
        capturedPhoto = canvas.toDataURL('image/jpeg', cameraTarget === 'id' ? 0.82 : 0.72);
        stopCamera();
        $('rfacecandidate').src = capturedPhoto;
        $('rfacecandidate').hidden = false;
        $('rcameraloading').hidden = true;
        $('rcapture').hidden = true;
        $('rretake').hidden = false;
        $('rconfirm').hidden = false;
        cameraMessage('Review your photo. Confirm it to add it to your registration, or retake it.');
        $('rretake').focus();
      } catch (error) {
        cameraMessage('Could not capture the photo. Please try again.', true);
      }
    };
    window.addEventListener('pagehide', stopCamera);

    $('rgo').onclick = function () {
      syncIdType();
      if (!saveDraft()) return msg('rmsg', SAVE_ERROR);
      var password = $('rpw').value;
      if (photos.idType && (!photos.id || photos.confirmedIdType !== photos.idType)) return msg('rmsg', 'Add a photo of your ' + photos.idType + ', or choose “Skip for now” for the ID type to upload it later.');
      if (!photos.face) return msg('rmsg', 'Add a face photo.');
      if (!photos.signature) return msg('rmsg', 'Upload a clear image of your signature.');
      if (password.length < 8) return msg('rmsg', 'Password must be at least 8 characters.');
      if (password !== $('rpw2').value) return msg('rmsg', 'Passwords do not match.');
      draft.pw = password;
      if (!saveRegistrationDraft(draft)) return msg('rmsg', SAVE_ERROR);
      var check = collectRegistration();
      if (check.error) return msg('rmsg', check.error);
      stopCamera();
      location.href = PAGES.citizenRegisterReview;
    };
  }

  async function viewCard() {
    var activeTab = app.querySelector('[data-account-tab].active');
    var activeTabName = activeTab ? activeTab.dataset.accountTab : 'dashboard';
    var me = currentRecord();
    if (!me) { location.replace(PAGES.citizenLookup); return; }
    var familyResult;
    try {
      familyResult = await api('/family');
    } catch (error) {
      setSession('');
      activeResident = null;
      app.innerHTML = '<div class="card"><h2>Could not load your Civil ID</h2><p class="sub">' + esc(error.message) + '</p><button class="btn brass" onclick="setView(&quot;citizenLookup&quot;)">Return to log in</button></div>';
      return;
    }
    var refreshedRecord = familyResult.residents.filter(function (resident) { return resident.id === me.id; })[0];
    if (refreshedRecord) {
      me = refreshedRecord;
      activeResident = refreshedRecord;
    }
    var face = safeImg(me.facePhoto), signature = safeImg(me.signaturePhoto), all = familyResult.residents,
        familyProfiles = familyResult.familyProfiles || [];
    var qrHtml = 'QR';
    try {
      var q = qrcode(0, 'M'); q.addData('BACOLOR-CIVIL-ID|' + me.id + '|' + me.name); q.make();
      qrHtml = '<img alt="QR code" src="' + q.createDataURL(4, 0) + '">';
    } catch (e) {}
    var photoHtml = face ? '<img alt="Your face photo" src="' + face + '">' :
      '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="38" r="17" fill="#fff"/><path d="M14 100c4-26 20-36 36-36s32 10 36 36z" fill="#fff"/></svg>';
    signature = await transparentSignature(signature);
    var signatureHtml = signature ? '<img alt="Resident signature" src="' + signature + '">' : '<span>Signature not provided</span>';
    var familyRelations = Array.isArray(me.familyRelations) ? me.familyRelations : [];
    var emergencyContactIds = Array.isArray(me.emergencyContacts) ? me.emergencyContacts : [];
    var value = function (item) { return item == null || item === '' ? '—' : esc(item); };
    var emergencyMarkup = familyRelations.filter(function (relation) {
      return emergencyContactIds.indexOf(relation.id) !== -1;
    }).map(function (relation) {
      var person = familyMember(relation.profileId, all, familyProfiles) || {};
      return '<div><span>Name</span><b>' + value(person.name) + '</b></div><div><span>Relationship</span><b>' + value(relation.relationship) + '</b></div>' +
        '<div><span>Contact no.</span><b>' + value(fmtPhone(person.phone)) + '</b></div>';
    }).join('');
    if (!emergencyMarkup && me.emergencyContact) {
      emergencyMarkup = '<div><span>Name</span><b>' + value(me.emergencyContact.name) + '</b></div><div><span>Relationship</span><b>' + value(me.emergencyContact.relationship) + '</b></div>' +
        '<div><span>Contact no.</span><b>' + value(fmtPhone(me.emergencyContact.phone)) + '</b></div>';
    }
    if (!emergencyMarkup) {
      emergencyMarkup = '<div><span>Name</span><b>—</b></div><div><span>Relationship</span><b>—</b></div><div><span>Contact no.</span><b>—</b></div>';
    }
    var age = '—';
    if (me.dob) {
      var birthDate = new Date(me.dob), today = new Date();
      if (!Number.isNaN(birthDate.getTime())) {
        age = String(today.getFullYear() - birthDate.getFullYear() -
          (today.getMonth() < birthDate.getMonth() ||
            (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate()) ? 1 : 0));
      }
    }

    var front = '<div class="idframe"><div class="idcard front">' +
      '<div class="f-head"><div class="f-seal"><img src="BacolorLogo-removebg-preview.png" alt="Municipality of Bacolor logo"></div><div class="f-title"><b>Bacolor Civil ID</b><span>Municipality of Bacolor, Pampanga</span></div></div>' +
      '<div class="f-body"><div class="f-photo-column"><div class="f-photo">' + photoHtml + '</div><div class="f-signature"><div class="f-signature-image">' + signatureHtml + '</div><span class="lbl">Signature</span></div></div><div class="f-info">' +
      '<div><div class="lbl">Full name</div><div class="f-name">' + esc(me.name) + '</div></div>' +
      '<div class="f-grid"><div><div class="lbl">Date of birth</div><b>' + esc(fmtDate(me.dob)) + '</b></div><div><div class="lbl">Sex</div><b>' + value(me.sex) + '</b></div>' +
      '<div><div class="lbl">Age</div><b>' + age + '</b></div><div><div class="lbl">Height</div><b>' + value(me.heightCm ? me.heightCm + ' cm' : '') + '</b></div>' +
      '<div><div class="lbl">Weight</div><b>' + value(me.weightKg ? me.weightKg + ' kg' : '') + '</b></div><div><div class="lbl">Nationality</div><b>' + value(me.nationality) + '</b></div>' +
      '<div><div class="lbl">Occupation</div><b>' + value(me.occupation) + '</b></div><div><div class="lbl">Status</div><b>' + value(me.civilStatus) + '</b></div>' +
      '<div><div class="lbl">Blood type</div><b>' + value(me.bloodType) + '</b></div>' +
      '<div class="f-wide"><div class="lbl">Address</div><b>' + value(me.address) + '</b></div>' +
      '<div><div class="lbl">Contact info</div><b>' + value(fmtPhone(me.phone)) + '</b></div>' +
      '<div><div class="lbl">Valid until</div><b>' + value(me.validUntil ? fmtDate(me.validUntil) : '') + '</b></div>' +
      '<div><div class="lbl">Date issued</div><b>' + esc(fmtDate(me.registeredAt)) + '</b></div></div></div></div>' +
      '<div class="f-foot"><div class="f-uid"><div class="lbl">Civil ID No.</div><div class="uid">' + esc(me.id) + '</div></div></div>' +
      '<div class="f-stripe"></div></div></div>';

    var back = '<div class="idframe"><div class="idcard back">' +
      '<div class="b-back-head"><div class="b-qr" aria-label="Civil ID QR code">' + qrHtml + '</div></div>' +
      '<section class="b-emergency"><div class="b-section-title">Emergency contact persons</div><div class="b-contact-grid">' + emergencyMarkup + '</div></section>' +
      '<section class="b-terms"><div class="b-section-title">Terms &amp; conditions</div><p>This is a sample ID-card notice for presentation only. Final terms and card-use rules must be confirmed by the Municipality of Bacolor before official use.</p></section>' +
      '<section class="b-hotline"><span>BARANGAY EMERGENCY HOTLINE</span><b>To be confirmed with your barangay</b></section>' +
      '<div class="b-signatures"><div><span></span><strong>Ms. Vicenta P. Pineda</strong><b>Municipal Secretary</b></div><div><span></span><strong>Hon. Eduardo &quot;Diman&quot; G. Datu</strong><b>Municipal Mayor</b></div></div>' +
      '<div class="b-back-foot">BACOLOR CIVIL ID <span>' + esc(me.id) + '</span></div></div></div>';

    var byId = function (id) { return id ? all.filter(function (resident) { return resident.id === id; })[0] : null; };
    /* Family members you add are emergency contacts first. They only join the tree once they hold a registered account. */
    var relResident = function (relation) {
      var p = familyMember(relation.profileId, all, familyProfiles);
      return p && p.id ? (all.filter(function (x) { return x.id === p.id && x.loginEnabled !== false; })[0] || null) : null;
    };
    var relPeople = function (types) {
      var out = [];
      familyRelations.forEach(function (relation) {
        if (types.indexOf(relation.relationship) === -1) return;
        var r = relResident(relation);
        if (r && r.id !== me.id && out.indexOf(r) === -1) out.push(r);
      });
      return out;
    };
    var father = byId(me.fatherId) || relPeople(['Father'])[0] || null;
    var mother = byId(me.motherId) || relPeople(['Mother'])[0] || null;
    var spouse = byId(me.spouseId) || relPeople(['Spouse'])[0] || null;
    var kids = all.filter(function (resident) {
      return resident.id !== me.id && (resident.fatherId === me.id || resident.motherId === me.id);
    });
    relPeople(['Son', 'Daughter', 'Child']).forEach(function (r) {
      if (kids.indexOf(r) === -1 && r !== father && r !== mother && r !== spouse) kids.push(r);
    });
    var node = function (r, rel, cls) {
      var im = safeImg(r.facePhoto);
      return '<div class="node' + (cls || '') + '"><div class="av">' + (im ? '<img alt="" src="' + im + '">' : esc(initials(r.name))) + '</div><div class="nm">' + esc(r.name) + '</div><div class="rl">' + esc(rel) + '</div></div>';
    };
    var relationNode = function (relation) {
      var person = familyMember(relation.profileId, all, familyProfiles) || { name: 'Family member' };
      var resident = all.filter(function (item) { return item.id === person.id; })[0];
      var profileInfo = [];
      if (person.phone) profileInfo.push('Mobile: ' + fmtPhone(person.phone));
      if (resident) {
        profileInfo.push('Civil ID: ' + resident.id);
        profileInfo.push(regionName(resident.region));
      } else {
        profileInfo.push('Unregistered profile');
      }
      var im = safeImg(person.facePhoto);
      return '<div class="node profile-node"><div class="av">' + (im ? '<img alt="" src="' + im + '">' : esc(initials(person.name))) +
        '</div><div class="nm">' + esc(person.name) + '</div><div class="rl">' + esc(relation.relationship) + '</div>' +
        '<div class="profile-meta">' + esc(profileInfo.join(' · ')) + '</div></div>';
    };
    var linkedIds = [];
    var seenGrand = {};
    var grandKidsOf = function (k) {
      return all.filter(function (r) {
        if (r.id === me.id || seenGrand[r.id] || (r.fatherId !== k.id && r.motherId !== k.id)) return false;
        seenGrand[r.id] = true; return true;
      });
    };
    var grandMap = {}, grandkids = [];
    kids.forEach(function (k) { grandMap[k.id] = grandKidsOf(k); grandkids = grandkids.concat(grandMap[k.id]); });
    var sibs = all.filter(function (r) {
      return r.id !== me.id && ((me.fatherId && r.fatherId === me.fatherId) || (me.motherId && r.motherId === me.motherId));
    });
    relPeople(['Brother', 'Sister']).forEach(function (r) {
      if (sibs.indexOf(r) === -1 && r !== father && r !== mother && r !== spouse && kids.indexOf(r) === -1) sibs.push(r);
    });
    var sibKids = {}, sibKidList = [];
    sibs.forEach(function (sb) {
      sibKids[sb.id] = all.filter(function (r) {
        if (r.id === me.id || seenGrand[r.id] || (r.fatherId !== sb.id && r.motherId !== sb.id)) return false;
        seenGrand[r.id] = true; return true;
      });
      sibKidList = sibKidList.concat(sibKids[sb.id]);
    });
    [father, mother, spouse].concat(kids, grandkids, sibs, sibKidList).forEach(function (resident) {
      if (resident && linkedIds.indexOf(resident.id) === -1) linkedIds.push(resident.id);
    });
    var relationIdentity = function (relation) {
      var person = familyMember(relation.profileId, all, familyProfiles);
      return person && person.id ? person.id : relation.profileId;
    };
    var verifiedRelations = familyRelations.filter(function (relation) { return !!relResident(relation); });
    var additionalVerifiedRelations = verifiedRelations.filter(function (relation) {
      if (!familyMember(relation.profileId, all, familyProfiles)) return false;
      var identity = relationIdentity(relation);
      if (linkedIds.indexOf(identity) !== -1) return false;
      linkedIds.push(identity);
      return true;
    });
    var familyCountIds = linkedIds.slice();
    familyRelations.forEach(function (relation) {
      if (!relResident(relation)) return;
      var identity = relationIdentity(relation);
      if (identity && familyCountIds.indexOf(identity) === -1) familyCountIds.push(identity);
    });
    var fam = '';
    var familyCount = familyCountIds.length;
    if (father || mother || spouse || kids.length || additionalVerifiedRelations.length) {
      var rid = function (p) { return p && p.id && all.some(function (x) { return x.id === p.id; }) ? p.id : ''; };
      var fstat = function (p) {
        var id = rid(p);
        if (!id) return '<span class="fc-st none">Unregistered</span>';
        var rec = all.filter(function (x) { return x.id === id; })[0];
        return rec && rec.verified === true ? '<span class="fc-st ok">Verified</span>' : '<span class="fc-st pending">Registered</span>';
      };
      var fnode = function (p, rel, cls) {
        var im = safeImg(p.facePhoto);
        return '<div class="fcard' + (cls || '') + '"><div class="fc-rib">' + esc(rel) + '</div><div class="fc-av">' +
          (im ? '<img alt="" src="' + im + '">' : esc(initials(p.name))) + '</div><div class="fc-nm">' + esc(p.name) +
          '</div><div class="fc-id">' + (rid(p) ? esc(p.id) : 'No Civil ID') + '</div>' + fstat(p) + '</div>';
      };
      var ROMAN = ['I', 'II', 'III', 'IV', 'V'], g = 0;
      var rail = function (t, cls) { return '<div class="ft-rail' + (cls ? ' ' + cls : '') + '"><b>' + ROMAN[g++] + '</b><span>' + t + '</span></div>'; };
      var stem = '<div class="ft-stem" aria-hidden="true"></div>';
      var couple = function (list) { return '<div class="ft-couple">' + list.filter(Boolean).join('<span class="ft-join" aria-hidden="true"></span>') + '</div>'; };
      var tiers = '';
      var sexWord = function (p, m, f, d) { return p.sex === 'Female' ? f : (p.sex === 'Male' ? m : d); };
      var descendants = function () {
        return '<div class="ft-kids">' + kids.map(function (k) {
          var gk = grandMap[k.id] || [];
          return '<div class="ft-kid">' + fnode(k, sexWord(k, 'Son', 'Daughter', 'Child')) +
            (gk.length ? stem + '<div class="ft-kids">' + gk.map(function (c) {
              return '<div class="ft-kid">' + fnode(c, sexWord(c, 'Grandson', 'Granddaughter', 'Grandchild')) + '</div>';
            }).join('') + '</div>' : '') + '</div>';
        }).join('') + '</div>';
      };
      var meBlock = spouse
        ? '<div class="ft-me"><span></span>' + fnode(me, 'You', ' me') + '<div class="ft-spouse"><span class="ft-join" aria-hidden="true"></span>' + fnode(spouse, 'Spouse') + '</div></div>'
        : fnode(me, 'You', ' me');
      var hasParents = !!(father || mother);
      if (hasParents) tiers += '<div class="ft-gen">' + rail('Parents') + couple([father ? fnode(father, 'Father') : '', mother ? fnode(mother, 'Mother') : '']) + '</div>' + stem;
      if (sibs.length) {
        var dobKey = function (p) { var t = new Date(p.dob).getTime(); return isNaN(t) ? Infinity : t; };
        var row = [me].concat(sibs).sort(function (x, y) { return dobKey(x) - dobKey(y); });
        tiers += '<div class="ft-gen sib' + (hasParents ? '' : ' noconn') + '">' + rail('Siblings') +
          ((kids.length || sibKidList.length) ? rail(kids.length ? (sibKidList.length ? 'Next generation' : 'Children') : 'Nephews / nieces', 'grand-rail') : '') + (grandkids.length ? rail('Grandchildren', 'grand-rail2') : '') +
          '<div class="ft-kids">' + row.map(function (p) {
            if (p.id !== me.id) {
              var nk = sibKids[p.id] || [];
              return '<div class="ft-kid">' + fnode(p, sexWord(p, 'Brother', 'Sister', 'Sibling')) +
                (nk.length ? stem + '<div class="ft-kids">' + nk.map(function (c) {
                  return '<div class="ft-kid">' + fnode(c, sexWord(c, 'Nephew', 'Niece', 'Nephew / niece')) + '</div>';
                }).join('') + '</div>' : '') + '</div>';
            }
            return '<div class="ft-kid">' + meBlock + (kids.length ? stem + descendants() : '') + '</div>';
          }).join('') + '</div></div>';
      } else {
        tiers += '<div class="ft-gen">' + rail('Resident') + '<div class="ft-me"><span></span>' + fnode(me, 'You', ' me') +
          (spouse ? '<div class="ft-spouse"><span class="ft-join" aria-hidden="true"></span>' + fnode(spouse, 'Spouse') + '</div>' : '<span></span>') + '</div></div>';
        if (kids.length) tiers += stem + '<div class="ft-gen kids' + (kids.length === 1 ? ' single' : '') + '">' + rail('Children', 'kid-rail') +
          (grandkids.length ? rail('Grandchildren', 'grand-rail') : '') + descendants() + '</div>';
      }
      if (additionalVerifiedRelations.length) tiers += '<div class="ft-extended"><div class="ft-ext-title">Other relatives</div><div class="ft-ext-row">' +
        additionalVerifiedRelations.map(function (relation) {
          return fnode(familyMember(relation.profileId, all, familyProfiles) || { name: 'Family member' }, relation.relationship);
        }).join('') + '</div></div>';
      fam = '<div class="ftdoc"><header class="ftdoc-head"><img class="ftdoc-seal" alt="" src="' + esc(window.SEAL_SRC || '') + '">' +
        '<div class="ftdoc-title"><span>Republic of the Philippines · Province of Pampanga</span><b>Municipality of Bacolor</b><em>Family Tree Record</em></div>' +
        '<button type="button" class="ft-print" onclick="window.print()">Print</button></header>' +
        '<dl class="ftdoc-meta"><div><dt>Resident</dt><dd>' + esc(me.name) + '</dd></div><div><dt>Civil ID No.</dt><dd>' + esc(me.id) +
        '</dd></div><div><dt>Family members</dt><dd>' + familyCount + '</dd></div><div><dt>Date generated</dt><dd>' + esc(fmtDate(new Date())) + '</dd></div></dl>' +
        '<div class="ftree-scroll" tabindex="0" role="group" aria-label="Family tree diagram"><div class="ftree">' + tiers + '</div></div>' +
        '<footer class="ftdoc-foot"><div class="ft-legend"><span><i class="lg-line"></i>Parent – child</span><span><i class="lg-line dbl"></i>Spouse</span>' +
        '<span><i class="lg-dash"></i>Other relatives</span><span><i class="lg-badge ok"></i>Verified</span><span><i class="lg-badge pending"></i>Registered</span>' +
        '<span><i class="lg-badge none"></i>Unregistered</span></div><p>Reference copy generated from your Civil ID record. This is not a certified document; certified copies are issued by the Municipal Civil Registrar.</p></footer></div>';
    }
    var pendingRelations = familyRelations.filter(function (relation) { return !relResident(relation); });

    var profilePhoto = face ? '<img src="' + face + '" alt="Profile photo of ' + esc(me.name) + '">' : '<span aria-hidden="true">' + esc(initials(me.name)) + '</span>';
    var info = function (label, value) {
      return '<div class="info-item"><span>' + label + '</span><b>' + esc(value || '—') + '</b></div>';
    };
    var registeredFamilyMembers = all.filter(function (resident) {
      return resident.id !== me.id && resident.loginEnabled !== false;
    });
    var registeredFamilyOptions = registeredFamilyMembers.map(function (resident) {
      return '<option value="' + esc(resident.id) + '">' + esc(resident.name + ' — ' + resident.id + (resident.phone ? ' — ' + resident.phone : '')) + '</option>';
    }).join('');

    var verifiedCount = familyRelations.filter(function (r) { return !!relResident(r); }).length;
    var pendingCount = pendingRelations.length;
    var firstName = String(me.name || '').trim().split(/\s+/)[0] || '';
    var missing = missingDocs(me);
    var statusText = me.verified === true ? 'Verified' : (missing.length ? 'Missing documents' : 'Awaiting review');
    var ico = function (d) { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
    var ICONS = {
      dash: ico('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>'),
      id: ico('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.6 1.7-2.2 3-2.2s2.4.6 3 2.2M14 10h4M14 13h3"/>'),
      family: ico('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c.5-3.6 3-5.5 6-5.5s5.5 1.9 6 5.5M16 14.5c2.6 0 4.5 1.6 5 4.5"/>'),
      gear: ico('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>'),
      doc: ico('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
      out: ico('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>')
    };
    var navBtn = function (tab, icon, label, extra) {
      return '<button type="button" class="dash-nav' + (tab === 'dashboard' ? ' active' : '') + '" data-account-tab="' + tab + '"' + (tab === 'dashboard' ? ' aria-current="page"' : '') + '>' + icon + '<span>' + label + '</span>' + (extra || '') + '</button>';
    };
    var attention = [];
    if (missing.length) attention.push('<li><b>Missing document: ' + esc(missing.map(function (d) { return d.label; }).join(', ')) + '.</b><span>Upload it so the registry can review and verify your account.</span><button type="button" class="btn link" data-go-tab="missing">Upload now</button></li>');
    else if (me.verified !== true) attention.push('<li><b>Your documents are awaiting review.</b><span>The registry is reviewing what you submitted.</span></li>');
    if (!familyRelations.length) attention.push('<li><b>No emergency contact added yet.</b><span>Optional: add one from the Family Tree section.</span></li>');
    var attentionHtml = attention.length ? '<ul class="dash-attention">' + attention.join('') + '</ul>' : '<p class="dash-empty">Nothing needs your attention.</p>';

    var themeIs = function () {
      var t = document.documentElement.getAttribute('data-theme');
      return t || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    };

    var rawId = safeImg(me.idPhoto), rawFace = safeImg(me.facePhoto), rawSig = safeImg(me.signaturePhoto);
    var dataPhoto = function (label, src, cls) {
      return '<figure class="data-photo' + (cls ? ' ' + cls : '') + '">' + (src ? '<img alt="' + label + '" src="' + src + '">' : '<span>Not provided</span>') + '<figcaption>' + label + '</figcaption></figure>';
    };
    var dataPhotos = dataPhoto('Government ID photo', rawId) + dataPhoto('Face photo', rawFace) + dataPhoto('Signature', rawSig, 'sig');
    var dataFamily = familyRelations.length ? familyRelations.map(function (relation) {
      var person = familyMember(relation.profileId, all, familyProfiles) || {};
      return '<div class="data-row"><b>' + esc(person.name || 'Family member') + '</b><span>' + esc(relation.relationship || '') + ' · ' + esc(fmtPhone(person.phone) || 'No mobile number') + ' · ' +
        (relResident(relation) ? 'In family tree' : '') + (emergencyContactIds.indexOf(relation.id) !== -1 ? (relResident(relation) ? ' · ' : '') + 'Emergency contact' : '') + '</span></div>';
    }).join('') : '<p class="dash-empty">No family members on record.</p>';
    /* ---- Missing documents panel ---- */
    var submittedNote = me.documentsSubmittedAt ? 'Your Government ID was submitted on ' + fmtDate(me.documentsSubmittedAt) + '. The registry will review it and update your status.' : '';
    var missingBody;
    if (missing.length) {
      missingBody = '<ul class="missing-list">' + missing.map(function (d) {
        return '<li><span class="missing-dot" aria-hidden="true"></span><div><b>' + esc(d.label) + '</b><span>Not uploaded yet</span></div></li>';
      }).join('') + '</ul>' +
        '<form class="family-add-panel" id="doc-form"><h4>Upload your Government ID</h4><p>Choose the type of ID and add a clear photo of it, with all four corners and the text readable. The registry reviews it after you submit.</p>' +
        '<div class="family-contact-entry"><label for="docidtype">Type of Philippine Government ID ' + REQ + '</label><select id="docidtype">' + idTypeOptions('Select your ID type…') + '</select>' +
        '<div id="docidtypeotherwrap" hidden><label for="docidtypeother">Specify the ID type ' + REQ + '</label><input id="docidtypeother" maxlength="80" autocomplete="off"></div>' +
        '<label for="docidfile">Government ID photo ' + REQ + '</label><div class="id-photo-box" id="docbox"><img id="docprev" alt="Preview of your Government ID photo"><span id="docplaceholder">Your Government ID photo will appear here</span></div>' +
        '<div class="camera-actions"><input id="docidfile" type="file" accept="image/*" aria-label="Choose Government ID photo"></div></div>' +
        '<div id="docmsg" class="error" role="alert"></div><button type="submit" class="btn brass">Submit for review</button></form>';
    } else {
      missingBody = '<div class="family-empty"><div class="family-empty-icon" aria-hidden="true">✓</div><h4>No missing documents</h4><p>' +
        esc(me.verified === true ? 'Your registration is complete and your account is verified.' : (submittedNote || 'Your documents are with the registry for review.')) + '</p></div>';
    }
    var missingPanel = '<section class="account-panel dash-panel" id="panel-missing" hidden><div class="panel-heading"><div><h3>Missing documents</h3><p class="id-hint">Documents the registry still needs from you.</p></div>' + badge(me) + '</div>' + missingBody + '</section>';

    app.innerHTML = '<div class="dash"><div class="dash-backdrop" id="dashBackdrop"></div>' +
      '<aside class="dash-side" id="dashSide" aria-label="Resident portal navigation">' +
      '<div class="dash-profile"><div class="dash-seal"><img src="' + esc(window.SEAL_SRC || 'BacolorLogo-removebg-preview.png') + '" alt="Municipality of Bacolor seal"></div><b>' + esc(me.name) + '</b><span>' + esc(regionName(me.region)) + ', Bacolor</span></div>' +
      '<nav class="dash-navlist"><div class="dash-group">My account</div>' +
      navBtn('dashboard', ICONS.dash, 'Dashboard') + navBtn('civil-id', ICONS.id, 'My Civil ID') +
      navBtn('missing', ICONS.doc, 'Missing documents', missing.length ? '<span class="dash-count">' + missing.length + '</span>' : '') +
      navBtn('family', ICONS.family, 'Family Tree', '<span class="dash-count">' + familyCount + '</span>') +
      '<div class="dash-group">System</div>' + navBtn('settings', ICONS.gear, 'Settings &amp; Privacy') +
      '<button type="button" class="dash-nav" id="dashLogout">' + ICONS.out + '<span>Log Out</span></button></nav>' +
      '<div class="dash-foot"><i aria-hidden="true"></i>Logged in as ' + esc(me.name) + '</div></aside>' +
      '<div class="dash-main"><header class="dash-top"><div class="dash-top-left"><button type="button" class="side-toggle" id="sideToggle" aria-controls="dashSide" aria-expanded="true" aria-label="Hide navigation menu" title="Hide navigation menu"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><span class="dash-crumb">Bacolor Population Registry / Resident Portal</span></div>' +
      '<div class="dash-top-right"><button type="button" class="dash-theme" id="themeToggle"></button><span class="dash-role">Resident</span><span class="dash-avatar" aria-hidden="true">' + esc(initials(me.name)) + '</span></div></header>' +
      '<div class="dash-content">' +

      /* ---- Dashboard ---- */
      '<section class="dash-panel" id="panel-dashboard"><h1 class="dash-title">Dashboard</h1><p class="dash-sub">welcome back, ' + esc(firstName.toLowerCase()) + '</p>' +
      '<div class="dash-row1"><article class="dash-stat"><h4>My Civil ID</h4><div class="dash-stat-id">' + esc(me.id) + '</div>' +
      '<div class="dash-tiles"><div><span>Status</span><b>' + statusText + '</b></div><div><span>Valid until</span><b>' + esc(me.validUntil ? fmtDate(me.validUntil) : '—') + '</b></div>' +
      '<div><span>Family links</span><b>' + familyCount + '</b></div></div></article>' +
      '<article class="dash-card dash-cal" aria-label="Calendar"><div class="dash-cal-head"><button type="button" id="calPrev" aria-label="Previous month">&lt;</button><b id="calTitle"></b><button type="button" id="calNext" aria-label="Next month">&gt;</button></div><div id="calGrid"></div></article></div>' +
      '<div class="dash-row2"><article class="dash-card"><div class="dash-card-head"><h4>my information</h4><span class="dash-chip">' + esc(me.id) + '</span></div><div class="info-grid dash-info">' +
      info('Date of birth', fmtDate(me.dob)) + info('Sex', me.sex) + info('Barangay', regionName(me.region)) + info('Mobile / email', fmtPhone(me.phone)) + info('Home address', me.address) + info('Registered on', fmtDate(me.registeredAt)) +
      '</div><div class="profile-note"><span class="note-icon" aria-hidden="true">i</span><p>For corrections, contact the Bacolor Population Registry.</p></div></article>' +
      '<article class="dash-card"><div class="dash-card-head"><h4>needs attention</h4></div>' + attentionHtml + '</article></div></section>' +

      /* ---- My Civil ID ---- */
      '<section class="account-panel dash-panel" id="panel-civil-id" hidden><div class="panel-heading"><div><h3>My Civil ID</h3><p class="id-hint">Tap a card to enlarge it.</p></div>' + badge(me) + '</div><div class="id-cards-display"><div><div class="side-label">Front</div>' + front + '</div><div><div class="side-label">Back</div>' + back + '</div></div></section>' +

      missingPanel +

      /* ---- Family tree ---- */
      '<section class="account-panel dash-panel" id="panel-family" hidden><div class="panel-heading"><div><h3>Family tree</h3></div><span class="profile-id">' + familyCount + (familyCount === 1 ? ' family member' : ' family members') + '</span></div>' +
      (fam || '<div class="family-empty"><div class="family-empty-icon" aria-hidden="true">♧</div><h4>Your family tree is ready</h4><p>Family members appear here once they register their own account. Until then, anyone you add is saved as an emergency contact only.</p><div class="tree"><div class="gen"><div class="gen-l">You</div><div class="gen-row">' + node(me, 'You', ' me') + '</div></div></div></div>') +
      '<form class="family-add-panel" id="family-add-form"><h4>Add an Emergency Contact / Family Member (optional)</h4><p>Anyone you add is saved as an emergency contact on your Civil ID. They join your family tree only after they register their own account.</p>' +
      '<div class="family-contact-entry"><label for="family-name">Full name ' + REQ + '</label><input id="family-name" autocomplete="off">' +
      '<label for="family-phone">Mobile number ' + REQ + '</label><input id="family-phone" type="tel" inputmode="numeric" autocomplete="off" placeholder="(+63)917-123-4567">' +
      '<label for="family-relationship">Family relationship ' + REQ + '</label><select id="family-relationship">' + familyRelationshipOptions('') + '</select></div>' +
      '<div id="family-add-msg" class="error" role="alert"></div><button type="submit" class="btn brass">Add emergency contact</button></form></section>' +

      /* ---- Settings & Privacy ---- */
      '<section class="dash-panel" id="panel-settings" hidden><div class="set-layout"><nav class="set-menu" aria-label="Settings sections">' +
      '<button type="button" class="set-tab active" data-set-tab="profile">My Profile</button>' +
      '<button type="button" class="set-tab" data-set-tab="security">Security &amp; Password</button>' +
      '<button type="button" class="set-tab" data-set-tab="appearance">Appearance &amp; Display</button>' +
      '<button type="button" class="set-tab" data-set-tab="privacy">Privacy &amp; Data</button></nav>' +
      '<div class="set-body">' +
      '<div class="set-pane" data-set-pane="profile"><div class="set-head"><h3>My profile</h3><p>Your registered account details.</p></div><div class="set-form">' +
      '<label for="setname">Full name</label><input id="setname" value="' + esc(me.name) + '" readonly>' +
      '<label for="setid">Civil ID number</label><input id="setid" value="' + esc(me.id) + '" readonly>' +
      '<label for="setphone">Mobile number or email</label><input id="setphone" value="' + esc(fmtPhone(me.phone || '')) + '" readonly>' +
      '<div class="help">To correct these details, contact the Bacolor Population Registry.</div></div></div>' +
      '<div class="set-pane" data-set-pane="security" hidden><div class="set-head"><h3>Security &amp; password</h3><p>Change the password you use to log in.</p></div><form class="set-form" id="pwForm">' +
      '<label for="pwcur">Current password ' + REQ + '</label><div class="password-field"><input id="pwcur" type="password" autocomplete="current-password"><button type="button" class="password-toggle" data-password-target="pwcur" aria-label="Show password" aria-pressed="false">Show</button></div>' +
      '<div class="grid2"><div><label for="pwnew">New password ' + REQ + '</label><div class="password-field"><input id="pwnew" type="password" autocomplete="new-password"><button type="button" class="password-toggle" data-password-target="pwnew" aria-label="Show password" aria-pressed="false">Show</button></div></div>' +
      '<div><label for="pwnew2">Confirm new password ' + REQ + '</label><div class="password-field"><input id="pwnew2" type="password" autocomplete="new-password"><button type="button" class="password-toggle" data-password-target="pwnew2" aria-label="Show password" aria-pressed="false">Show</button></div></div></div>' +
      '<div class="help">At least 8 characters.</div><div id="pwmsg" class="error" role="alert"></div><button type="submit" class="btn brass">Update password</button></form></div>' +
      '<div class="set-pane" data-set-pane="appearance" hidden><div class="set-head"><h3>Appearance &amp; display</h3><p>Choose how the portal looks on this device.</p></div><div class="set-form"><div class="set-choice" role="group" aria-label="Theme">' +
      '<button type="button" class="btn secondary" data-theme-choice="light">Light</button><button type="button" class="btn secondary" data-theme-choice="dark">Dark</button><button type="button" class="btn secondary" data-theme-choice="system">Match my device</button></div></div></div>' +
      '<div class="set-pane" data-set-pane="privacy" hidden><div class="set-head"><h3>Privacy &amp; data</h3><p>This is the information the registry keeps about you for your Civil ID.</p></div><div class="set-form data-view">' +
      '<h4 class="data-h">Personal information</h4><div class="info-grid dash-info">' +
      info('Full name', me.name) + info('Civil ID number', me.id) + info('Sex', me.sex) + info('Date of birth', fmtDate(me.dob)) + info('Barangay', regionName(me.region)) + info('Mobile number', fmtPhone(me.phone)) + info('Home address', me.address) + info('Registered on', fmtDate(me.registeredAt)) + '</div>' +
      '<h4 class="data-h">Physical and ID details</h4><div class="info-grid dash-info">' +
      info('Height', me.heightCm ? me.heightCm + ' cm' : '') + info('Weight', me.weightKg ? me.weightKg + ' kg' : '') + info('Nationality', me.nationality) + info('Occupation', me.occupation) + info('Civil status', me.civilStatus) + info('Blood type', me.bloodType) + info('Government ID type', me.idType) + info('Valid until', me.validUntil ? fmtDate(me.validUntil) : '') + '</div>' +
      '<h4 class="data-h">Photos and signature</h4><div class="data-photos">' + dataPhotos + '</div>' +
      '<h4 class="data-h">Family members and emergency contacts</h4><div class="data-family">' + dataFamily + '</div>' +
      '<div class="data-actions"><button type="button" class="btn secondary" id="downloadData">Download my information</button><span class="help">Downloads a JSON copy without the photos.</span></div></div></div>' +
      '</div></div></section>' +
      '</div></div></div>';

    bindPasswordToggles();

    /* ----- show / hide the side navigation -----
       Desktop: the sidebar collapses and the page widens. Phone: the sidebar slides in from the left over the page. */
    var dashEl = app.querySelector('.dash'), sideBtn = $('sideToggle'), phoneMq = window.matchMedia('(max-width: 860px)');
    function sideIsOpen() { return phoneMq.matches ? dashEl.classList.contains('side-open') : !dashEl.classList.contains('side-collapsed'); }
    function paintSideButton() {
      var open = sideIsOpen(), label = open ? 'Hide navigation menu' : 'Show navigation menu';
      sideBtn.setAttribute('aria-expanded', String(open));
      sideBtn.setAttribute('aria-label', label);
      sideBtn.title = label;
    }
    function setSide(open, remember) {
      if (phoneMq.matches) dashEl.classList.toggle('side-open', open);
      else {
        dashEl.classList.toggle('side-collapsed', !open);
        if (remember) { try { localStorage.setItem('ncrs_side', open ? '0' : '1'); } catch (e) {} }
      }
      paintSideButton();
    }
    var savedSide = null;
    try { savedSide = localStorage.getItem('ncrs_side'); } catch (e) {}
    dashEl.classList.toggle('side-collapsed', savedSide === '1');
    paintSideButton();
    sideBtn.onclick = function () { setSide(!sideIsOpen(), true); };
    $('dashBackdrop').onclick = function () { setSide(false, false); sideBtn.focus(); };
    dashEl.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && phoneMq.matches && dashEl.classList.contains('side-open')) { setSide(false, false); sideBtn.focus(); }
    });
    var onViewportChange = function () { dashEl.classList.remove('side-open'); paintSideButton(); };
    if (phoneMq.addEventListener) phoneMq.addEventListener('change', onViewportChange); else phoneMq.addListener(onViewportChange);

    /* ----- navigation ----- */
    app.querySelectorAll('[data-account-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () { selectAccountTab(tab.dataset.accountTab); if (phoneMq.matches) setSide(false, false); });
    });
    $('dashLogout').onclick = function () { window.logout(); };

    /* ----- enlarge a Civil ID card (rotates on phones held upright) ----- */
    app.querySelectorAll('#panel-civil-id .idframe').forEach(function (frame) {
      frame.setAttribute('role', 'button');
      frame.setAttribute('tabindex', '0');
      frame.setAttribute('aria-label', 'Enlarge this side of the Civil ID');
      frame.classList.add('id-zoomable');
      var open = function () {
        var layer = document.createElement('div');
        layer.className = 'id-zoom';
        layer.setAttribute('role', 'dialog');
        layer.setAttribute('aria-modal', 'true');
        layer.setAttribute('aria-label', 'Civil ID, enlarged');
        layer.innerHTML = '<button type="button" class="id-zoom-close" aria-label="Close enlarged ID">×</button><div class="id-zoom-inner"></div>';
        layer.querySelector('.id-zoom-inner').appendChild(frame.cloneNode(true));
        var close = function () { layer.remove(); document.removeEventListener('keydown', onKey); frame.focus(); };
        var onKey = function (e) { if (e.key === 'Escape') close(); };
        layer.onclick = close;
        document.addEventListener('keydown', onKey);
        document.body.appendChild(layer);
        layer.querySelector('.id-zoom-close').focus();
      };
      frame.onclick = open;
      frame.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });

    /* ----- theme ----- */
    function paintThemeButton() {
      var dark = themeIs() === 'dark';
      $('themeToggle').textContent = dark ? '☀ Light mode' : '☾ Dark mode';
    }
    paintThemeButton();
    $('themeToggle').onclick = function () { setTheme(themeIs() === 'dark' ? 'light' : 'dark'); paintThemeButton(); };
    app.querySelectorAll('[data-theme-choice]').forEach(function (b) {
      b.onclick = function () { setTheme(b.dataset.themeChoice); paintThemeButton(); };
    });

    /* ----- settings sub-tabs ----- */
    app.querySelectorAll('[data-set-tab]').forEach(function (b) {
      b.onclick = function () {
        app.querySelectorAll('[data-set-tab]').forEach(function (x) { x.classList.toggle('active', x === b); });
        app.querySelectorAll('[data-set-pane]').forEach(function (p) { p.hidden = p.dataset.setPane !== b.dataset.setTab; });
      };
    });
    $('pwForm').onsubmit = async function (event) {
      event.preventDefault();
      var cur = $('pwcur').value, next = $('pwnew').value;
      if (!cur) return msg('pwmsg', 'Enter your current password.');
      if (next.length < 8) return msg('pwmsg', 'New password must be at least 8 characters.');
      if (next !== $('pwnew2').value) return msg('pwmsg', 'New passwords do not match.');
      try {
        await api('/change-password', { method: 'POST', body: { current: cur, password: next } });
        this.reset();
        msg('pwmsg', 'Password updated.', true);
      } catch (error) { msg('pwmsg', error.message); }
    };
    $('downloadData').onclick = function () {
      var copy = {};
      Object.keys(me).forEach(function (k) { if (['idPhoto', 'facePhoto', 'signaturePhoto'].indexOf(k) === -1) copy[k] = me[k]; });
      var url = URL.createObjectURL(new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' }));
      var a = document.createElement('a');
      a.href = url; a.download = me.id + '-information.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    };

    /* ----- calendar ----- */
    var calDate = new Date(); calDate.setDate(1);
    function renderCalendar() {
      var y = calDate.getFullYear(), m = calDate.getMonth(), now = new Date();
      $('calTitle').textContent = calDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      var first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), prevDays = new Date(y, m, 0).getDate();
      var html = '<div class="cal-grid">' + ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map(function (d) { return '<span class="cal-dow">' + d + '</span>'; }).join('');
      for (var i = 0; i < 42; i++) {
        var n = i - first + 1, out = n < 1 || n > days, label = n < 1 ? prevDays + n : n > days ? n - days : n;
        var isToday = !out && y === now.getFullYear() && m === now.getMonth() && n === now.getDate();
        html += '<span class="cal-day' + (out ? ' out' : '') + (isToday ? ' today' : '') + '"' + (isToday ? ' aria-current="date"' : '') + '>' + label + '</span>';
      }
      $('calGrid').innerHTML = html + '</div>';
    }
    $('calPrev').onclick = function () { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); };
    $('calNext').onclick = function () { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); };
    renderCalendar();

    /* ----- missing documents: upload the Government ID later ----- */
    app.querySelectorAll('[data-go-tab]').forEach(function (b) { b.onclick = function () { selectAccountTab(b.dataset.goTab); }; });
    if ($('doc-form')) {
      var docPhoto = '';
      var docType = function () { return $('docidtype').value === 'other' ? $('docidtypeother').value.trim() : $('docidtype').value; };
      var paintDoc = function () {
        $('docbox').classList.toggle('has-photo', !!docPhoto);
        $('docprev').src = docPhoto || '';
        $('docplaceholder').hidden = !!docPhoto;
      };
      $('docidtype').onchange = function () { $('docidtypeotherwrap').hidden = this.value !== 'other'; msg('docmsg', ''); };
      $('docidfile').onchange = async function () {
        var file = this.files && this.files[0];
        if (!file) return;
        try { docPhoto = await readImage(file, 1280); paintDoc(); msg('docmsg', ''); }
        catch (error) { docPhoto = ''; this.value = ''; paintDoc(); msg('docmsg', error.message); }
      };
      $('doc-form').onsubmit = async function (event) {
        event.preventDefault();
        var type = docType();
        if (!type) return msg('docmsg', 'Select your Government ID type.');
        if (!docPhoto) return msg('docmsg', 'Choose a clear photo of your Government ID.');
        var submit = this.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
          var saved = await api('/upload-document', { method: 'POST', body: { idType: type, idPhoto: docPhoto } });
          activeResident = saved.resident;
          await viewCard();
        } catch (error) {
          msg('docmsg', error.message);
          submit.disabled = false;
        }
      };
    }

    /* ----- family form ----- */
    $('family-phone').addEventListener('input', function () { this.value = maskByMode(this.value, 'mobile'); });
    $('family-add-form').onsubmit = async function (event) {
      event.preventDefault();
      var addButton = this.querySelector('button[type="submit"]');
      var contact = {
        personId: '',
        name: $('family-name').value.trim().replace(/\s+/g, ' '),
        phone: normPhone($('family-phone').value),
        relationship: $('family-relationship').value,
        isEmergencyContact: true
      };
      if (contact.name.length < 2) return msg('family-add-msg', 'Enter the family member’s full name.');
      if (!/^09\d{9}$/.test(contact.phone)) return msg('family-add-msg', 'Enter a valid mobile number, like (+63)917-123-4567.');
      if (!contact.relationship) return msg('family-add-msg', 'Select the family relationship.');
      addButton.disabled = true;
      try {
        var saved = await api('/family-relations', { method: 'POST', body: contact });
        activeResident = saved.resident;
        await viewCard();
        msg('family-add-msg', saved.created
          ? (saved.registered ? 'Added to your family tree. This person already has a registered account.' : 'Saved as an emergency contact. They will appear in your family tree once they register their own account.')
          : saved.emergencyUpdated
            ? 'This family relationship already exists. Emergency Contact status was added without changing it.'
            : 'This family relationship already exists; no changes were needed.', true);
      } catch (error) {
        msg('family-add-msg', error.message);
        addButton.disabled = false;
      }
    };

    function selectAccountTab(name) {
      app.querySelectorAll('[data-account-tab]').forEach(function (tab) {
        var active = tab.dataset.accountTab === name;
        tab.classList.toggle('active', active);
        if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
      });
      app.querySelectorAll('.dash-panel').forEach(function (panel) {
        panel.hidden = panel.id !== 'panel-' + name;
      });
    }
    selectAccountTab(activeTabName);
  }

  /* ---------- boot ---------- */
  var view = document.body.dataset.view;
  initializeSession().then(function () {
    var logged = !!currentRecord();
    if (view === 'citizenLookup') viewLogin();
    else if (view === 'citizenRegister' || view === 'citizenRegisterDetails' || view === 'citizenRegisterVerify' || view === 'citizenRegisterReview') viewRegister();
    else if (view === 'forgot') viewForgot();
    else if (view === 'citizenCard') viewCard();
    else viewHome();

    $('homeLink').classList.toggle('show', view !== 'home');
    $('logoutLink').classList.toggle('show', logged);
    applySeal();
    if (view === 'citizenRegister' || view === 'citizenRegisterDetails' || view === 'citizenRegisterVerify') initRegistrationHelp();
  }).catch(function (error) {
    app.innerHTML = '<div class="card"><h2>Could not connect to the User API</h2><p class="sub">' + esc(error.message) + '</p></div>';
    applySeal();
  });
})();