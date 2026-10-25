/**
 * Automated Test Suite for BK MOT Centre Contact API & Worker
 * Tests input validation, security controls, XSS escaping, mocked Resend integration,
 * Turnstile fail-closed verification, and no-cache policies.
 */

const assert = require('assert');
const { onRequestPost, onRequestOptions } = require('../functions/api/contact.js');

let testsPassed = 0;
let testsFailed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    testsFailed++;
  }
}

function createMockRequest({ method = 'POST', headers = {}, body = null, url = 'https://bkmotcentre.uk/api/contact' } = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Origin': 'https://bkmotcentre.uk',
    ...headers
  };

  const bodyText = typeof body === 'string' ? body : JSON.stringify(body);

  return {
    method,
    url,
    headers: {
      get: (header) => {
        const lower = header.toLowerCase();
        for (const [k, v] of Object.entries(defaultHeaders)) {
          if (k.toLowerCase() === lower) return v;
        }
        return null;
      }
    },
    text: async () => bodyText,
    json: async () => JSON.parse(bodyText)
  };
}

async function runAllTests() {
  console.log('\n=== RUNNING BK MOT CENTRE CONTACT API TESTS ===\n');

  // Test 1: Rejection of invalid HTTP Content-Type
  await runTest('Invalid Content-Type rejection (returns 415)', async () => {
    const req = createMockRequest({
      headers: { 'Content-Type': 'text/plain' },
      body: { name: 'John Doe', phone: '01215589215' }
    });
    const res = await onRequestPost({ request: req, env: {} });
    assert.strictEqual(res.status, 415);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
  });

  // Test 2: Rejection of untrusted Origin without reflecting arbitrary origin
  await runTest('Untrusted Origin rejection (returns 403 & no arbitrary origin reflection)', async () => {
    const req = createMockRequest({
      headers: { 'Origin': 'https://malicious-scam-site.com' },
      body: { name: 'John Doe', phone: '01215589215' }
    });
    const res = await onRequestPost({ request: req, env: {} });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.notStrictEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://malicious-scam-site.com');
  });

  // Test 3: Empty name validation
  await runTest('Missing/Empty name validation (returns 400)', async () => {
    const req = createMockRequest({
      body: { name: '', phone: '01215589215', service: 'MOT', message: 'Hello garage' }
    });
    const res = await onRequestPost({ request: req, env: {} });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('name'));
  });

  // Test 4: Invalid phone validation
  await runTest('Invalid phone format validation (returns 400)', async () => {
    const req = createMockRequest({
      body: { name: 'Sarah Connor', phone: '123', service: 'MOT', message: 'Need an MOT inspection' }
    });
    const res = await onRequestPost({ request: req, env: {} });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('phone'));
  });

  // Test 5: Invalid service not in whitelist
  await runTest('Unwhitelisted service option rejection (returns 400)', async () => {
    const req = createMockRequest({
      body: { name: 'Bob Smith', phone: '07123456789', service: 'HackingService', message: 'Test message' }
    });
    const res = await onRequestPost({ request: req, env: {} });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('service'));
  });

  // Test 6: Invalid email format
  await runTest('Invalid email format validation (returns 400)', async () => {
    const req = createMockRequest({
      body: { name: 'Bob Smith', phone: '07123456789', email: 'not-an-email', service: 'MOT', message: 'Test message' }
    });
    const res = await onRequestPost({ request: req, env: {} });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('email'));
  });

  // Test 7: Oversized payload (> 50KB)
  await runTest('Oversized payload rejection (returns 413)', async () => {
    const largeMessage = 'A'.repeat(60 * 1024);
    const req = createMockRequest({
      body: { name: 'Bob Smith', phone: '07123456789', service: 'MOT', message: largeMessage }
    });
    const res = await onRequestPost({ request: req, env: {} });
    assert.strictEqual(res.status, 413);
  });

  // Test 8: Fail-safe behavior when TURNSTILE_SECRET_KEY is missing (Mandatory fail-closed, returns 503)
  await runTest('Missing mandatory TURNSTILE_SECRET_KEY returns safe 503 (Fail-Closed)', async () => {
    const req = createMockRequest({
      body: {
        name: 'David Wilson',
        phone: '01215589215',
        service: 'MOT',
        message: 'Looking to book an MOT for Saturday',
        turnstileToken: 'valid_looking_token'
      }
    });
    // Environment missing TURNSTILE_SECRET_KEY
    const env = {
      RESEND_API_KEY: 're_test_mock_secret_key',
      CONTACT_TO_EMAIL: 'garage@bkmotcentre.uk'
    };
    const res = await onRequestPost({ request: req, env });
    assert.strictEqual(res.status, 503);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes('0121 558 9215'));
    assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
  });

  // Test 9: Fail-safe behavior when RESEND_API_KEY is missing (returns 503)
  await runTest('Missing RESEND_API_KEY returns safe 503 without crashing', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (url.includes('turnstile/v0/siteverify')) {
        return { ok: true, json: async () => ({ success: true }) };
      }
      return originalFetch(url);
    };

    try {
      const req = createMockRequest({
        body: {
          name: 'David Wilson',
          phone: '01215589215',
          service: 'MOT',
          message: 'Looking to book an MOT for Saturday',
          turnstileToken: 'mock_turnstile_token'
        }
      });
      // Missing RESEND_API_KEY
      const env = {
        TURNSTILE_SECRET_KEY: '0x4AAAAAAFlMW_secret',
        CONTACT_TO_EMAIL: 'garage@bkmotcentre.uk'
      };
      const res = await onRequestPost({ request: req, env });
      assert.strictEqual(res.status, 503);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('0121 558 9215'));
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Test 10: Successful mocked Resend dispatch with Turnstile verified
  await runTest('Successful Resend dispatch with mocked fetch (returns 200 & ref ID)', async () => {
    const originalFetch = global.fetch;
    let interceptedPayload = null;

    global.fetch = async (url, options) => {
      if (url.includes('turnstile/v0/siteverify')) {
        return {
          ok: true,
          json: async () => ({ success: true })
        };
      }
      if (url === 'https://api.resend.com/emails') {
        interceptedPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'mock_msg_987654321' })
        };
      }
      return originalFetch(url, options);
    };

    try {
      const req = createMockRequest({
        body: {
          name: 'James Bond <script>alert("xss")</script>',
          phone: '07999888777',
          email: 'agent007@mi6.gov.uk',
          service: 'DPF Cleaning',
          message: 'DPF warning light illuminated on dashboard.',
          turnstileToken: 'mock_verified_token'
        }
      });

      const env = {
        TURNSTILE_SECRET_KEY: '0x4AAAAAAFlMW_secret',
        RESEND_API_KEY: 're_test_mock_secret_key',
        CONTACT_FROM_EMAIL: 'BK MOT Centre <bookings@bkmotcentre.uk>',
        CONTACT_TO_EMAIL: 'garage@bkmotcentre.uk'
      };

      const res = await onRequestPost({ request: req, env });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.ref.startsWith('BK-'));
      assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');

      // Verify XSS escaping inside HTML body
      assert.ok(interceptedPayload.html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
      assert.ok(!interceptedPayload.html.includes('<script>alert("xss")</script>'));
      assert.strictEqual(interceptedPayload.reply_to, 'agent007@mi6.gov.uk');
      assert.strictEqual(interceptedPayload.to[0], 'garage@bkmotcentre.uk');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Test 11: Resend API failure handling (returns 502)
  await runTest('Resend upstream API error handling (returns 502)', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (url.includes('turnstile/v0/siteverify')) {
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url === 'https://api.resend.com/emails') {
        return {
          ok: false,
          status: 403,
          json: async () => ({ message: 'Domain not verified' })
        };
      }
      return originalFetch(url);
    };

    try {
      const req = createMockRequest({
        body: {
          name: 'David Test',
          phone: '01215589215',
          service: 'Car Servicing',
          message: 'Full service request',
          turnstileToken: 'mock_verified_token'
        }
      });

      const env = {
        TURNSTILE_SECRET_KEY: '0x4AAAAAAFlMW_secret',
        RESEND_API_KEY: 're_test_invalid_key',
        CONTACT_TO_EMAIL: 'garage@bkmotcentre.uk'
      };

      const res = await onRequestPost({ request: req, env });
      assert.strictEqual(res.status, 502);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('0121 558 9215'));
      assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Test 12: Turnstile - Missing token when TURNSTILE_SECRET_KEY is configured (returns 400)
  await runTest('Turnstile: Missing token when secret is configured (returns 400)', async () => {
    const req = createMockRequest({
      body: {
        name: 'Bot Tester',
        phone: '01215589215',
        service: 'MOT',
        message: 'Spam automated message without token'
      }
    });

    const env = {
      RESEND_API_KEY: 're_test_mock_key',
      CONTACT_TO_EMAIL: 'garage@bkmotcentre.uk',
      TURNSTILE_SECRET_KEY: '0x4AAAAAAFlMW_secret'
    };

    const res = await onRequestPost({ request: req, env });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes('Security verification'));
    assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
  });

  // Test 13: Turnstile - Failed verification response from Cloudflare siteverify (returns 403)
  await runTest('Turnstile: Failed verification check (returns 403)', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (url.includes('turnstile/v0/siteverify')) {
        return {
          ok: true,
          json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] })
        };
      }
      return originalFetch(url);
    };

    try {
      const req = createMockRequest({
        body: {
          name: 'Bot Tester',
          phone: '01215589215',
          service: 'MOT',
          message: 'Failed challenge test',
          turnstileToken: 'invalid_token_123'
        }
      });

      const env = {
        RESEND_API_KEY: 're_test_mock_key',
        CONTACT_TO_EMAIL: 'garage@bkmotcentre.uk',
        TURNSTILE_SECRET_KEY: '0x4AAAAAAFlMW_secret'
      };

      const res = await onRequestPost({ request: req, env });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.error.includes('Security verification failed'));
      assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Test 14: WWW to Apex Canonical 301 Redirect preserving path and query string
  await runTest('Worker WWW redirect preserves path and query string', async () => {
    const workerModule = await import('../src/worker.js');
    const worker = workerModule.default;

    const testUrl = 'https://www.bkmotcentre.uk/services/?query=brakes&filter=all#details';
    const req = new Request(testUrl);
    const res = await worker.fetch(req, {}, {});

    assert.strictEqual(res.status, 301);
    const location = res.headers.get('Location');
    assert.strictEqual(location, 'https://bkmotcentre.uk/services/?query=brakes&filter=all#details');
  });

  // Test 15: OPTIONS preflight with untrusted origin rejected without reflection (returns 403)
  await runTest('OPTIONS preflight rejects untrusted origin without reflecting origin (returns 403)', async () => {
    const req = createMockRequest({
      method: 'OPTIONS',
      headers: { 'Origin': 'https://attacker-domain.evil' }
    });
    const res = await onRequestOptions({ request: req, env: {} });
    assert.strictEqual(res.status, 403);
    assert.notStrictEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://attacker-domain.evil');
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), null);
    assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
  });

  // Test 16: OPTIONS preflight with allowed origin returns 204 with no-cache headers
  await runTest('OPTIONS preflight allows whitelisted origin (returns 204 with CORS & no-cache)', async () => {
    const req = createMockRequest({
      method: 'OPTIONS',
      headers: { 'Origin': 'https://bkmotcentre.uk' }
    });
    const res = await onRequestOptions({ request: req, env: {} });
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://bkmotcentre.uk');
    assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('POST'));
    assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
  });

  // Test 17: Worker Integration - OPTIONS /api/contact with untrusted origin rejects (returns 403, no allow-origin)
  await runTest('Worker Integration: OPTIONS /api/contact with untrusted origin returns 403 with no allow-origin', async () => {
    const workerModule = await import('../src/worker.js');
    const worker = workerModule.default;

    const req = new Request('https://bkmotcentre.uk/api/contact', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://malicious-external-attacker.com'
      }
    });

    const res = await worker.fetch(req, {}, {});
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), null);
    assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
    assert.strictEqual(res.headers.get('Pragma'), 'no-cache');
    assert.strictEqual(res.headers.get('Expires'), '0');
  });

  // Test 18: Worker Integration - OPTIONS /api/contact with trusted production origin (returns 204 with matching CORS & no-cache)
  await runTest('Worker Integration: OPTIONS /api/contact with trusted production origin returns 204 with CORS & no-cache', async () => {
    const workerModule = await import('../src/worker.js');
    const worker = workerModule.default;

    const req = new Request('https://bkmotcentre.uk/api/contact', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://bkmotcentre.uk'
      }
    });

    const res = await worker.fetch(req, {}, {});
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://bkmotcentre.uk');
    assert.ok(res.headers.get('Access-Control-Allow-Methods').includes('POST'));
    assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
    assert.strictEqual(res.headers.get('Pragma'), 'no-cache');
    assert.strictEqual(res.headers.get('Expires'), '0');
  });

  // Test 19: Worker Integration - POST /api/contact verifies no-cache headers on worker API responses
  await runTest('Worker Integration: POST /api/contact verifies no-cache headers on response', async () => {
    const workerModule = await import('../src/worker.js');
    const worker = workerModule.default;

    const req = new Request('https://bkmotcentre.uk/api/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://bkmotcentre.uk'
      },
      body: JSON.stringify({ name: 'A' }) // Invalid name length will return 400
    });

    const res = await worker.fetch(req, {}, {});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');
    assert.strictEqual(res.headers.get('Pragma'), 'no-cache');
    assert.strictEqual(res.headers.get('Expires'), '0');
  });

  // Test 20: Browser-level Integration Test - Form submission uses JSON fetch rather than document navigation
  await runTest('Browser Integration: Valid form submission triggers application/json fetch and prevents navigation', async () => {
    const inputs = {
      'name': { value: 'John Smith', focus: () => {} },
      'phone': { value: '01215589215', focus: () => {} },
      'email': { value: 'john@example.com', focus: () => {} },
      'service': { value: 'MOT', focus: () => {} },
      'message': { value: 'Booking request for MOT test on Saturday', focus: () => {} },
      'cf-turnstile-response': { value: 'test_token_cf_12345' }
    };

    let defaultPrevented = false;
    let submitListener = null;
    let formResetCalled = false;
    let interceptedFetch = null;

    const mockForm = {
      id: 'contact-form',
      dataset: {},
      querySelector: (sel) => {
        if (sel === 'button[type="submit"]') {
          return { innerHTML: 'Send Message', disabled: false, setAttribute: () => {}, removeAttribute: () => {} };
        }
        if (sel === '.cf-turnstile') return {};
        const match = sel.match(/\[name="([^"]+)"\]/);
        if (match && inputs[match[1]]) return inputs[match[1]];
        return null;
      },
      querySelectorAll: () => [],
      addEventListener: (event, handler) => {
        if (event === 'submit') submitListener = handler;
      },
      reset: () => { formResetCalled = true; }
    };

    const mockMessageBox = { textContent: '', className: '', style: {}, scrollIntoView: () => {} };

    const originalDocument = global.document;
    const originalFetch = global.fetch;

    global.document = {
      readyState: 'complete', // Test that even after DOMContentLoaded, listener attaches
      getElementById: (id) => {
        if (id === 'contact-form' || id === 'contact-page-form') return mockForm;
        if (id === 'form-feedback') return mockMessageBox;
        return null;
      },
      querySelector: (sel) => {
        if (sel === 'form.contact-form-inner' || sel === 'form[action="/api/contact"]') return mockForm;
        return null;
      },
      querySelectorAll: () => [],
      addEventListener: (evt, cb) => {
        if (evt === 'DOMContentLoaded') cb();
      }
    };

    global.fetch = async (url, options) => {
      interceptedFetch = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({ success: true, message: 'Enquiry received', ref: 'BK-1234' })
      };
    };

    try {
      const { initAll } = require('../js/main.js');
      initAll();

      assert.ok(submitListener, 'Submit listener must be attached to the form');

      const mockEvent = {
        preventDefault: () => { defaultPrevented = true; }
      };

      await submitListener(mockEvent);

      // Verify defaultPrevented was called (no native browser navigation)
      assert.strictEqual(defaultPrevented, true, 'Form submission MUST call e.preventDefault() to prevent native document navigation');

      // Verify fetch was dispatched to /api/contact with application/json
      assert.ok(interceptedFetch, 'Form submission MUST dispatch a fetch request');
      assert.strictEqual(interceptedFetch.url, '/api/contact');
      assert.strictEqual(interceptedFetch.options.method, 'POST');
      assert.strictEqual(interceptedFetch.options.headers['Content-Type'], 'application/json');
      assert.strictEqual(interceptedFetch.options.headers['Accept'], 'application/json');

      // Verify JSON payload contents
      assert.strictEqual(interceptedFetch.body.name, 'John Smith');
      assert.strictEqual(interceptedFetch.body.phone, '01215589215');
      assert.strictEqual(interceptedFetch.body.email, 'john@example.com');
      assert.strictEqual(interceptedFetch.body.service, 'MOT');
      assert.strictEqual(interceptedFetch.body.message, 'Booking request for MOT test on Saturday');
      assert.strictEqual(interceptedFetch.body.turnstileToken, 'test_token_cf_12345');
      assert.ok(interceptedFetch.body.timestamp);

      // Verify form reset on success
      assert.strictEqual(formResetCalled, true);
    } finally {
      global.document = originalDocument;
      global.fetch = originalFetch;
    }
  });

  // Test 21: Browser Integration - Unsuccessful submission preserves user input
  await runTest('Browser Integration: Unsuccessful submission preserves user inputs', async () => {
    const inputs = {
      'name': { value: 'Alice Preserved' },
      'phone': { value: '01215589215' },
      'email': { value: 'alice@test.uk' },
      'service': { value: 'Car Servicing' },
      'message': { value: 'My car needs urgent brake servicing' },
      'cf-turnstile-response': { value: 'test_token' }
    };

    let formResetCalled = false;
    let submitListener = null;

    const mockForm = {
      id: 'contact-form',
      dataset: {},
      querySelector: (sel) => {
        if (sel === 'button[type="submit"]') {
          return { innerHTML: 'Send', disabled: false, setAttribute: () => {}, removeAttribute: () => {} };
        }
        if (sel === '.cf-turnstile') return {};
        const match = sel.match(/\[name="([^"]+)"\]/);
        if (match && inputs[match[1]]) return inputs[match[1]];
        return null;
      },
      querySelectorAll: () => [],
      addEventListener: (event, handler) => {
        if (event === 'submit') submitListener = handler;
      },
      reset: () => { formResetCalled = true; }
    };

    const mockMessageBox = { textContent: '', className: '', style: {}, scrollIntoView: () => {} };

    const originalDocument = global.document;
    const originalFetch = global.fetch;

    global.document = {
      readyState: 'complete',
      getElementById: (id) => {
        if (id === 'contact-form') return mockForm;
        if (id === 'form-feedback') return mockMessageBox;
        return null;
      },
      querySelector: () => mockForm,
      querySelectorAll: () => [],
      addEventListener: () => {}
    };

    // Simulate server 503 error
    global.fetch = async () => ({
      ok: false,
      status: 503,
      json: async () => ({ success: false, error: 'Service Unavailable' })
    });

    try {
      const { initContactForm } = require('../js/main.js');
      initContactForm();

      assert.ok(submitListener);
      let prevented = false;
      await submitListener({ preventDefault: () => { prevented = true; } });

      assert.strictEqual(prevented, true);
      assert.strictEqual(formResetCalled, false, 'Form MUST NOT be reset on server failure');
      assert.strictEqual(inputs['name'].value, 'Alice Preserved');
      assert.strictEqual(inputs['message'].value, 'My car needs urgent brake servicing');
      assert.ok(mockMessageBox.textContent.includes('Service Unavailable'));
    } finally {
      global.document = originalDocument;
      global.fetch = originalFetch;
    }
  });

  // Test 22: Asset cache versioning verification in built HTML
  await runTest('Build Verification: Generated pages include asset cache-busting query strings', async () => {
    const fs = require('fs');
    const path = require('path');
    const contactHtml = fs.readFileSync(path.join(__dirname, '..', 'contactus', 'index.html'), 'utf8');

    assert.ok(contactHtml.includes('/js/main.js?v='), 'contactus/index.html must reference versioned /js/main.js?v=');
    assert.ok(contactHtml.includes('/css/style.css?v='), 'contactus/index.html must reference versioned /css/style.css?v=');
  });

  console.log(`\n=== RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED ===\n`);
  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test suite failed to run:', err);
  process.exit(1);
});
