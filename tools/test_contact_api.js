/**
 * Automated Test Suite for BK MOT Centre Contact API & Worker
 * Tests input validation, security controls, XSS escaping, mocked Resend integration,
 * Turnstile fail-closed verification, and no-cache policies.
 */

const assert = require('assert');
const { onRequestPost, onRequestOptions } = require('../functions/api/contact.js');
const { buildAll } = require('./build.js');

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
  buildAll();

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

  // Test 10: Successful mocked Resend dispatch with Turnstile verified (Dual Dispatch: Garage + Customer)
  await runTest('Successful Resend dispatch with mocked fetch (returns 200 & ref ID)', async () => {
    const originalFetch = global.fetch;
    const interceptedRequests = [];

    global.fetch = async (url, options) => {
      if (url.includes('turnstile/v0/siteverify')) {
        return {
          ok: true,
          json: async () => ({ success: true })
        };
      }
      if (url === 'https://api.resend.com/emails') {
        interceptedRequests.push({
          url,
          options,
          body: JSON.parse(options.body)
        });
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: `mock_msg_${interceptedRequests.length}` })
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
      assert.strictEqual(data.customerEmailSent, true);
      assert.ok(data.ref.startsWith('BK-'));
      assert.strictEqual(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, proxy-revalidate');

      // Both Garage and Customer emails were dispatched
      assert.strictEqual(interceptedRequests.length, 2);

      // 1. Garage Notification verification
      const garageEmail = interceptedRequests[0];
      assert.strictEqual(garageEmail.body.to[0], 'garage@bkmotcentre.uk');
      assert.strictEqual(garageEmail.body.reply_to, 'agent007@mi6.gov.uk');
      assert.strictEqual(garageEmail.options.headers['Idempotency-Key'], `${data.ref}-garage`);
      assert.ok(garageEmail.body.html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
      assert.ok(!garageEmail.body.html.includes('<script>alert("xss")</script>'));

      // 2. Customer Confirmation verification
      const customerEmail = interceptedRequests[1];
      assert.strictEqual(customerEmail.body.to[0], 'agent007@mi6.gov.uk');
      assert.strictEqual(customerEmail.options.headers['Idempotency-Key'], `${data.ref}-customer`);
      assert.ok(customerEmail.body.subject.includes(data.ref));
      assert.ok(customerEmail.body.html.includes('Your enquiry has been received. This is not a confirmed appointment. Our team will contact you to arrange and confirm your booking.'));
      assert.ok(customerEmail.body.html.includes('0121 558 9215'));
      assert.ok(customerEmail.body.html.includes('161 Rolfe Street, Smethwick, Birmingham B66 2AU'));
      assert.ok(customerEmail.body.html.includes('Awaiting appointment confirmation'));
      assert.ok(customerEmail.body.text.includes(data.ref));
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
    const contactHtml = fs.readFileSync(path.join(__dirname, '..', 'dist', 'contactus', 'index.html'), 'utf8');

    assert.ok(contactHtml.includes('/js/main.js?v='), 'dist/contactus/index.html must reference versioned /js/main.js?v=');
    assert.ok(contactHtml.includes('/css/style.css?v='), 'dist/contactus/index.html must reference versioned /css/style.css?v=');
  });

  // Test 23: Missing customer email sends garage email only (customerEmailSent: false)
  await runTest('Customer Email: Missing customer email dispatches garage email only', async () => {
    const originalFetch = global.fetch;
    const resendCalls = [];

    global.fetch = async (url, options) => {
      if (url.includes('turnstile/v0/siteverify')) {
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url === 'https://api.resend.com/emails') {
        resendCalls.push(JSON.parse(options.body));
        return { ok: true, status: 200, json: async () => ({ id: 're_garage_only_123' }) };
      }
      return originalFetch(url, options);
    };

    try {
      const req = createMockRequest({
        body: {
          name: 'Sarah Connor',
          phone: '01215589215',
          email: '', // No email provided
          service: 'MOT',
          message: 'MOT test enquiry without email',
          turnstileToken: 'valid_token'
        }
      });

      const env = {
        TURNSTILE_SECRET_KEY: '0x4AAAAAAFlMW_secret',
        RESEND_API_KEY: 're_secret_key',
        CONTACT_TO_EMAIL: 'garage@bkmotcentre.uk'
      };

      const res = await onRequestPost({ request: req, env });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.customerEmailSent, false);
      assert.strictEqual(resendCalls.length, 1);
      assert.strictEqual(resendCalls[0].to[0], 'garage@bkmotcentre.uk');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Test 24: Failed garage email halts flow — customer confirmation is NEVER dispatched
  await runTest('Customer Email: Failed garage email prevents customer confirmation dispatch', async () => {
    const originalFetch = global.fetch;
    let resendCallCount = 0;

    global.fetch = async (url) => {
      if (url.includes('turnstile/v0/siteverify')) {
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url === 'https://api.resend.com/emails') {
        resendCallCount++;
        // First call (garage) fails
        return { ok: false, status: 500, json: async () => ({ message: 'Upstream gateway error' }) };
      }
      return originalFetch(url);
    };

    try {
      const req = createMockRequest({
        body: {
          name: 'Customer Test',
          phone: '01215589215',
          email: 'customer@testdomain.co.uk',
          service: 'MOT',
          message: 'Should not get confirmation if garage notification fails',
          turnstileToken: 'valid_token'
        }
      });

      const env = {
        TURNSTILE_SECRET_KEY: '0x4AAAAAAFlMW_secret',
        RESEND_API_KEY: 're_secret_key',
        CONTACT_TO_EMAIL: 'garage@bkmotcentre.uk'
      };

      const res = await onRequestPost({ request: req, env });
      assert.strictEqual(res.status, 502);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(resendCallCount, 1, 'Resend must only be called once; customer confirmation must not be attempted if garage fails');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Test 25: Failed customer confirmation leaves garage enquiry reported as successful (returns 200)
  await runTest('Customer Email: Failed customer confirmation preserves garage enquiry success', async () => {
    const originalFetch = global.fetch;
    let resendCalls = 0;

    global.fetch = async (url) => {
      if (url.includes('turnstile/v0/siteverify')) {
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url === 'https://api.resend.com/emails') {
        resendCalls++;
        if (resendCalls === 1) {
          // Garage notification succeeds
          return { ok: true, status: 200, json: async () => ({ id: 're_garage_ok_1' }) };
        }
        // Customer confirmation fails (e.g. rate limit or bad recipient address)
        return { ok: false, status: 429, json: async () => ({ message: 'Too many requests' }) };
      }
      return originalFetch(url);
    };

    try {
      const req = createMockRequest({
        body: {
          name: 'Robert Davis',
          phone: '01215589215',
          email: 'robert@rate-limited.com',
          service: 'Car Diagnosis',
          message: 'Check engine diagnostic required',
          turnstileToken: 'valid_token'
        }
      });

      const env = {
        TURNSTILE_SECRET_KEY: '0x4AAAAAAFlMW_secret',
        RESEND_API_KEY: 're_secret_key',
        CONTACT_TO_EMAIL: 'garage@bkmotcentre.uk'
      };

      const res = await onRequestPost({ request: req, env });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.customerEmailSent, false);
      assert.strictEqual(resendCalls, 2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Test 26: Reference number matches across garage email, customer email, and API response
  await runTest('Customer Email: Reference ID strictly matches across all messages and response', async () => {
    const originalFetch = global.fetch;
    const dispatchedEmails = [];

    global.fetch = async (url, options) => {
      if (url.includes('turnstile/v0/siteverify')) {
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url === 'https://api.resend.com/emails') {
        dispatchedEmails.push({
          options,
          body: JSON.parse(options.body)
        });
        return { ok: true, status: 200, json: async () => ({ id: `re_id_${dispatchedEmails.length}` }) };
      }
      return originalFetch(url, options);
    };

    try {
      const req = createMockRequest({
        body: {
          name: 'Consistency Test',
          phone: '01215589215',
          email: 'test@consistency.uk',
          service: 'Brakes & Suspension',
          message: 'Suspension squeaking',
          turnstileToken: 'valid_token'
        }
      });

      const env = {
        TURNSTILE_SECRET_KEY: '0x4AAAAAAFlMW_secret',
        RESEND_API_KEY: 're_secret_key',
        CONTACT_TO_EMAIL: 'garage@bkmotcentre.uk'
      };

      const res = await onRequestPost({ request: req, env });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(data.ref);

      const ref = data.ref;
      assert.ok(dispatchedEmails[0].body.subject.includes(ref), 'Garage subject must contain ref');
      assert.ok(dispatchedEmails[0].body.html.includes(ref), 'Garage html must contain ref');
      assert.ok(dispatchedEmails[1].body.subject.includes(ref), 'Customer subject must contain ref');
      assert.ok(dispatchedEmails[1].body.html.includes(ref), 'Customer html must contain ref');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Test 27: Privacy audit - No customer PII is exposed in server console logs
  await runTest('Privacy Audit: No customer PII (name, phone, email, message) is exposed in server logs', async () => {
    const originalFetch = global.fetch;
    const capturedLogs = [];

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => capturedLogs.push(args.join(' '));
    console.warn = (...args) => capturedLogs.push(args.join(' '));
    console.error = (...args) => capturedLogs.push(args.join(' '));

    global.fetch = async (url) => {
      if (url.includes('turnstile/v0/siteverify')) {
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url === 'https://api.resend.com/emails') {
        return { ok: true, status: 200, json: async () => ({ id: 're_privacy_check_id' }) };
      }
      return originalFetch(url);
    };

    const privateName = 'SirArthurConanDoyle_TopSecret';
    const privatePhone = '07890123456';
    const privateEmail = 'sherlock@221b-bakerstreet.co.uk';
    const privateMessage = 'ConfidentialMessageContainingTopSecretCarIssues_XYZ123';

    try {
      const req = createMockRequest({
        body: {
          name: privateName,
          phone: privatePhone,
          email: privateEmail,
          service: 'MOT',
          message: privateMessage,
          turnstileToken: 'valid_token'
        }
      });

      const env = {
        TURNSTILE_SECRET_KEY: '0x4AAAAAAFlMW_secret',
        RESEND_API_KEY: 're_secret_key',
        CONTACT_TO_EMAIL: 'garage@bkmotcentre.uk'
      };

      const res = await onRequestPost({ request: req, env });
      assert.strictEqual(res.status, 200);

      // Verify none of the captured logs contain any of the private customer PII strings
      const allLogs = capturedLogs.join('\n');
      assert.strictEqual(allLogs.includes(privateName), false, 'Log must NOT contain customer name');
      assert.strictEqual(allLogs.includes(privatePhone), false, 'Log must NOT contain customer phone');
      assert.strictEqual(allLogs.includes(privateEmail), false, 'Log must NOT contain customer email');
      assert.strictEqual(allLogs.includes(privateMessage), false, 'Log must NOT contain customer message');
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      global.fetch = originalFetch;
    }
  });

  // Test 28: Idempotency behavior for retry scenarios
  await runTest('Resend Idempotency: Headers include distinct, deterministic Idempotency-Key per message', async () => {
    const originalFetch = global.fetch;
    const capturedHeaders = [];

    global.fetch = async (url, options) => {
      if (url.includes('turnstile/v0/siteverify')) {
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url === 'https://api.resend.com/emails') {
        capturedHeaders.push(options.headers);
        return { ok: true, status: 200, json: async () => ({ id: 're_idempotency_123' }) };
      }
      return originalFetch(url, options);
    };

    try {
      const req = createMockRequest({
        body: {
          name: 'Idempotency Tester',
          phone: '01215589215',
          email: 'tester@idempotency.co.uk',
          service: 'Engine repair',
          message: 'Engine vibration test',
          turnstileToken: 'valid_token'
        }
      });

      const env = {
        TURNSTILE_SECRET_KEY: '0x4AAAAAAFlMW_secret',
        RESEND_API_KEY: 're_secret_key',
        CONTACT_TO_EMAIL: 'garage@bkmotcentre.uk'
      };

      const res = await onRequestPost({ request: req, env });
      const data = await res.json();
      assert.strictEqual(res.status, 200);

      assert.strictEqual(capturedHeaders.length, 2);
      assert.strictEqual(capturedHeaders[0]['Idempotency-Key'], `${data.ref}-garage`);
      assert.strictEqual(capturedHeaders[1]['Idempotency-Key'], `${data.ref}-customer`);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Test 29: Cloudflare Wrangler runtime variables validation
  await runTest('Configuration: wrangler.jsonc defines required non-secret runtime vars and preserves secrets', async () => {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, '..', 'wrangler.jsonc');

    assert.ok(fs.existsSync(configPath), 'wrangler.jsonc must exist in the project root');
    const rawContent = fs.readFileSync(configPath, 'utf8');

    // Strip comments if present to safely parse JSONC
    const strippedJson = rawContent.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1').trim();
    let config;
    try {
      config = JSON.parse(strippedJson);
    } catch (e) {
      assert.fail(`wrangler.jsonc must be valid JSON/JSONC: ${e.message}`);
    }

    // Verify top-level non-secret runtime variables
    assert.ok(config.vars, 'wrangler.jsonc must have a top-level "vars" section');
    assert.strictEqual(
      config.vars.CONTACT_FROM_EMAIL,
      'BK MOT Centre <bookings@bkmotcentre.uk>',
      'CONTACT_FROM_EMAIL must be "BK MOT Centre <bookings@bkmotcentre.uk>"'
    );
    assert.strictEqual(
      config.vars.CONTACT_TO_EMAIL,
      'bkmotcentre@gmail.com',
      'CONTACT_TO_EMAIL must be "bkmotcentre@gmail.com"'
    );

    // Verify secrets are NOT present in wrangler configuration
    assert.strictEqual(config.vars.RESEND_API_KEY, undefined, 'RESEND_API_KEY must not be committed to vars');
    assert.strictEqual(config.vars.TURNSTILE_SECRET_KEY, undefined, 'TURNSTILE_SECRET_KEY must not be committed to vars');
    assert.strictEqual(rawContent.includes('re_'), false, 'No Resend API key pattern should be in wrangler.jsonc');
    assert.strictEqual(rawContent.includes('0x4AAAAAA'), false, 'No Turnstile secret pattern should be in wrangler.jsonc');

    // Verify worker settings and assets are preserved
    assert.strictEqual(config.name, 'bkmotcentre', 'Worker name must be preserved');
    assert.strictEqual(config.main, 'src/worker.js', 'Worker main entrypoint must be preserved');
    assert.strictEqual(config.compatibility_date, '2026-10-19', 'Worker compatibility date must be preserved');
    assert.strictEqual(config.observability && config.observability.enabled, true, 'Observability must be enabled');
    assert.strictEqual(config.assets && config.assets.directory, 'dist', 'Assets directory must be "dist"');
    assert.strictEqual(config.assets && config.assets.binding, 'ASSETS', 'Assets binding must be "ASSETS"');

    // Ensure no named environments or routing changes
    assert.strictEqual(config.env, undefined, 'Must not define named environments in wrangler.jsonc');
  });

  // Test 30: Dedicated dist/ build output architecture validation
  await runTest('Build Pipeline: dist/ contains all required public pages, assets, and configs without dev leakage', async () => {
    const fs = require('fs');
    const path = require('path');
    const distDir = path.join(__dirname, '..', 'dist');

    assert.ok(fs.existsSync(distDir), 'dist/ directory must exist after build');

    // 1. All public HTML pages
    const requiredPages = [
      'index.html',
      'aboutus/index.html',
      'dpf-cleaning-service/index.html',
      'services/index.html',
      'contactus/index.html',
      '404.html'
    ];
    for (const page of requiredPages) {
      assert.ok(fs.existsSync(path.join(distDir, page)), `dist/${page} must be generated`);
    }

    // 2. Core static assets
    assert.ok(fs.existsSync(path.join(distDir, 'css', 'style.css')), 'dist/css/style.css must exist');
    assert.ok(fs.existsSync(path.join(distDir, 'js', 'main.js')), 'dist/js/main.js must exist');
    assert.ok(fs.existsSync(path.join(distDir, 'assets', 'images', 'logo.png')), 'dist/assets/images/logo.png must exist');
    assert.ok(fs.existsSync(path.join(distDir, 'favicon.png')), 'dist/favicon.png must exist');
    assert.ok(fs.existsSync(path.join(distDir, 'favicon.svg')), 'dist/favicon.svg must exist');
    assert.ok(fs.existsSync(path.join(distDir, 'robots.txt')), 'dist/robots.txt must exist');
    assert.ok(fs.existsSync(path.join(distDir, 'sitemap.xml')), 'dist/sitemap.xml must exist');
    assert.ok(fs.existsSync(path.join(distDir, '_headers')), 'dist/_headers must exist');
    assert.ok(fs.existsSync(path.join(distDir, '_redirects')), 'dist/_redirects must exist');

    // 3. Excludes dev tools and sources
    assert.strictEqual(fs.existsSync(path.join(distDir, 'package.json')), false, 'dist must not contain package.json');
    assert.strictEqual(fs.existsSync(path.join(distDir, 'tools')), false, 'dist must not contain tools/');
    assert.strictEqual(fs.existsSync(path.join(distDir, 'src')), false, 'dist must not contain src/');
    assert.strictEqual(fs.existsSync(path.join(distDir, 'components')), false, 'dist must not contain components/');
    assert.strictEqual(fs.existsSync(path.join(distDir, 'docs')), false, 'dist must not contain docs/');
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
