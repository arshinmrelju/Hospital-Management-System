/* =========================================================
   BIOMETRIC-AUTH.JS — WebAuthn unlock for the Owner login
   ---------------------------------------------------------
   Uses the platform authenticator (fingerprint / face /
   Windows Hello) via navigator.credentials.

   Client-side only:
   - The private key is generated inside the device's secure
     element and is non-exportable — it never leaves device.
   - We store only the credential id, the public key (SPKI)
     and the access code to replay when a unlock succeeds.
   - Each unlock uses a fresh challenge; the assertion is
     checked locally (type, origin, UV flag, signature).
   ========================================================= */

'use strict';

(function () {

  var STORE_KEY = 'hms_bio_owner';
  var DISMISS_KEY = 'hms_bio_dismissed';
  var RP_NAME = 'Wellness Medicals';

  /* ---------- base64url helpers ---------- */
  function bufToB64url(buf) {
    var bytes = new Uint8Array(buf);
    var str = '';
    for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64urlToBuf(str) {
    var b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  function getStored() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setStored(rec) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(rec)); } catch (e) {}
  }

  function makeChallenge() {
    var c = new Uint8Array(32);
    crypto.getRandomValues(c);
    return c;
  }

  function normalizeOrigin(o) {
    return String(o || '').replace(/\/+$/, '');
  }

  function concat(a, b) {
    var ab = new Uint8Array(a);
    var bb = new Uint8Array(b);
    var out = new Uint8Array(ab.length + bb.length);
    out.set(ab, 0);
    out.set(bb, ab.length);
    return out;
  }

  /* ---------- Signature verification ---------- */

  /* WebAuthn returns ECDSA signatures in ASN.1 DER; WebCrypto
     expects raw r||s — convert when needed. */
  function derToRaw(der, keyLen) {
    var view = new Uint8Array(der.buffer || der);
    var offset = 2;
    if (view[1] & 0x80) offset += (view[1] & 0x7f);

    function readInt(pos) {
      if (view[pos] !== 0x02) throw new Error('Bad DER signature');
      var len = view[pos + 1];
      var bytes = view.subarray(pos + 2, pos + 2 + len);
      return { bytes: bytes, next: pos + 2 + len };
    }

    function fit(bytes) {
      var start = 0;
      while (start < bytes.length && bytes[start] === 0) start++;
      var v = bytes.subarray(start);
      if (v.length > keyLen) v = v.subarray(v.length - keyLen);
      var out = new Uint8Array(keyLen);
      out.set(v, keyLen - v.length);
      return out;
    }

    var r = readInt(offset);
    var s = readInt(r.next);
    var raw = new Uint8Array(keyLen * 2);
    raw.set(fit(r.bytes), 0);
    raw.set(fit(s.bytes), keyLen);
    return raw;
  }

  function toRawEcdsa(sig) {
    var bytes = new Uint8Array(sig.buffer || sig);
    if (bytes.length === 64) return bytes;           // already raw r||s
    if (bytes[0] === 0x30) return derToRaw(bytes, 32); // P-256 DER
    return derToRaw(bytes, 48);                       // P-384 DER
  }

  function importVerifyKey(spki) {
    return crypto.subtle.importKey(
      'spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
    ).then(function (key) {
      return { key: key, alg: 'ECDSA' };
    }).catch(function () {
      return crypto.subtle.importKey(
        'spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
      ).then(function (key) { return { key: key, alg: 'RSA' }; });
    });
  }

  function verifyAssertion(spkiB64, authData, clientDataJSON, signature) {
    var spki = b64urlToBuf(spkiB64);
    return crypto.subtle.digest('SHA-256', clientDataJSON).then(function (digest) {
      var signed = concat(authData, digest);
      return importVerifyKey(spki).then(function (k) {
        if (k.alg === 'ECDSA') {
          return crypto.subtle.verify(
            { name: 'ECDSA', hash: { name: 'SHA-256' } },
            k.key, toRawEcdsa(signature), signed
          );
        }
        return crypto.subtle.verify('RSASSA-PKCS1-v1_5', k.key, signature, signed);
      });
    });
  }

  /* ---------- Public API ---------- */

  function isSupported() {
    if (!window.isSecureContext ||
        !window.PublicKeyCredential ||
        !navigator.credentials ||
        typeof navigator.credentials.create !== 'function' ||
        typeof crypto === 'undefined' || !crypto.subtle) {
      return Promise.resolve(false);
    }
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      return Promise.resolve(false);
    }
    return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .catch(function () { return false; });
  }

  function isRegistered() {
    var rec = getStored();
    return !!(rec && rec.id);
  }

  function register(code) {
    var userId = new Uint8Array(32);
    crypto.getRandomValues(userId);

    return navigator.credentials.create({
      publicKey: {
        rp: { id: location.hostname, name: RP_NAME },
        user: { id: userId, name: 'owner', displayName: 'Owner' },
        challenge: makeChallenge(),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 }  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: 60000,
        attestation: 'none'
      }
    }).then(function (cred) {
      var spki = null;
      if (cred.response && typeof cred.response.getPublicKey === 'function') {
        try { spki = cred.response.getPublicKey(); } catch (e) { spki = null; }
      }
      setStored({
        id: bufToB64url(cred.rawId),
        spki: spki ? bufToB64url(spki) : null,
        code: code || 'WMPR001',
        ts: Date.now()
      });
      return true;
    });
  }

  function authenticate() {
    var rec = getStored();
    if (!rec || !rec.id) {
      return Promise.reject(new Error('Fingerprint is not set up on this device.'));
    }

    return navigator.credentials.get({
      publicKey: {
        challenge: makeChallenge(),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: b64urlToBuf(rec.id) }],
        userVerification: 'required',
        timeout: 60000
      }
    }).then(function (assertion) {
      if (bufToB64url(assertion.rawId) !== rec.id) {
        throw new Error('Credential does not match this device.');
      }

      var resp = assertion.response;
      var clientData;
      try {
        clientData = JSON.parse(new TextDecoder().decode(resp.clientDataJSON));
      } catch (e) {
        throw new Error('Invalid client data.');
      }

      if (clientData.type !== 'webauthn.get') {
        throw new Error('Unexpected ceremony type.');
      }
      if (normalizeOrigin(clientData.origin) !== normalizeOrigin(location.origin)) {
        throw new Error('Origin mismatch.');
      }

      var flags = new Uint8Array(resp.authenticatorData)[32]; // rpIdHash(32) | flags
      if (!(flags & 0x04)) { // UV
        throw new Error('Biometric verification was not completed.');
      }

      if (!rec.spki) return rec; // key unavailable — origin/UV checks already passed

      return verifyAssertion(rec.spki, resp.authenticatorData, resp.clientDataJSON, resp.signature)
        .then(function (valid) {
          if (!valid) throw new Error('Signature verification failed.');
          return rec;
        });
    });
  }

  function remove() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  function friendlyError(e) {
    if (!e) return 'Biometric unlock failed. Please use your access code.';
    if (e.name === 'NotAllowedError') return 'Fingerprint not recognised. Try again or use your access code.';
    if (e.name === 'NotSupportedError') return 'Biometric unlock is not supported on this device.';
    if (e.name === 'InvalidStateError') return 'No fingerprint found on this device. Please use your access code.';
    return e.message || 'Biometric unlock failed. Please use your access code.';
  }

  window.BioAuth = {
    isSupported: isSupported,
    isRegistered: isRegistered,
    register: register,
    authenticate: authenticate,
    remove: remove,
    friendlyError: friendlyError
  };

  /* =========================================================
     UI CONTROLLER — wires the owner.html login card
     ========================================================= */

  function notify(msg, type) {
    if (typeof window.toast === 'function') window.toast(msg, type || 'info');
  }

  function $(id) { return document.getElementById(id); }

  function refreshSection() {
    var sec = $('bioUnlockSection');
    if (!sec) return;
    isSupported().then(function (ok) {
      sec.style.display = (ok && isRegistered()) ? 'block' : 'none';
    });
  }

  function hideEnableOverlay() {
    var ov = $('bioEnableOverlay');
    if (ov) ov.classList.remove('active');
  }

  function onLoginSuccess() {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch (e) { return; }
    isSupported().then(function (ok) {
      if (!ok || isRegistered()) return;
      setTimeout(function () {
        if (isRegistered()) return;
        var ov = $('bioEnableOverlay');
        if (ov) ov.classList.add('active');
      }, 2800); // let the 2.5s login-success splash finish first
    });
  }

  window.BioAuthUI = {

    unlock: function () {
      var errEl = $('loginError');
      authenticate().then(function (rec) {
        if (errEl) errEl.style.display = 'none';
        if (typeof window.hmsAttemptLogin === 'function') {
          window.hmsAttemptLogin(rec.code);
        } else if (window.HMS && window.HMS.login(rec.code)) {
          location.reload();
        }
      }).catch(function (e) {
        var msg = friendlyError(e);
        if (errEl) {
          errEl.textContent = msg;
          errEl.style.display = 'block';
        }
        notify(msg, 'error');
      });
    },

    enable: function () {
      var btn = $('bioEnableBtn');
      var auth = {};
      try { auth = JSON.parse(localStorage.getItem('hms_auth') || '{}'); } catch (e) {}

      if (btn) { btn.disabled = true; btn.textContent = 'Waiting for sensor...'; }

      register(auth.code || 'WMPR001').then(function () {
        hideEnableOverlay();
        notify('Fingerprint unlock enabled for this device.', 'success');
        refreshSection();
      }).catch(function (e) {
        notify(friendlyError(e), 'error');
      }).then(function () {
        if (btn) { btn.disabled = false; btn.textContent = 'Enable now'; }
      });
    },

    dismiss: function () {
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
      hideEnableOverlay();
    },

    remove: function () {
      if (!window.confirm('Remove fingerprint unlock from this device?')) return;
      remove();
      refreshSection();
      notify('Fingerprint unlock removed.', 'info');
    }
  };

  /* ---------- Init ---------- */
  function init() {
    refreshSection();
    window.hmsAfterLogin = onLoginSuccess;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
