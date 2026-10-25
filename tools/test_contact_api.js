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

  console.log(`\n=== RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED ===\n`);
  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test suite failed to run:', err);
  process.exit(1);
});
