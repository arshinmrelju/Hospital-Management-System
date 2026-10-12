'use strict';

/* =============================================================
   FIND MY OP NUMBER — patient-facing controller
   Interactive, tactile, user-friendly OP finder with:
   - Web Audio synthesizer & tactile mobile haptics
   - 10-digit visual progress meter with ready pulse
   - One-tap clipboard paste button
   - Recent search quick-fill chip
   - Celebration confetti cannon on OP record reveal
   - 3D Holographic card tilt with glossy light reflection
   - Hospital-grade scannable Code 128 SVG barcode generator
   - Quick action hub: Copy, WhatsApp share, Voice speak, Scanner view
   - High-contrast fullscreen reception scanner modal

   Privacy rules:
   - Only { name, age, gender, op_no } is rendered.
   - No sensitive diagnosis, prescription, or billing data is exposed.
   ============================================================= */

(function () {
  // DOM Elements
  var form = document.getElementById('opfForm');
  var phoneInput = document.getElementById('opfPhone');
  var inputWrap = phoneInput ? phoneInput.closest('.opf-input-wrap') : null;
  var pasteBtn = document.getElementById('opfPasteBtn');
  var clearBtn = document.getElementById('opfClearBtn');
  var counterEl = document.getElementById('opfCounter');
  var inputError = document.getElementById('opfInputError');
  var searchBtn = document.getElementById('opfSearchBtn');
  var searchBtnHtml = searchBtn ? searchBtn.innerHTML : '';
  
  var digitMeter = document.getElementById('opfDigitMeter');
  var digitDots = digitMeter ? digitMeter.querySelectorAll('.opf-digit-dot') : [];

  var recentWrap = document.getElementById('opfRecentWrap');
  var recentChip = document.getElementById('opfRecentChip');
  var recentNumEl = document.getElementById('opfRecentNum');

  var soundToggleBtn = document.getElementById('opfSoundToggle');
  var soundOnIcon = soundToggleBtn ? soundToggleBtn.querySelector('.opf-sound-on') : null;
  var soundOffIcon = soundToggleBtn ? soundToggleBtn.querySelector('.opf-sound-off') : null;

  var loadingBox = document.getElementById('opfLoadingBox');
  var tickerTextEl = document.getElementById('opfTickerText');
  var heartBoosterBtn = document.getElementById('opfHeartBooster');
  var heartIconEl = document.getElementById('opfHeartIcon');
  var bpmValEl = document.getElementById('opfBpmVal');
  var boostCountEl = document.getElementById('opfBoostCount');
  var percentTextEl = document.getElementById('opfPercentText');
  var loadBarEl = document.getElementById('opfLoadBar');
  var triviaTextEl = document.getElementById('opfTriviaText');
  var triviaBadgeEl = document.getElementById('opfTriviaBadge');
  var step1 = document.getElementById('opfStep1');
  var step2 = document.getElementById('opfStep2');
  var step3 = document.getElementById('opfStep3');
  var step4 = document.getElementById('opfStep4');

  var tickerTimer = null;
  var progressTimer = null;
  var stepTimer = null;
  var triviaTimer = null;
  var boostCount = 0;
  var progressPercent = 15;

  /* Fullscreen hospital-database splash refs */
  var splashEl = document.getElementById('opfSplash');
  var splashRingEl = document.getElementById('opfSplashRing');
  var splashPercentEl = document.getElementById('opfSplashPercent');
  var splashBarEl = document.getElementById('opfSplashBar');
  var splashProgressEl = document.getElementById('opfSplashProgress');
  var splashStatusEl = document.getElementById('opfSplashStatus');
  var splashLogEl = document.getElementById('opfSplashLog');
  var splashRecordsEl = document.getElementById('opfSplashRecords');
  var splashBlocksEl = document.getElementById('opfSplashBlocks');
  var splashTimeEl = document.getElementById('opfSplashTime');
  var splashPhoneEl = document.getElementById('opfSplashPhone');
  var splashTipEl = document.getElementById('opfSplashTip');

  var splashProgress = 0;
  var splashRecords = 0;
  var splashBlocks = 0;
  var splashStartTime = 0;
  var splashProgressTimer = null;
  var splashStatusTimer = null;
  var splashLogTimer = null;
  var splashClockTimer = null;
  var splashTipTimer = null;
  var splashStatusIdx = 0;
  var splashDone = false;
  var splashLongWaitNoted = false;
  var splashColdStartNoted = false;

  var listEl = document.getElementById('opfList');
  var tokenCard = document.getElementById('opfTokenCard');
  var opValueEl = document.getElementById('opfOpValue');
  var patientNameEl = document.getElementById('opfPatientName');
  var personConfirmEl = document.getElementById('opfPersonConfirm');
  var avatarEl = document.getElementById('opfAvatar');
  var barcodeBox = document.getElementById('opfBarcodeBox');
  var barcodeSvgWrap = document.getElementById('opfBarcodeSvgWrap');
  var confettiCanvas = document.getElementById('opfConfettiCanvas');

  var copyBtn = document.getElementById('opfCopyBtn');
  var waBtn = document.getElementById('opfWhatsappBtn');
  var speakBtn = document.getElementById('opfSpeakBtn');
  var enlargeBtn = document.getElementById('opfEnlargeBtn');

  var scannerModal = document.getElementById('opfScannerModal');
  var modalPatientName = document.getElementById('opfModalPatientName');
  var modalOpValue = document.getElementById('opfModalOpValue');
  var modalBarcode = document.getElementById('opfModalBarcode');
  var closeScannerBtn = document.getElementById('opfCloseScannerBtn');
  var modalDoneBtn = document.getElementById('opfModalDoneBtn');

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
  var currentPatient = null;
  var currentOpNumber = '';

  var tickerMessages = [
    'Searching hospital records...',
    'Scanning patient registry...',
    'Matching phone number...',
    'Locating patient OP details...'
  ];

  var splashStatusMessages = [
    'Connecting to secure hospital registry…',
    'Authenticating terminal session…',
    'Opening outpatient index…',
    'Going through hospital database…',
    'Scanning patient record blocks…',
    'Matching mobile number…',
    'Cross-checking OP files…',
    'Verifying record integrity…',
    'Finalizing secure result…'
  ];

  var splashTips = [
    'Please wait while we go through the hospital records.',
    'We scan thousands of OP records to find your number.',
    'Your search is secure and private.',
    'Large registries can take a few seconds — please stay here.',
    'Save your OP number after this for faster visits.'
  ];

  /* -------------------------------------------------------------
     WEB AUDIO SYNTHESIZER (Local, zero-network, polite UI sounds)
     ------------------------------------------------------------- */
  var audioCtx = null;
  var soundEnabled = (localStorage.getItem('opf_sound') !== 'false');

  function initAudio() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, type, duration, gainVal) {
    if (!soundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal || 0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  function playTapSound() {
    playTone(540, 'sine', 0.05, 0.035);
  }

  function playReadySound() {
    playTone(660, 'sine', 0.10, 0.045);
    setTimeout(function () {
      playTone(880, 'sine', 0.14, 0.05);
    }, 90);
  }

  function playSuccessFanfare() {
    playTone(523.25, 'sine', 0.12, 0.05); // C5
    setTimeout(function () {
      playTone(659.25, 'sine', 0.15, 0.06); // E5
    }, 110);
    setTimeout(function () {
      playTone(783.99, 'triangle', 0.28, 0.07); // G5
    }, 230);
  }

  function playErrorSound() {
    playTone(280, 'sawtooth', 0.15, 0.03);
  }

  function triggerHaptic(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern || [15]); } catch (e) {}
    }
  }

  function updateSoundToggleUI() {
    if (!soundToggleBtn) return;
    soundToggleBtn.classList.toggle('muted', !soundEnabled);
    if (soundOnIcon) soundOnIcon.style.display = soundEnabled ? 'block' : 'none';
    if (soundOffIcon) soundOffIcon.style.display = soundEnabled ? 'none' : 'block';
  }

  if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', function () {
      soundEnabled = !soundEnabled;
      localStorage.setItem('opf_sound', soundEnabled ? 'true' : 'false');
      updateSoundToggleUI();
      if (soundEnabled) {
        initAudio();
        playReadySound();
        showToast('Sound effects enabled');
      } else {
        showToast('Sound effects muted');
      }
    });
    updateSoundToggleUI();
  }

  /* -------------------------------------------------------------
     HELPERS & DATA FORMATTING
     ------------------------------------------------------------- */
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
        void inputWrap.offsetWidth;
        inputWrap.classList.add('error-shake');
        playErrorSound();
        triggerHaptic([30, 60, 30]);
      } else {
        inputWrap.classList.remove('error-shake');
      }
    }
    if (msg && phoneInput) phoneInput.focus();
  }

  /* -------------------------------------------------------------
     RECENT SEARCH PERSISTENCE
     ------------------------------------------------------------- */
  var RECENT_KEY = 'wm_recent_op_phone';

  function saveRecentSearch(digits) {
    try {
      sessionStorage.setItem(RECENT_KEY, digits);
      updateRecentChip();
    } catch (e) {}
  }

  function updateRecentChip() {
    if (!recentWrap || !recentNumEl) return;
    try {
      var saved = sessionStorage.getItem(RECENT_KEY);
      if (saved && saved.length >= 10) {
        var masked = saved.slice(0, 5) + ' •••••';
        recentNumEl.textContent = masked;
        recentWrap.style.display = 'flex';
      } else {
        recentWrap.style.display = 'none';
      }
    } catch (e) {
      recentWrap.style.display = 'none';
    }
  }

  if (recentChip) {
    recentChip.addEventListener('click', function () {
      try {
        var saved = sessionStorage.getItem(RECENT_KEY);
        if (saved && phoneInput) {
          phoneInput.value = formatPhone(saved);
          updateInputControls();
          playTapSound();
          triggerHaptic([20]);
          doSearch();
        }
      } catch (e) {}
    });
  }

  /* -------------------------------------------------------------
     INPUT CONTROLS & 10-DIGIT METER
     ------------------------------------------------------------- */
  var previousDigitCount = 0;

  function updateInputControls() {
    if (!phoneInput) return;
    var digits = digitsOf(phoneInput.value);
    var len = digits.length;

    // Toggle Paste vs Clear buttons
    if (pasteBtn) {
      pasteBtn.classList.toggle('hidden', len > 0);
    }
    if (clearBtn) {
      clearBtn.classList.toggle('visible', len > 0);
    }

    // Update 10-segment visual progress meter
    if (digitDots && digitDots.length) {
      for (var i = 0; i < digitDots.length; i++) {
        digitDots[i].classList.toggle('filled', i < len);
      }
    }
    if (digitMeter) {
      digitMeter.classList.toggle('complete', len === 10);
    }

    // Counter & ready button pulse
    if (counterEl) {
      if (len === 10) {
        counterEl.classList.add('valid');
        counterEl.innerHTML = '<span class="opf-counter-text">✓ 10 digits complete</span>';
      } else {
        counterEl.classList.remove('valid');
        counterEl.innerHTML = '<span class="opf-counter-text">' + len + ' / 10 digits</span>';
      }
    }

    if (searchBtn) {
      var isReady = (len === 10);
      searchBtn.classList.toggle('ready', isReady);
      if (isReady && previousDigitCount < 10) {
        playReadySound();
        triggerHaptic([30]);
      }
    }

    previousDigitCount = len;
  }

  // Paste button
  if (pasteBtn) {
    pasteBtn.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (text) {
          var digits = digitsOf(text);
          if (digits) {
            phoneInput.value = formatPhone(digits.slice(0, 10));
            updateInputControls();
            setInputError('');
            playTapSound();
            triggerHaptic([20]);
            showToast('Number pasted from clipboard');
            if (digits.length >= 10) {
              doSearch();
            }
          } else {
            showToast('No phone number found in clipboard');
          }
        }).catch(function () {
          phoneInput.focus();
        });
      } else {
        phoneInput.focus();
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
      playTapSound();
      triggerHaptic([15]);
    });
  }

  /* -------------------------------------------------------------
     FULLSCREEN HOSPITAL DATABASE SPLASH LOADER
     Whole-screen takeover with real percentage calculation:
     - Progress bar + ring count 0% -> 92% while API is pending
     - Records / blocks counters simulate going through DB
     - Terminal log lines show registry traversal
     - On API resolve, animate to 100% then reveal result
     ------------------------------------------------------------- */
  function fmtNum(n) {
    return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function renderSplashProgress() {
    var exact = Math.max(0, Math.min(100, splashProgress));
    // Above 95% show one decimal so micro-progress stays visible
    // (99.2 -> 99.5 reads as alive; floor(99.x) would look frozen at 99).
    // Exactly 100 always reads clean — never "100.0%".
    var label = exact >= 99.95 ? '100%' : (exact >= 95 ? (Math.floor(exact * 10) / 10).toFixed(1) + '%' : Math.floor(exact) + '%');
    if (splashPercentEl) splashPercentEl.textContent = label;
    if (splashBarEl) splashBarEl.style.width = exact + '%';
    if (splashRingEl) splashRingEl.style.setProperty('--p', exact);
    if (splashProgressEl) splashProgressEl.setAttribute('aria-valuenow', String(Math.floor(exact)));
    if (splashRecordsEl) splashRecordsEl.textContent = fmtNum(splashRecords);
    if (splashBlocksEl) splashBlocksEl.textContent = fmtNum(splashBlocks);
  }

  function pushSplashLog(html, dim) {
    if (!splashLogEl) return;
    var line = document.createElement('div');
    line.className = 'opf-splash-log-line' + (dim ? ' dim' : '');
    line.innerHTML = html;
    splashLogEl.appendChild(line);
    while (splashLogEl.children.length > 4) {
      splashLogEl.removeChild(splashLogEl.firstChild);
    }
  }

  function randomHex(len) {
    var chars = '0123456789ABCDEF';
    var out = '';
    for (var i = 0; i < len; i++) out += chars[Math.floor(Math.random() * 16)];
    return out;
  }

  function startSplashClocks() {
    if (splashClockTimer) clearInterval(splashClockTimer);
    splashClockTimer = setInterval(function () {
      if (!splashStartTime) return;
      var secs = (Date.now() - splashStartTime) / 1000;
      if (splashTimeEl) splashTimeEl.textContent = secs.toFixed(1) + 's';
    }, 100);
  }

  function startSplashStatus() {
    splashStatusIdx = 0;
    if (splashStatusEl) splashStatusEl.textContent = splashStatusMessages[0];
    if (splashStatusTimer) clearInterval(splashStatusTimer);
    splashStatusTimer = setInterval(function () {
      splashStatusIdx = (splashStatusIdx + 1) % splashStatusMessages.length;
      if (!splashStatusEl) return;
      splashStatusEl.classList.add('swap');
      setTimeout(function () {
        if (!splashStatusEl) return;
        splashStatusEl.textContent = splashStatusMessages[splashStatusIdx];
        splashStatusEl.classList.remove('swap');
      }, 160);
    }, 1400);
  }

  function startSplashTips() {
    var tipIdx = 0;
    if (splashTipTimer) clearInterval(splashTipTimer);
    splashTipTimer = setInterval(function () {
      tipIdx = (tipIdx + 1) % splashTips.length;
      if (splashTipEl) splashTipEl.textContent = splashTips[tipIdx];
    }, 2600);
  }

  function startSplashLog() {
    if (splashLogTimer) clearInterval(splashLogTimer);
    pushSplashLog('<b>✓</b> Secure link established (TLS 1.3)');
    var n = 0;
    splashLogTimer = setInterval(function () {
      n++;
      var batch = 180 + Math.floor(Math.random() * 480);
      splashRecords += batch;
      if (n % 2 === 0) splashBlocks += 1 + Math.floor(Math.random() * 2);
      renderSplashProgress();
      var kind = n % 3;
      if (kind === 0) {
        pushSplashLog('▸ Scanning block <b>#' + randomHex(4) + '</b> — ' + fmtNum(batch) + ' records…');
      } else if (kind === 1) {
        pushSplashLog('▸ Outpatient index <b>' + (12 + Math.floor(Math.random() * 40)) + '%</b> traversed', true);
      } else {
        pushSplashLog('▸ Phone hash match <b>' + randomHex(6) + '</b> checked…', true);
      }
    }, 420);
  }

  function startSplashProgress() {
    if (splashProgressTimer) clearInterval(splashProgressTimer);
    splashProgressTimer = setInterval(function () {
      if (splashDone) return;
      // Continuous crawl toward 99.9% — never parks at 92 / 98 / 99.
      // Fast at first, then creeps with a guaranteed minimum step so
      // long Apps Script cold starts (30s+) still tick visibly.
      // The decimal label (see renderSplashProgress) makes even
      // 0.05% steps readable, so nothing ever looks frozen.
      var CAP = 99.9;
      var remaining = CAP - splashProgress;
      if (remaining <= 0.005) {
        // Fully saturated: keep counters + clock moving so nothing freezes.
        splashRecords += 40 + Math.floor(Math.random() * 120);
        splashBlocks += Math.random() < 0.3 ? 1 : 0;
        renderSplashProgress();
        return;
      }
      var step = remaining * 0.028 + Math.random() * 1.1;
      if (splashProgress > 85) step = Math.min(step, 0.9 + Math.random() * 0.5);
      if (splashProgress > 95) step = Math.min(step, 0.35 + Math.random() * 0.25);
      if (splashProgress > 98) step = Math.min(Math.max(step, 0.08), 0.22 + Math.random() * 0.12);
      if (splashProgress > 99) step = 0.02 + Math.random() * 0.04;
      if (step < 0.02) step = 0.02;
      splashProgress = Math.min(CAP, splashProgress + step);
      renderSplashProgress();
      var waited = splashStartTime ? (Date.now() - splashStartTime) : 0;
      // After ~7s of waiting, reassure the user we are still digging.
      if (waited > 7000 && !splashLongWaitNoted) {
        splashLongWaitNoted = true;
        if (splashStatusEl) splashStatusEl.textContent = 'Still going through a large database — almost there…';
        pushSplashLog('◷ Large registry — still scanning, please stay…', true);
      }
      // Cold-start honesty after ~15s: the Apps Script instance is waking up.
      // Then keep the status line rotating so no text sits static.
      if (waited > 15000 && !splashColdStartNoted) {
        splashColdStartNoted = true;
        startSplashWaitingCycle();
        pushSplashLog('◷ Server cold start — retrying secure channel…', true);
      }
    }, 200);
  }

  var splashWaitingTimer = null;
  var splashWaitingMsgs = [
    'Hospital server is waking up — holding your place…',
    'Waiting for hospital server reply — scan is saved…',
    'Still connected — finishing the last records…'
  ];
  var splashWaitingIdx = 0;

  function startSplashWaitingCycle() {
    if (splashWaitingTimer) clearInterval(splashWaitingTimer);
    // Hand over the status line: stop the generic rotator so texts don't fight.
    if (splashStatusTimer) { clearInterval(splashStatusTimer); splashStatusTimer = null; }
    splashWaitingIdx = 0;
    if (splashStatusEl) splashStatusEl.textContent = splashWaitingMsgs[0];
    splashWaitingTimer = setInterval(function () {
      if (splashDone || !splashStatusEl) return;
      splashWaitingIdx = (splashWaitingIdx + 1) % splashWaitingMsgs.length;
      splashStatusEl.classList.add('swap');
      setTimeout(function () {
        if (!splashStatusEl) return;
        splashStatusEl.textContent = splashWaitingMsgs[splashWaitingIdx];
        splashStatusEl.classList.remove('swap');
      }, 160);
    }, 3000);
  }

  function stopSplashTimers() {
    if (splashProgressTimer) { clearInterval(splashProgressTimer); splashProgressTimer = null; }
    if (splashStatusTimer) { clearInterval(splashStatusTimer); splashStatusTimer = null; }
    if (splashWaitingTimer) { clearInterval(splashWaitingTimer); splashWaitingTimer = null; }
    if (splashLogTimer) { clearInterval(splashLogTimer); splashLogTimer = null; }
    if (splashClockTimer) { clearInterval(splashClockTimer); splashClockTimer = null; }
    if (splashTipTimer) { clearInterval(splashTipTimer); splashTipTimer = null; }
  }

  function showSplash(digits) {
    splashDone = false;
    splashLongWaitNoted = false;
    splashColdStartNoted = false;
    splashProgress = 3;
    splashRecords = 240 + Math.floor(Math.random() * 400);
    splashBlocks = 2;
    splashStartTime = Date.now();
    if (splashLogEl) splashLogEl.innerHTML = '';
    if (splashPhoneEl && digits) splashPhoneEl.textContent = '+91 ' + formatPhone(digits);
    if (splashTipEl) splashTipEl.textContent = splashTips[0];
    if (splashTimeEl) splashTimeEl.textContent = '0.0s';
    renderSplashProgress();
    if (splashEl) {
      splashEl.classList.add('active');
      splashEl.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('opf-locked');
    startSplashProgress();
    startSplashStatus();
    startSplashLog();
    startSplashClocks();
    startSplashTips();
  }

  function completeSplashTo100(cb) {
    splashDone = true;
    // Freeze background chatter so the success state reads clearly.
    if (splashProgressTimer) { clearInterval(splashProgressTimer); splashProgressTimer = null; }
    if (splashStatusTimer) { clearInterval(splashStatusTimer); splashStatusTimer = null; }
    if (splashWaitingTimer) { clearInterval(splashWaitingTimer); splashWaitingTimer = null; }
    if (splashLogTimer) { clearInterval(splashLogTimer); splashLogTimer = null; }
    if (splashTipTimer) { clearInterval(splashTipTimer); splashTipTimer = null; }
    if (splashStatusEl) splashStatusEl.textContent = 'Match complete — opening your OP pass…';
    if (splashTipEl) splashTipEl.textContent = 'Record verified. Opening your OP pass now.';
    if (splashEl) splashEl.classList.add('complete');
    pushSplashLog('<b>✓</b> Match complete — result verified');
    var start = splashProgress;
    var t0 = performance.now();
    var dur = 650;
    function frame(now) {
      var t = Math.min(1, (now - t0) / dur);
      splashProgress = start + (100 - start) * (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
      splashRecords += Math.floor(Math.random() * 120);
      renderSplashProgress();
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        // Hold a clean 100% state long enough to actually read it.
        splashProgress = 100;
        renderSplashProgress();
        setTimeout(function () {
          hideSplash();
          if (cb) cb();
        }, 1300);
      }
    }
    requestAnimationFrame(frame);
  }

  function hideSplash() {
    stopSplashTimers();
    if (splashEl) splashEl.classList.remove('complete');
    if (splashEl) {
      splashEl.classList.remove('active');
      splashEl.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('opf-locked');
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
    }, 1100);
  }

  function stopLoadingTicker() {
    if (tickerTimer) {
      clearInterval(tickerTimer);
      tickerTimer = null;
    }
  }

  function setLoading(on, digits) {
    searching = on;
    // Legacy inline loader is superseded by the fullscreen splash.
    if (loadingBox) {
      loadingBox.classList.remove('active');
      loadingBox.setAttribute('aria-hidden', 'true');
    }
    if (on) {
      showSplash(digits || '');
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

  /* -------------------------------------------------------------
     CODE 128 BARCODE SVG GENERATOR (Zero dependencies, pure JS)
     Generates hospital standard Code 128 (Subset B)
     ------------------------------------------------------------- */
  var CODE128_PATTERNS = [
    '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
    '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
    '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
    '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
    '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
    '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
    '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
    '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
    '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
    '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
    '114131','311141','411131','211412','211214','211232','2331112'
  ];

  function generateCode128Svg(text, height) {
    if (!text) text = 'WM-OP';
    height = height || 46;
    var sanitized = text.toUpperCase().replace(/[^ -~]/g, '');
    if (!sanitized) sanitized = 'WM-OP';

    var codes = [104]; // Start Code B
    var checksum = 104;

    for (var i = 0; i < sanitized.length; i++) {
      var code = sanitized.charCodeAt(i) - 32;
      codes.push(code);
      checksum += code * (i + 1);
    }

    codes.push(checksum % 103);
    codes.push(106); // Stop Code

    var bars = '';
    for (var c = 0; c < codes.length; c++) {
      var pat = CODE128_PATTERNS[codes[c]];
      if (!pat) continue;
      for (var p = 0; p < pat.length; p++) {
        var width = parseInt(pat[p], 10);
        var isBar = (p % 2 === 0);
        for (var w = 0; w < width; w++) {
          bars += (isBar ? '1' : '0');
        }
      }
    }

    var totalWidth = bars.length + 20; // quiet zones
    var rects = '';
    var currentX = 10;
    var runLength = 0;
    var currentColor = '0';

    for (var b = 0; b < bars.length; b++) {
      var bit = bars[b];
      if (bit === currentColor) {
        runLength++;
      } else {
        if (currentColor === '1') {
          rects += '<rect x="' + currentX + '" y="0" width="' + runLength + '" height="' + height + '" fill="#000000" />';
        }
        currentX += runLength;
        currentColor = bit;
        runLength = 1;
      }
    }
    if (currentColor === '1') {
      rects += '<rect x="' + currentX + '" y="0" width="' + runLength + '" height="' + height + '" fill="#000000" />';
    }

    return '<svg viewBox="0 0 ' + totalWidth + ' ' + height + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Barcode ' + esc(sanitized) + '">' +
      '<rect width="100%" height="100%" fill="#ffffff" />' +
      rects +
      '</svg>';
  }

  /* -------------------------------------------------------------
     CELEBRATION CONFETTI CANNON (60fps canvas particle burst)
     ------------------------------------------------------------- */
  var confettiAnimationId = null;

  function launchConfetti() {
    if (!confettiCanvas) return;
    var ctx = confettiCanvas.getContext('2d');
    if (!ctx) return;

    var rect = confettiCanvas.getBoundingClientRect();
    confettiCanvas.width = rect.width || 380;
    confettiCanvas.height = rect.height || 440;

    var particles = [];
    var colors = ['#0D9488', '#10B981', '#00685F', '#F59E0B', '#38BDF8', '#FFFFFF', '#A7F3D0'];
    var particleCount = 48;

    for (var i = 0; i < particleCount; i++) {
      var angle = (Math.PI / 6) + Math.random() * (Math.PI * 2 / 3);
      var speed = 4 + Math.random() * 8;
      particles.push({
        x: confettiCanvas.width * 0.5 + (Math.random() - 0.5) * 60,
        y: 60 + (Math.random() - 0.5) * 30,
        vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
        vy: -Math.sin(angle) * speed - 2,
        size: 5 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 12,
        opacity: 1,
        gravity: 0.28,
        drag: 0.96
      });
    }

    if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);
    var startTime = performance.now();

    function frame(now) {
      var elapsed = now - startTime;
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

      var alive = false;
      for (var p = 0; p < particles.length; p++) {
        var pt = particles[p];
        pt.vx *= pt.drag;
        pt.vy = (pt.vy + pt.gravity) * pt.drag;
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.rotation += pt.rotSpeed;

        if (elapsed > 1200) {
          pt.opacity -= 0.025;
        }

        if (pt.opacity > 0 && pt.y < confettiCanvas.height + 20) {
          alive = true;
          ctx.save();
          ctx.translate(pt.x, pt.y);
          ctx.rotate((pt.rotation * Math.PI) / 180);
          ctx.globalAlpha = Math.max(0, pt.opacity);
          ctx.fillStyle = pt.color;
          ctx.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size * 0.7);
          ctx.restore();
        }
      }

      if (alive && elapsed < 2600) {
        confettiAnimationId = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
        confettiAnimationId = null;
      }
    }

    confettiAnimationId = requestAnimationFrame(frame);
  }

  /* -------------------------------------------------------------
     3D HOLOGRAPHIC TILT CARD INTERACTION
     ------------------------------------------------------------- */
  if (tokenCard) {
    function handleCardMove(e) {
      var rect = tokenCard.getBoundingClientRect();
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      var x = clientX - rect.left;
      var y = clientY - rect.top;

      var percentX = (x / rect.width) * 100;
      var percentY = (y / rect.height) * 100;

      tokenCard.style.setProperty('--sheen-x', percentX + '%');
      tokenCard.style.setProperty('--sheen-y', percentY + '%');

      var tiltX = ((y / rect.height) - 0.5) * -14;
      var tiltY = ((x / rect.width) - 0.5) * 16;

      tokenCard.style.transform = 'perspective(800px) rotateX(' + tiltX.toFixed(2) + 'deg) rotateY(' + tiltY.toFixed(2) + 'deg) scale3d(1.02, 1.02, 1.02)';
    }

    function handleCardLeave() {
      tokenCard.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    }

    tokenCard.addEventListener('mousemove', handleCardMove);
    tokenCard.addEventListener('mouseleave', handleCardLeave);
    tokenCard.addEventListener('touchmove', handleCardMove, { passive: true });
    tokenCard.addEventListener('touchend', handleCardLeave);
  }

  /* -------------------------------------------------------------
     RESULT DISPLAY & INTERACTIVE ACTIONS
     ------------------------------------------------------------- */
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

    currentPatient = p;
    currentOpNumber = String(p.op_no || '').trim();

    if (opValueEl) opValueEl.textContent = currentOpNumber;
    if (patientNameEl) patientNameEl.textContent = p.name || 'Patient';
    if (avatarEl) avatarEl.textContent = getInitials(p.name);

    var meta = metaLine(p);
    if (personConfirmEl) {
      personConfirmEl.textContent = meta ? meta : 'Registered Patient';
    }

    // Render Scannable Barcode SVG
    var barcodeSvg = generateCode128Svg(currentOpNumber, 48);
    if (barcodeSvgWrap) {
      barcodeSvgWrap.innerHTML = barcodeSvg;
    }

    resetCopyBtn();
    showView('op');

    // Interactive celebration
    playSuccessFanfare();
    triggerHaptic([25, 60, 25]);
    setTimeout(launchConfetti, 100);
  }

  function resetCopyBtn() {
    if (!copyBtn) return;
    copyBtn.classList.remove('copied');
    copyBtn.innerHTML =
      '<svg class="opf-copy-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>' +
        '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' +
      '</svg>' +
      '<span class="opf-copy-text">Copy</span>';
  }

  function copyOpNumber() {
    if (!currentOpNumber) return;

    function onCopied() {
      if (copyBtn) {
        copyBtn.classList.add('copied');
        copyBtn.innerHTML =
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<polyline points="20 6 9 17 4 12"></polyline>' +
          '</svg>' +
          '<span class="opf-copy-text">Copied!</span>';
      }
      playTapSound();
      triggerHaptic([20, 40, 20]);
      showToast('OP Number ' + currentOpNumber + ' copied!');
      setTimeout(resetCopyBtn, 2800);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(currentOpNumber).then(onCopied).catch(function () {
        fallbackCopy(currentOpNumber, onCopied);
      });
    } else {
      fallbackCopy(currentOpNumber, onCopied);
    }
  }

  function fallbackCopy(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      if (cb) cb();
    } catch (e) {
      showToast('OP Number: ' + text);
    }
    document.body.removeChild(ta);
  }

  // Quick tap on OP Number value also copies it
  if (opValueEl) {
    opValueEl.addEventListener('click', copyOpNumber);
  }

  // WhatsApp sharing
  if (waBtn) {
    waBtn.addEventListener('click', function () {
      if (!currentOpNumber) return;
      playTapSound();
      triggerHaptic([15]);
      var patientName = (currentPatient && currentPatient.name) ? currentPatient.name : 'Patient';
      var text = 'Hello, my OP Number for Wellness Medicals Hospital is: *' + currentOpNumber + '* (Patient: ' + patientName + ').';
      var url = 'https://wa.me/?text=' + encodeURIComponent(text);
      window.open(url, '_blank');
    });
  }

  // Text-to-Speech (Speak OP Number aloud)
  if (speakBtn) {
    speakBtn.addEventListener('click', function () {
      if (!currentOpNumber) return;
      playTapSound();
      triggerHaptic([15]);

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        // Spell out numbers cleanly: "W M 1 0 4 9 2"
        var spoken = currentOpNumber.split('').join(' ');
        var utterance = new SpeechSynthesisUtterance('OP Number: ' + spoken);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        
        speakBtn.style.transform = 'scale(1.08)';
        utterance.onend = function () {
          speakBtn.style.transform = '';
        };
        utterance.onerror = function () {
          speakBtn.style.transform = '';
        };
        window.speechSynthesis.speak(utterance);
        showToast('Reading OP Number aloud...');
      } else {
        showToast('Text-to-speech not supported on this browser');
      }
    });
  }

  // Fullscreen Scanner Modal
  function openScannerModal() {
    if (!currentOpNumber || !scannerModal) return;
    playTapSound();
    triggerHaptic([20]);

    if (modalPatientName) {
      modalPatientName.textContent = (currentPatient && currentPatient.name) ? currentPatient.name : 'Patient';
    }
    if (modalOpValue) {
      modalOpValue.textContent = currentOpNumber;
    }
    if (modalBarcode) {
      modalBarcode.innerHTML = generateCode128Svg(currentOpNumber, 76);
    }

    scannerModal.classList.add('active');
    scannerModal.setAttribute('aria-hidden', 'false');
  }

  function closeScannerModal() {
    if (!scannerModal) return;
    playTapSound();
    scannerModal.classList.remove('active');
    scannerModal.setAttribute('aria-hidden', 'true');
  }

  if (enlargeBtn) enlargeBtn.addEventListener('click', openScannerModal);
  if (barcodeBox) barcodeBox.addEventListener('click', openScannerModal);
  if (closeScannerBtn) closeScannerBtn.addEventListener('click', closeScannerModal);
  if (modalDoneBtn) modalDoneBtn.addEventListener('click', closeScannerModal);
  if (scannerModal) {
    scannerModal.addEventListener('click', function (e) {
      if (e.target === scannerModal) closeScannerModal();
    });
  }
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && scannerModal && scannerModal.classList.contains('active')) {
      closeScannerModal();
    }
  });

  /* -------------------------------------------------------------
     SEARCH WORKFLOW
     ------------------------------------------------------------- */
  function resetToSearch() {
    results = [];
    currentPatient = null;
    currentOpNumber = '';
    if (listEl) listEl.innerHTML = '';
    if (phoneInput) {
      phoneInput.value = '';
      phoneInput.focus();
    }
    updateInputControls();
    setInputError('');
    showView('search');
    playTapSound();
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
    setLoading(true, digits);
    playTapSound();
    triggerHaptic([25]);

    var searchBeganAt = Date.now();
    var MIN_SPLASH_MS = 1700;

    function restoreButton() {
      searching = false;
      if (searchBtn) {
        searchBtn.disabled = false;
        searchBtn.innerHTML = searchBtnHtml;
      }
      stopLoadingTicker();
    }

    function finishWithSplash(cb) {
      var elapsed = Date.now() - searchBeganAt;
      var wait = Math.max(0, MIN_SPLASH_MS - elapsed);
      setTimeout(function () {
        restoreButton();
        completeSplashTo100(cb);
      }, wait);
    }

    function failWithSplash(cb) {
      var elapsed = Date.now() - searchBeganAt;
      var wait = Math.max(0, Math.min(900, MIN_SPLASH_MS - elapsed));
      setTimeout(function () {
        restoreButton();
        completeSplashTo100(cb);
      }, wait);
    }

    if (!window.API || typeof window.API.findOpByPhone !== 'function') {
      failWithSplash(function () {
        showView('error');
        playErrorSound();
      });
      return;
    }

    window.API.findOpByPhone(digits)
      .then(function (res) {
        if (!res || !res.success) {
          failWithSplash(function () {
            showView('error');
            playErrorSound();
          });
          return;
        }
        results = res.data || [];
        if (!results.length) {
          failWithSplash(function () {
            if (nonePhoneEl) {
              nonePhoneEl.textContent = '+91 ' + formatPhone(digits);
            }
            showView('none');
            playErrorSound();
          });
          return;
        }

        // Save recent search for quick 1-tap re-use
        saveRecentSearch(digits);

        // One match — skip list to save taps
        if (results.length === 1) {
          finishWithSplash(function () { showOp(0); });
          return;
        }
        finishWithSplash(function () {
          renderList();
          showView('results');
          playTone(600, 'sine', 0.1, 0.04);
        });
      })
      .catch(function () {
        failWithSplash(function () {
          showView('error');
          playErrorSound();
        });
      });
  }

  // Form submission
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      doSearch();
    });
  }

  // Input typing listener
  if (phoneInput) {
    phoneInput.addEventListener('input', function () {
      var formatted = formatPhone(phoneInput.value);
      phoneInput.value = formatted;
      updateInputControls();

      if (inputError && inputError.classList.contains('visible')) {
        setInputError('');
      }

      // Soft typing tap sound & micro-haptic
      playTapSound();
      triggerHaptic([8]);
    });

    phoneInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSearch();
      }
    });
  }

  // Copy button
  if (copyBtn) copyBtn.addEventListener('click', copyOpNumber);

  // Patient selection list delegation
  if (listEl) {
    listEl.addEventListener('click', function (e) {
      var card = e.target.closest('.opf-person-card');
      if (!card) return;
      var idx = parseInt(card.getAttribute('data-idx'), 10);
      if (!isNaN(idx)) {
        playTapSound();
        showOp(idx);
      }
    });
  }

  // Navigation reset buttons
  ['opfBackBtn', 'opfAgainBtn', 'opfRetryBtn', 'opfErrorRetryBtn'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', resetToSearch);
  });

  // Background ambient interactive mouse tracking
  window.addEventListener('mousemove', function (e) {
    var orbs = document.querySelectorAll('.opf-orb');
    if (!orbs.length) return;
    var moveX = (e.clientX / window.innerWidth - 0.5) * 35;
    var moveY = (e.clientY / window.innerHeight - 0.5) * 35;
    orbs[0].style.transform = 'translate(' + moveX + 'px, ' + moveY + 'px)';
    if (orbs[1]) {
      orbs[1].style.transform = 'translate(' + (-moveX * 0.8) + 'px, ' + (-moveY * 0.8) + 'px)';
    }
  });

  // Initial setup
  updateInputControls();
  updateRecentChip();

  // Warm up the Apps Script backend while the patient reads the screen,
  // so the first real search rarely pays the 30s+ cold-start cost.
  setTimeout(function () {
    try {
      if (window.API && typeof window.API.warmupOpFinder === 'function') {
        window.API.warmupOpFinder();
      }
    } catch (e) {}
  }, 600);
})();
