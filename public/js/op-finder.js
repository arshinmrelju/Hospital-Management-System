'use strict';

/* =============================================================
   FIND MY OP NUMBER — patient-facing controller
   Interactive, tactile, user-friendly OP finder with
   dynamic medical ECG loading ticker and clipboard support.

   Privacy rules for this screen:
   - Only { name, age, gender, op_no } is ever rendered.
   - Nothing is written to localStorage / IndexedDB from here.
   - No medical, address, billing or contact fields are shown.
   ============================================================= */

(function () {
  var form = document.getElementById('opfForm');
  var phoneInput = document.getElementById('opfPhone');
  var inputWrap = phoneInput ? phoneInput.closest('.opf-input-wrap') : null;
  var clearBtn = document.getElementById('opfClearBtn');
  var counterEl = document.getElementById('opfCounter');
  var inputError = document.getElementById('opfInputError');
  var searchBtn = document.getElementById('opfSearchBtn');
  var searchBtnHtml = searchBtn ? searchBtn.innerHTML : '';
  
  var loadingBox = document.getElementById('opfLoadingBox');
  var tickerTextEl = document.getElementById('opfTickerText');
  var tickerTimer = null;

  var listEl = document.getElementById('opfList');
  var opValueEl = document.getElementById('opfOpValue');
  var patientNameEl = document.getElementById('opfPatientName');
  var personConfirmEl = document.getElementById('opfPersonConfirm');
  var avatarEl = document.getElementById('opfAvatar');
  var copyBtn = document.getElementById('opfCopyBtn');
  var nonePhoneEl = document.getElementById('opfNonePhone');
  var toastEl = document.getElementById('opfToast');
  var toastTimeout = null;

  var views = {
    search: document.getElementById('opfViewSearch'),
    results: document.getElementById('opfViewResults'),
    op: document.getElementById('opfViewOp'),
    none: document.getElementById('opfViewNone'),
    error: document.getElementById('opfViewError')
  };

  var results = [];
  var searching = false;
  var currentOpNumber = '';

  var tickerMessages = [
    'Searching hospital records...',
    'Scanning patient registry...',
    'Matching phone number...',
    'Locating patient OP details...'
  ];

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

  /* Format 10 digit Indian numbers as 5 digits + space + 5 digits */
  function formatPhone(val) {
    var d = digitsOf(val);
    if (d.length <= 5) return d;
    if (d.length <= 10) return d.slice(0, 5) + ' ' + d.slice(5);
    return d.slice(0, 5) + ' ' + d.slice(5, 10) + ' ' + d.slice(10, 14);
  }

  function getInitials(name) {
    if (!name) return 'WM';
    var parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('visible');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function () {
      toastEl.classList.remove('visible');
    }, 2800);
  }

  function showView(name) {
    Object.keys(views).forEach(function (key) {
      if (views[key]) views[key].classList.toggle('active', key === name);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setInputError(msg) {
    if (!inputError) return;
    inputError.textContent = msg || '';
    inputError.classList.toggle('visible', !!msg);
    if (inputWrap) {
      if (msg) {
        inputWrap.classList.remove('error-shake');
        void inputWrap.offsetWidth; // trigger reflow
        inputWrap.classList.add('error-shake');
      } else {
        inputWrap.classList.remove('error-shake');
      }
    }
    if (msg && phoneInput) phoneInput.focus();
  }

  function updateInputControls() {
    if (!phoneInput) return;
    var digits = digitsOf(phoneInput.value);
    
    // Toggle clear button
    if (clearBtn) {
      clearBtn.classList.toggle('visible', phoneInput.value.length > 0);
    }

    // Update live digit counter
    if (counterEl) {
      var len = digits.length;
      if (len === 10) {
        counterEl.classList.add('valid');
        counterEl.innerHTML = '<span class="opf-counter-text">✓ 10 digits entered</span>';
      } else {
        counterEl.classList.remove('valid');
        counterEl.innerHTML = '<span class="opf-counter-text">' + len + ' / 10 digits</span>';
      }
    }
  }

  function startLoadingTicker() {
    if (!tickerTextEl) return;
    var idx = 0;
    tickerTextEl.textContent = tickerMessages[0];
    if (tickerTimer) clearInterval(tickerTimer);
    tickerTimer = setInterval(function () {
      idx = (idx + 1) % tickerMessages.length;
      tickerTextEl.style.opacity = '0';
      setTimeout(function () {
        if (!tickerTextEl) return;
        tickerTextEl.textContent = tickerMessages[idx];
        tickerTextEl.style.opacity = '1';
      }, 150);
    }, 1200);
  }

  function stopLoadingTicker() {
    if (tickerTimer) {
      clearInterval(tickerTimer);
      tickerTimer = null;
    }
  }

  function setLoading(on) {
    searching = on;
    if (loadingBox) {
      loadingBox.classList.toggle('active', on);
      loadingBox.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    if (searchBtn) {
      searchBtn.disabled = on;
      if (on) {
        searchBtn.innerHTML = '<span class="opf-spin-loader"></span> <span>SEARCHING RECORDS\u2026</span>';
        startLoadingTicker();
      } else {
        searchBtn.innerHTML = searchBtnHtml;
        stopLoadingTicker();
      }
    }
  }

  function metaLine(p) {
    var bits = [];
    if (p.age) bits.push('Age ' + p.age);
    if (p.gender) bits.push(p.gender);
    return bits.join(' \u00b7 ');
  }

  function renderList() {
    if (!listEl) return;
    var html = '';
    results.forEach(function (p, i) {
      var initials = getInitials(p.name);
      var metaHtml = '';
      if (p.age) metaHtml += '<span class="opf-tag">Age ' + esc(p.age) + '</span>';
      if (p.gender) metaHtml += '<span class="opf-tag">' + esc(p.gender) + '</span>';

      html +=
        '<div class="opf-person-card" role="listitem" data-idx="' + i + '">' +
          '<div class="opf-person-left">' +
            '<div class="opf-person-avatar">' + esc(initials) + '</div>' +
            '<div class="opf-person-info">' +
              '<div class="opf-person-name">' + esc(p.name) + '</div>' +
              (metaHtml ? '<div class="opf-person-meta">' + metaHtml + '</div>' : '') +
            '</div>' +
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

    currentOpNumber = p.op_no || '';
    if (opValueEl) opValueEl.textContent = currentOpNumber;
    if (patientNameEl) patientNameEl.textContent = p.name || 'Patient';
    if (avatarEl) avatarEl.textContent = getInitials(p.name);

    var meta = metaLine(p);
    if (personConfirmEl) {
      personConfirmEl.textContent = meta ? meta : 'Registered Patient';
    }

    // Reset copy button state
    resetCopyBtn();

    showView('op');

    // Subtle celebration haptic
    if (navigator.vibrate) {
      try { navigator.vibrate([35]); } catch (e) {}
    }
  }

  function resetCopyBtn() {
    if (!copyBtn) return;
    copyBtn.classList.remove('copied');
    copyBtn.innerHTML =
      '<svg class="opf-copy-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>' +
        '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' +
      '</svg>' +
      '<span class="opf-copy-text">Copy OP Number</span>';
  }

  function copyOpNumber() {
    if (!currentOpNumber) return;

    function onCopied() {
      if (copyBtn) {
        copyBtn.classList.add('copied');
        copyBtn.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<polyline points="20 6 9 17 4 12"></polyline>' +
          '</svg>' +
          '<span class="opf-copy-text">COPIED!</span>';
      }
      showToast('OP Number ' + currentOpNumber + ' copied to clipboard!');
      if (navigator.vibrate) {
        try { navigator.vibrate([25, 50, 25]); } catch (e) {}
      }
      setTimeout(resetCopyBtn, 2800);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(currentOpNumber).then(onCopied).catch(function () {
        fallbackCopy(currentOpNumber);
      });
    } else {
      fallbackCopy(currentOpNumber);
    }

    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        onCopied();
      } catch (e) {
        showToast('OP Number: ' + text);
      }
      document.body.removeChild(ta);
    }
  }

  function resetToSearch() {
    results = [];
    currentOpNumber = '';
    if (listEl) listEl.innerHTML = '';
    if (phoneInput) {
      phoneInput.value = '';
      phoneInput.focus();
    }
    updateInputControls();
    setInputError('');
    showView('search');
  }

  function doSearch() {
    if (searching) return;

    var raw = phoneInput ? phoneInput.value : '';
    var digits = digitsOf(raw);

    if (!digits) {
      setInputError('Please enter your mobile number.');
      return;
    }
    if (digits.length < 6 || digits.length > 15) {
      setInputError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setInputError('');
    setLoading(true);

    if (navigator.vibrate) {
      try { navigator.vibrate([20]); } catch (e) {}
    }

    window.API.findOpByPhone(digits)
      .then(function (res) {
        setLoading(false);
        if (!res || !res.success) {
          showView('error');
          return;
        }
        results = res.data || [];
        if (!results.length) {
          if (nonePhoneEl) {
            nonePhoneEl.textContent = '+91 ' + formatPhone(digits);
          }
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

  // Form submission
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      doSearch();
    });
  }

  // Input formatting & live validation
  if (phoneInput) {
    phoneInput.addEventListener('input', function () {
      var start = phoneInput.selectionStart;
      var prevLength = phoneInput.value.length;
      var formatted = formatPhone(phoneInput.value);

      phoneInput.value = formatted;
      updateInputControls();

      if (inputError && inputError.classList.contains('visible')) {
        setInputError('');
      }
    });

    phoneInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSearch();
      }
    });
  }

  // Clear button
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (phoneInput) {
        phoneInput.value = '';
        phoneInput.focus();
      }
      updateInputControls();
      setInputError('');
    });
  }

  // Copy button
  if (copyBtn) {
    copyBtn.addEventListener('click', copyOpNumber);
  }

  // Patient selection list delegation
  if (listEl) {
    listEl.addEventListener('click', function (e) {
      var card = e.target.closest('.opf-person-card');
      if (!card) return;
      var idx = parseInt(card.getAttribute('data-idx'), 10);
      if (!isNaN(idx)) showOp(idx);
    });
  }

  // Reset buttons
  ['opfBackBtn', 'opfAgainBtn', 'opfRetryBtn', 'opfErrorRetryBtn'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', resetToSearch);
  });

  // Initial setup
  updateInputControls();
})();

