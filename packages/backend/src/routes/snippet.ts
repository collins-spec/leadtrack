import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { asyncHandler } from '../middleware/asyncHandler';

const p = (v: string | string[]): string => Array.isArray(v) ? v[0] : v;

const router = Router();

// ─── Inline JS Snippet Template ─────────────────────────────────────────────
// Stored as a template string so `tsc` includes it in the build output.
// Placeholders __ACCOUNT_ID__ and __API_BASE__ are replaced at serve-time.

const SNIPPET_TEMPLATE = `(function() {
  'use strict';

  var ACCOUNT_ID = '__ACCOUNT_ID__';
  var API_BASE   = '__API_BASE__';
  var SESSION_MINUTES = 30;
  var HEARTBEAT_INTERVAL_MS = 60000; // heartbeat every 60 seconds
  var _heartbeatTimer = null;
  var _currentSessionToken = null;

  // ── Bot Detection ──────────────────────────────────────────────────────────

  function isBot() {
    try {
      if (navigator.webdriver) return true;
      var ua = (navigator.userAgent || '').toLowerCase();
      var bots = ['bot','crawl','spider','slurp','lighthouse','pagespeed','headless','phantom','selenium','puppeteer'];
      for (var i = 0; i < bots.length; i++) {
        if (ua.indexOf(bots[i]) !== -1) return true;
      }
    } catch(e) {}
    return false;
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  function getUTMParams() {
    var params = {};
    try {
      var sp = new URLSearchParams(window.location.search);
      ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(function(k) {
        var v = sp.get(k);
        if (v) params[k.replace('utm_', '')] = v;
      });
      // Ads click IDs
      ['gclid','gbraid','wbraid'].forEach(function(k) {
        var v = sp.get(k);
        if (v) params[k] = v;
      });
    } catch(e) {}
    return params;
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, minutes) {
    var d = new Date();
    d.setTime(d.getTime() + minutes * 60 * 1000);
    document.cookie = name + '=' + encodeURIComponent(value) +
      ';expires=' + d.toUTCString() +
      ';path=/;SameSite=Lax';
  }

  // ── Visitor Fingerprint ────────────────────────────────────────────────────
  // Persistent UUID stored in localStorage, survives cookie clears.

  function getVisitorId() {
    var VID_KEY = '_lt_vid';
    try {
      var vid = localStorage.getItem(VID_KEY);
      if (vid) return vid;
      // Generate UUID v4
      vid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      localStorage.setItem(VID_KEY, vid);
      return vid;
    } catch(e) {
      // localStorage blocked — fallback to session cookie
      var fallback = getCookie(VID_KEY);
      if (fallback) return fallback;
      fallback = Math.random().toString(36).substring(2) + Date.now().toString(36);
      setCookie(VID_KEY, fallback, 43200); // 30 days
      return fallback;
    }
  }

  function sendData(url, data) {
    var json = JSON.stringify(data);
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([json], { type: 'application/json' });
        if (navigator.sendBeacon(url, blob)) return;
      }
    } catch(e) {}
    // Fallback: fetch with keepalive
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json,
        keepalive: true
      });
    } catch(e) {
      // Final fallback: XHR (fire-and-forget)
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(json);
      } catch(e2) {}
    }
  }

  // ── Heartbeat ──────────────────────────────────────────────────────────────
  // Extends session on page navigations and tab focus.

  function startHeartbeat(sessionToken) {
    _currentSessionToken = sessionToken;
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);

    function sendHeartbeat() {
      if (!_currentSessionToken) return;
      try {
        fetch(API_BASE + '/dni/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken: _currentSessionToken }),
          keepalive: true
        }).then(function(res) {
          return res.json();
        }).then(function(data) {
          if (data && data.newExpiry) {
            setCookie('_lt_session', _currentSessionToken, SESSION_MINUTES);
          }
        }).catch(function() {});
      } catch(e) {}
    }

    // Heartbeat on interval
    _heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Heartbeat on visibility change (tab comes back into focus)
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') sendHeartbeat();
    });
  }

  // ── Source-Change Detection ────────────────────────────────────────────────
  // Detects when a returning visitor arrives from a different UTM source.

  function detectSourceChange(utm) {
    var SKEY = '_lt_src';
    try {
      var prevSource = localStorage.getItem(SKEY);
      var currentSource = utm.source || null;
      if (currentSource) {
        localStorage.setItem(SKEY, currentSource);
      }
      // Source changed = had a previous source AND current is different
      if (prevSource && currentSource && prevSource !== currentSource) {
        return true;
      }
    } catch(e) {}
    return false;
  }

  // ── Form Tracking ──────────────────────────────────────────────────────────

  function captureFormData(form) {
    var data = {};
    for (var i = 0; i < form.elements.length; i++) {
      var el = form.elements[i];
      var key = el.name || el.id;
      if (!key) continue;
      // Skip sensitive & file inputs
      if (el.type === 'password' || el.type === 'file' || el.type === 'hidden') continue;
      if (el.type === 'checkbox') {
        data[key] = el.checked;
      } else if (el.type === 'radio') {
        if (el.checked) data[key] = el.value;
      } else if (el.tagName === 'SELECT') {
        data[key] = el.value;
      } else {
        data[key] = el.value;
      }
    }
    return data;
  }

  function handleFormSubmit(event) {
    try {
      var form = event.target;
      if (!form || form.tagName !== 'FORM') return;
      // Skip forms with data-leadtrack-ignore
      if (form.hasAttribute('data-leadtrack-ignore')) return;

      var utm = getUTMParams();
      var formData = captureFormData(form);

      // Don't send if formData is empty (no named fields)
      if (Object.keys(formData).length === 0) return;

      // Inject hidden DNI session fields
      formData._lt_session = _currentSessionToken || getCookie('_lt_session') || '';
      formData._lt_vid = getVisitorId();

      var payload = {
        accountId: ACCOUNT_ID,
        formData: formData,
        pageUrl: window.location.href,
        referrer: document.referrer || null,
        utmSource: utm.source || null,
        utmMedium: utm.medium || null,
        utmCampaign: utm.campaign || null,
        utmTerm: utm.term || null,
        utmContent: utm.content || null,
        gclid: utm.gclid || null
      };

      sendData(API_BASE + '/leads/form', payload);
    } catch(e) {
      // Never block form submission
    }
  }

  function initFormTracking() {
    document.addEventListener('submit', handleFormSubmit, true); // capture phase
  }

  // ── Dynamic Number Insertion ───────────────────────────────────────────────

  function formatPhone(e164, originalText) {
    // Convert +1XXXXXXXXXX to a format matching the original display
    var digits = e164.replace(/[^0-9]/g, '');
    if (digits.length === 11 && digits[0] === '1') digits = digits.substring(1);
    if (digits.length !== 10) return e164;

    var area = digits.substring(0, 3);
    var prefix = digits.substring(3, 6);
    var line = digits.substring(6, 10);

    // Detect original format
    if (/\\(/.test(originalText)) {
      return '(' + area + ') ' + prefix + '-' + line;
    } else if (/-/.test(originalText)) {
      return area + '-' + prefix + '-' + line;
    } else if (/\\./.test(originalText)) {
      return area + '.' + prefix + '.' + line;
    } else if (/\\s/.test(originalText)) {
      return area + ' ' + prefix + ' ' + line;
    }
    return e164; // Keep E.164 if format unclear
  }

  function swapNumbers(trackingNumber) {
    var elements = document.querySelectorAll('[data-leadtrack-number]');
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var originalText = el.textContent || '';

      // Store original for reference
      if (!el.getAttribute('data-leadtrack-original')) {
        el.setAttribute('data-leadtrack-original', originalText);
      }

      // Replace display text
      el.textContent = formatPhone(trackingNumber, originalText);

      // Update tel: href if it's an anchor
      if (el.tagName === 'A' && el.getAttribute('href') && el.getAttribute('href').indexOf('tel:') === 0) {
        el.setAttribute('href', 'tel:' + trackingNumber);
      }
    }
  }

  function initDNI() {
    var elements = document.querySelectorAll('[data-leadtrack-number]');
    if (elements.length === 0) return;

    var utm = getUTMParams();
    var sessionToken = getCookie('_lt_session');
    var visitorId = getVisitorId();
    var sourceChanged = detectSourceChange(utm);

    // If source changed, clear old session token to force new allocation
    if (sourceChanged) {
      sessionToken = null;
    }

    var payload = {
      accountId: ACCOUNT_ID,
      sessionToken: sessionToken || undefined,
      visitorId: visitorId,
      utmSource: utm.source || undefined,
      utmMedium: utm.medium || undefined,
      utmCampaign: utm.campaign || undefined,
      utmTerm: utm.term || undefined,
      utmContent: utm.content || undefined,
      gclid: utm.gclid || undefined,
      gbraid: utm.gbraid || undefined,
      wbraid: utm.wbraid || undefined,
      referrer: document.referrer || undefined,
      landingPage: window.location.href,
      ipAddress: undefined,
      userAgent: navigator.userAgent || undefined
    };

    try {
      fetch(API_BASE + '/dni/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (!data.trackingNumber || !data.sessionToken) return;

        // Store session cookie
        setCookie('_lt_session', data.sessionToken, SESSION_MINUTES);

        // Swap phone numbers on the page
        swapNumbers(data.trackingNumber);

        // Start heartbeat to keep session alive
        startHeartbeat(data.sessionToken);
      })
      .catch(function() {
        // Silently fail — keep original numbers
      });
    } catch(e) {
      // Silently fail
    }
  }

  // ── SPA Navigation Support ─────────────────────────────────────────────────
  // Detect client-side navigations (pushState, popstate) and re-run DNI swap.

  function initSPASupport() {
    var _pushState = history.pushState;
    history.pushState = function() {
      _pushState.apply(history, arguments);
      onSPANavigation();
    };
    window.addEventListener('popstate', onSPANavigation);
  }

  function onSPANavigation() {
    // Re-check for data-leadtrack-number elements (SPA may have re-rendered)
    setTimeout(function() {
      var elements = document.querySelectorAll('[data-leadtrack-number]');
      if (elements.length > 0 && _currentSessionToken) {
        // Re-swap with the existing tracking number from cookie
        var token = getCookie('_lt_session');
        if (token) {
          // Send heartbeat on navigation
          fetch(API_BASE + '/dni/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken: token }),
            keepalive: true
          }).catch(function() {});
        }
      }
    }, 100);
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  function init() {
    // Bail out if bot detected
    if (isBot()) return;

    initFormTracking();
    initDNI();
    initSPASupport();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();`;

// ─── Route Handler ───────────────────────────────────────────────────────────

router.get('/:accountId', asyncHandler(async (req: Request, res: Response) => {
  const accountId = p(req.params.accountId);

  // Verify account exists
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    res.status(404).type('application/javascript').send('// LeadTrack: Account not found');
    return;
  }

  const apiBase = env.BACKEND_URL + '/api';

  const js = SNIPPET_TEMPLATE
    .replace(/__ACCOUNT_ID__/g, accountId)
    .replace(/__API_BASE__/g, apiBase);

  res.set({
    'Content-Type': 'application/javascript',
    'Cache-Control': 'public, max-age=3600',
  });
  res.send(js);
}));

export default router;
