'use strict';

/* =============================================================
   FIND MY OP NUMBER — patient-facing controller
   Journey: enter mobile number → select your name → see OP number
   → tell the receptionist.

   Privacy rules for this screen:
   - Only { name, age, gender, op_no } is ever rendered.
   - Nothing is written to localStorage / IndexedDB from here.
   - No medical, address, billing or contact fields are shown.
   ============================================================= */

(function () {
  var form = document.getElementById('opfForm');
  var phoneInput = document.getElementById('opfPhone');
  var inputError = document.getElementById('opfInputError');
  var searchBtn = document.getElementById('opfSearchBtn');
  var searchBtnHtml = searchBtn ? searchBtn.innerHTML : '';
  var listEl = document.getElementById('opfList');
  var opValueEl = document.getElementById('opfOpValue');
  var personConfirmEl = document.getElementById('opfPersonConfirm');

  var views = {
    search: document.getElementById('opfViewSearch'),
    results: document.getElementById('opfViewResults'),
    op: document.getElementById('opfViewOp'),
    none: document.getElementById('opfViewNone'),
    error: document.getElementById('opfViewError')
  };

  var results = [];
  var searching = false;

  /* Escape anything coming from the sheet before it touches innerHTML */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function digitsOf(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[^0-9]/g, '');
  }

  function showView(name) {
    Object.keys(views).forEach(function (key) {
      if (views[key]) views[key].classList.toggle('active', key === name);
    });
    window.scrollTo(0, 0);
  }

  function setInputError(msg) {
    if (!inputError) return;
    inputError.textContent = msg || '';
    inputError.classList.toggle('visible', !!msg);
    if (msg && phoneInput) phoneInput.focus();
  }

  function setLoading(on) {
    searching = on;
    if (!searchBtn) return;
    searchBtn.disabled = on;
    searchBtn.innerHTML = on ? '<span class="opf-spin"></span> SEARCHING\u2026' : searchBtnHtml;
  }

  function metaLine(p) {
    var bits = [];
    if (p.age) bits.push('Age ' + p.age);
    if (p.gender) bits.push(p.gender);
    return bits.join(' \u00b7 ');
  }

  function renderList() {
    var html = '';
    results.forEach(function (p, i) {
      var meta = metaLine(p);
      html +=
        '<div class="opf-person-card" role="listitem">' +
          '<div class="opf-person-info">' +
            '<div class="opf-person-name">' + esc(p.name) + '</div>' +
            (meta ? '<div class="opf-person-meta">' + esc(meta) + '</div>' : '') +
          '</div>' +
          '<button class="opf-select-btn" type="button" data-idx="' + i + '">SELECT</button>' +
        '</div>';
    });
    listEl.innerHTML = html;
  }

  function showOp(idx) {
    var p = results[idx];
    if (!p) {
      resetToSearch();
      return;
    }
    opValueEl.textContent = p.op_no;
    var confirmBits = [];
    if (p.name) confirmBits.push(p.name);
    var meta = metaLine(p);
    if (meta) confirmBits.push(meta);
    personConfirmEl.textContent = confirmBits.join(' \u00b7 ');
    showView('op');
  }

  function resetToSearch() {
    results = [];
    if (listEl) listEl.innerHTML = '';
    if (phoneInput) phoneInput.value = '';
    setInputError('');
    showView('search');
  }

  function doSearch() {
    if (searching) return;

    var raw = phoneInput.value;
    var digits = digitsOf(raw);

    if (!digits) {
      setInputError('Please enter your mobile number.');
      return;
    }
    if (digits.length < 6 || digits.length > 15) {
      setInputError('Please enter a valid mobile number.');
      return;
    }

    setInputError('');
    setLoading(true);

    window.API.findOpByPhone(raw)
      .then(function (res) {
        setLoading(false);
        if (!res || !res.success) {
          showView('error');
          return;
        }
        results = res.data || [];
        if (!results.length) {
          showView('none');
          return;
        }
        /* One match — skip the selection step to save taps */
        if (results.length === 1) {
          showOp(0);
          return;
        }
        renderList();
        showView('results');
      })
      .catch(function () {
        setLoading(false);
        showView('error');
      });
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      doSearch();
    });
  }

  if (phoneInput) {
    phoneInput.addEventListener('input', function () {
      var cleaned = phoneInput.value.replace(/[^0-9+\-() ]/g, '');
      if (cleaned !== phoneInput.value) phoneInput.value = cleaned;
      if (inputError && inputError.classList.contains('visible')) setInputError('');
    });
  }

  if (listEl) {
    listEl.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.opf-select-btn') : null;
      if (!btn) return;
      var idx = parseInt(btn.getAttribute('data-idx'), 10);
      if (!isNaN(idx)) showOp(idx);
    });
  }

  ['opfBackBtn', 'opfAgainBtn', 'opfRetryBtn', 'opfErrorRetryBtn'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', resetToSearch);
  });
})();
