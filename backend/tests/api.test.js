'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('../src/app');
const db = require('../models');
const emailService = require('../src/services/email');

let server;
let base;

before(async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
    server.on('error', reject);
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await db.sequelize.close();
});

// The existing API contract uses GET endpoints that accept a JSON body
// (e.g. /balance), so the helper uses node:http instead of fetch.
function request(path, { method = 'GET', body, token } = {}) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : null;
    const url = new URL(base);

    const headers = {};
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    if (token) headers.Authorization = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `/user${path}`,
        method,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const uniqueEmail = () =>
  `user${Date.now()}${Math.floor(Math.random() * 100000)}@test.local`;

const signupPayload = (overrides = {}) => ({
  name: `Test User ${Date.now()}`,
  email: uniqueEmail(),
  password: 'Test@1234',
  confirmPassword: 'Test@1234',
  ...overrides,
});

// Reads the most recent verification code captured by the test-mode email
// service for a given address. The account-creation email is skipped because
// its body contains the 10-digit account number, not a 6-digit code.
function lastCodeFor(email) {
  const messages = emailService.getCapturedMessages();
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.to !== email) continue;
    if (message.subject.includes('Created Successfully')) continue;
    const match = (message.text.match(/\b\d{6}\b/) || [])[0];
    if (match) return match;
  }
  return null;
}

function lastAccountCreatedEmailFor(email) {
  const messages = emailService.getCapturedMessages();
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.to === email && message.subject.includes('Created Successfully')) {
      return message;
    }
  }
  return null;
}

// Registers, verifies, sets a PIN, and logs in, returning everything later
// tests need (mirroring the old register/login shortcut used by the banking
// tests).
async function createFullUser(overrides = {}) {
  const payload = signupPayload(overrides);
  const password = payload.password;
  const pin = overrides.pin || '1234';

  await request('/signup', { method: 'POST', body: payload });

  const code = lastCodeFor(payload.email);
  assert.ok(code, `verification code should be sent to ${payload.email}`);

  const verifyRes = await request('/verify-email', {
    method: 'POST',
    body: { email: payload.email, code },
  });
  assert.equal(verifyRes.status, 200);

  const login1 = await request('/login', {
    method: 'POST',
    body: { email: payload.email, password },
  });
  const token = login1.json.details.token;
  const accountNumber = login1.json.details.accountNum;

  await request('/createPin', {
    method: 'POST',
    token,
    body: { accNum: accountNumber, pin },
  });

  const login2 = await request('/login', {
    method: 'POST',
    body: { email: payload.email, password },
  });

  return {
    name: payload.name,
    email: payload.email,
    password,
    pin,
    token: login2.json.details.token,
    accountNumber,
  };
}

test('signup sends a six-digit verification code to the email', async () => {
  const payload = signupPayload();
  const { status, json } = await request('/signup', {
    method: 'POST',
    body: payload,
  });
  assert.equal(status, 200);
  assert.equal(json.status, 'success');
  assert.equal(json.email, payload.email);
  assert.ok(!('code' in json), 'signup response must not expose the code');

  const code = lastCodeFor(payload.email);
  assert.ok(code, 'a verification email should be captured');
  assert.match(code, /^\d{6}$/);
});

test('registration validation rejects mismatched passwords', async () => {
  const { status, json } = await request('/signup', {
    method: 'POST',
    body: signupPayload({ confirmPassword: 'Different@99' }),
  });
  assert.equal(status, 400);
  assert.equal(json.message, 'Validation failed');
});

test('correct code creates a verified account and sends a confirmation email', async () => {
  const payload = signupPayload();
  const name = payload.name;
  await request('/signup', { method: 'POST', body: payload });

  const code = lastCodeFor(payload.email);
  const { status, json } = await request('/verify-email', {
    method: 'POST',
    body: { email: payload.email, code },
  });

  assert.equal(status, 200);
  assert.equal(json.status, 'success');
  assert.equal(json.emailVerified, true);
  assert.ok(json.user.accountNumber, 'verified account must have an account number');
  assert.equal(json.user.email, payload.email);
  assert.ok(!('code' in json), 'verify response must not expose the code');

  const confirmation = lastAccountCreatedEmailFor(payload.email);
  assert.ok(confirmation, 'account-created confirmation email should be captured');
  assert.equal(
    confirmation.subject,
    'Welcome to BBT Cash — Your Account Has Been Created Successfully'
  );
  assert.ok(
    confirmation.html.includes(json.user.accountNumber),
    'confirmation email must contain the persisted account number'
  );
  assert.ok(confirmation.html.includes(payload.email));
  assert.ok(
    !confirmation.html.includes(payload.password),
    'confirmation email must not contain the password'
  );
  assert.ok(
    !confirmation.html.includes(code),
    'confirmation email must not contain the verification code'
  );
  assert.ok(!/BREVO_SMTP_KEY|BREVO_SMTP_USER/i.test(confirmation.text + confirmation.html));
  assert.ok(!/JWT|token/i.test(confirmation.text));
  assert.ok(confirmation.html.includes(name.split(' ')[0]));

  const login = await request('/login', {
    method: 'POST',
    body: { email: payload.email, password: payload.password },
  });
  assert.equal(login.status, 200);
  assert.ok(login.json.details.token);
});

test('incorrect code does not create an account', async () => {
  const payload = signupPayload();
  await request('/signup', { method: 'POST', body: payload });

  const { status, json } = await request('/verify-email', {
    method: 'POST',
    body: { email: payload.email, code: '999999' },
  });
  assert.equal(status, 400);
  assert.equal(json.message, 'Invalid verification code');

  const login = await request('/login', {
    method: 'POST',
    body: { email: payload.email, password: payload.password },
  });
  assert.equal(login.status, 403);
});

test('expired code is rejected', async () => {
  const payload = signupPayload();
  await request('/signup', { method: 'POST', body: payload });

  const code = lastCodeFor(payload.email);
  await db.EmailVerification.update(
    { expiresAt: new Date(Date.now() - 1000) },
    { where: { email: payload.email } }
  );

  const { status, json } = await request('/verify-email', {
    method: 'POST',
    body: { email: payload.email, code },
  });
  assert.equal(status, 400);
  assert.equal(json.message, 'Invalid or expired verification code');
});

test('a used code cannot be reused', async () => {
  const user = await createFullUser();

  const { status, json } = await request('/verify-email', {
    method: 'POST',
    body: { email: user.email, code: '000000' },
  });
  assert.equal(status, 409);
  assert.equal(json.message, 'Email already registered');
});

test('too many incorrect verification attempts are rejected', async () => {
  const payload = signupPayload();
  await request('/signup', { method: 'POST', body: payload });

  for (let i = 0; i < 4; i += 1) {
    const { status } = await request('/verify-email', {
      method: 'POST',
      body: { email: payload.email, code: '111111' },
    });
    assert.equal(status, 400);
  }

  const { status } = await request('/verify-email', {
    method: 'POST',
    body: { email: payload.email, code: '111111' },
  });
  assert.equal(status, 429);

  const pending = await db.EmailVerification.findOne({
    where: { email: payload.email },
  });
  assert.equal(pending, null, 'exhausted verification record should be removed');
});

test('resend respects the cooldown and issues a new valid code', async () => {
  const payload = signupPayload();
  await request('/signup', { method: 'POST', body: payload });

  const firstCode = lastCodeFor(payload.email);

  const blocked = await request('/resend-verification', {
    method: 'POST',
    body: { email: payload.email },
  });
  assert.equal(blocked.status, 429);

  // Rewind the cooldown clock, then resend.
  await db.EmailVerification.update(
    { lastSentAt: new Date(Date.now() - 120000) },
    { where: { email: payload.email } }
  );

  const resent = await request('/resend-verification', {
    method: 'POST',
    body: { email: payload.email },
  });
  assert.equal(resent.status, 200);

  const newCode = lastCodeFor(payload.email);
  assert.ok(newCode);
  assert.notEqual(newCode, firstCode, 'a resend must issue a new code');

  const verify = await request('/verify-email', {
    method: 'POST',
    body: { email: payload.email, code: newCode },
  });
  assert.equal(verify.status, 200);

  const stale = await request('/verify-email', {
    method: 'POST',
    body: { email: payload.email, code: firstCode },
  });
  assert.equal(stale.status, 409);
});

test('a duplicate email cannot register another account', async () => {
  const user = await createFullUser();
  const { status, json } = await request('/signup', {
    method: 'POST',
    body: signupPayload({ email: user.email }),
  });
  assert.equal(status, 409);
  assert.equal(json.message, 'Email already registered');
});

test('a user cannot log in before verifying their email', async () => {
  const payload = signupPayload();
  await request('/signup', { method: 'POST', body: payload });

  const login = await request('/login', {
    method: 'POST',
    body: { email: payload.email, password: payload.password },
  });
  assert.equal(login.status, 403);
  assert.match(login.json.message, /verify your email/i);
});

test('login rejects a wrong password', async () => {
  const user = await createFullUser();
  const { status, json } = await request('/login', {
    method: 'POST',
    body: { email: user.email, password: 'Wrong@999' },
  });
  assert.equal(status, 401);
  assert.equal(json.message, 'Invalid email or password');
});

test('login rejects an unknown email', async () => {
  const { status, json } = await request('/login', {
    method: 'POST',
    body: { email: 'nobody@test.local', password: 'Test@1234' },
  });
  assert.equal(status, 401);
  assert.equal(json.message, 'Invalid email or password');
});

test('SMTP failure does not create a pending record or an account', async () => {
  emailService.setMockFailure(true);

  try {
    const payload = signupPayload();
    const { status } = await request('/signup', {
      method: 'POST',
      body: payload,
    });
    assert.equal(status, 502);

    const pending = await db.EmailVerification.findOne({
      where: { email: payload.email },
    });
    assert.equal(pending, null, 'failed delivery must not leave a pending record');

    const login = await request('/login', {
      method: 'POST',
      body: { email: payload.email, password: payload.password },
    });
    assert.equal(login.status, 401);
  } finally {
    emailService.setMockFailure(false);
  }
});

test('concurrent signups do not create duplicate pending records', async () => {
  const email = uniqueEmail();
  const body = { name: 'Concurrent User', email, password: 'Test@1234', confirmPassword: 'Test@1234' };
  const [a, b] = await Promise.all([
    request('/signup', { method: 'POST', body }),
    request('/signup', { method: 'POST', body }),
  ]);

  assert.deepEqual([a.status, b.status].sort(), [200, 200]);

  const count = await db.EmailVerification.count({ where: { email } });
  assert.equal(count, 1, 'exactly one pending record must exist');
});

test('concurrent verifications do not create duplicate users', async () => {
  const payload = signupPayload();
  await request('/signup', { method: 'POST', body: payload });
  const code = lastCodeFor(payload.email);

  const [a, b] = await Promise.all([
    request('/verify-email', { method: 'POST', body: { email: payload.email, code } }),
    request('/verify-email', { method: 'POST', body: { email: payload.email, code } }),
  ]);

  const statuses = [a.status, b.status].sort();
  assert.ok(statuses.includes(200), 'exactly one verification should succeed');
  assert.ok(
    statuses.includes(400) || statuses.includes(409),
    'the other verification must be rejected'
  );

  const count = await db.User.count({ where: { email: payload.email } });
  assert.equal(count, 1, 'concurrent verification must create only one user');
});

test('successful verification response exposes no secrets', async () => {
  const payload = signupPayload();
  await request('/signup', { method: 'POST', body: payload });
  const code = lastCodeFor(payload.email);

  const { json } = await request('/verify-email', {
    method: 'POST',
    body: { email: payload.email, code },
  });

  const serialized = JSON.stringify(json);
  assert.ok(!serialized.includes(payload.password));
  assert.ok(!serialized.includes(code));
  assert.ok(!json.user.password, 'user hash must not be returned');
});

test('protected routes reject missing tokens', async () => {
  const { status } = await request('/balance', { method: 'GET', body: {} });
  assert.equal(status, 403);
});

test('deposit credits the account and records a transaction', async () => {
  const user = await createFullUser();

  const { status, json } = await request('/deposit', {
    method: 'PUT',
    token: user.token,
    body: { accountNumber: user.accountNumber, amount: '1000' },
  });
  assert.equal(status, 200);
  assert.equal(json.message, 'Deposit successful');
  assert.equal(json.userDetails.amount, 1000);
  assert.ok(!('password' in json.userDetails), 'deposit response must not expose the password');
});

test('deposit rejects an invalid amount', async () => {
  const user = await createFullUser();

  const { status } = await request('/deposit', {
    method: 'PUT',
    token: user.token,
    body: { accountNumber: user.accountNumber, amount: 'abc' },
  });
  assert.equal(status, 400);
});

test('balance returns the current balance when pin matches', async () => {
  const user = await createFullUser();

  await request('/deposit', {
    method: 'PUT',
    token: user.token,
    body: { accountNumber: user.accountNumber, amount: '500' },
  });

  const { status, json } = await request('/balance', {
    method: 'GET',
    token: user.token,
    body: { accountNumber: user.accountNumber, pin: user.pin },
  });
  assert.equal(status, 200);
  assert.equal(json.balance, 'Your balance is 500');
});

test('transfer debits sender and credits recipient atomically', async () => {
  const sender = await createFullUser();
  const receiver = await createFullUser();

  await request('/deposit', {
    method: 'PUT',
    token: sender.token,
    body: { accountNumber: sender.accountNumber, amount: '1000' },
  });

  const { status, json } = await request('/transfer', {
    method: 'POST',
    token: sender.token,
    body: {
      from: sender.accountNumber,
      to: receiver.accountNumber,
      amount: '400',
      pin: sender.pin,
    },
  });
  assert.equal(status, 200);
  assert.equal(json.status, 'sucess');
  assert.equal(json.message, `Transfer to ${receiver.name} successful. Your balance is 600`);

  const senderBal = await request('/balance', {
    method: 'GET',
    token: sender.token,
    body: { accountNumber: sender.accountNumber, pin: sender.pin },
  });
  assert.equal(senderBal.json.balance, 'Your balance is 600');

  const receiverBal = await request('/balance', {
    method: 'GET',
    token: receiver.token,
    body: { accountNumber: receiver.accountNumber, pin: receiver.pin },
  });
  assert.equal(receiverBal.json.balance, 'Your balance is 400');
});

test('transfer rejects insufficient funds without partial effects', async () => {
  const sender = await createFullUser();
  const receiver = await createFullUser();

  await request('/deposit', {
    method: 'PUT',
    token: sender.token,
    body: { accountNumber: sender.accountNumber, amount: '100' },
  });

  const { status } = await request('/transfer', {
    method: 'POST',
    token: sender.token,
    body: {
      from: sender.accountNumber,
      to: receiver.accountNumber,
      amount: '5000',
      pin: sender.pin,
    },
  });
  assert.equal(status, 400);

  const senderBal = await request('/balance', {
    method: 'GET',
    token: sender.token,
    body: { accountNumber: sender.accountNumber, pin: sender.pin },
  });
  assert.equal(senderBal.json.balance, 'Your balance is 100');

  const receiverBal = await request('/balance', {
    method: 'GET',
    token: receiver.token,
    body: { accountNumber: receiver.accountNumber, pin: receiver.pin },
  });
  assert.equal(receiverBal.json.balance, 'Your balance is 0');
});

test('transfer rejects an unknown recipient', async () => {
  const sender = await createFullUser();

  const { status, json } = await request('/transfer', {
    method: 'POST',
    token: sender.token,
    body: {
      from: sender.accountNumber,
      to: '9999999999',
      amount: '10',
      pin: sender.pin,
    },
  });
  assert.equal(status, 404);
  assert.equal(json.message, 'Recipient not found');
});

test('concurrent transfers cannot overspend a balance', async () => {
  const sender = await createFullUser();
  const receiverA = await createFullUser();
  const receiverB = await createFullUser();

  await request('/deposit', {
    method: 'PUT',
    token: sender.token,
    body: { accountNumber: sender.accountNumber, amount: '1000' },
  });

  const [resA, resB] = await Promise.all([
    request('/transfer', {
      method: 'POST',
      token: sender.token,
      body: {
        from: sender.accountNumber,
        to: receiverA.accountNumber,
        amount: '1000',
        pin: sender.pin,
      },
    }),
    request('/transfer', {
      method: 'POST',
      token: sender.token,
      body: {
        from: sender.accountNumber,
        to: receiverB.accountNumber,
        amount: '1000',
        pin: sender.pin,
      },
    }),
  ]);

  const statuses = [resA.status, resB.status].sort();
  assert.deepEqual(statuses, [200, 400]);

  const senderBal = await request('/balance', {
    method: 'GET',
    token: sender.token,
    body: { accountNumber: sender.accountNumber, pin: sender.pin },
  });
  assert.equal(senderBal.json.balance, 'Your balance is 0');
});

test('transfer is idempotent for a supplied reference', async () => {
  const sender = await createFullUser();
  const receiver = await createFullUser();
  const reference = `REF-${Date.now()}`;

  await request('/deposit', {
    method: 'PUT',
    token: sender.token,
    body: { accountNumber: sender.accountNumber, amount: '1000' },
  });

  const first = await request('/transfer', {
    method: 'POST',
    token: sender.token,
    body: {
      from: sender.accountNumber,
      to: receiver.accountNumber,
      amount: '100',
      pin: sender.pin,
      reference,
    },
  });
  assert.equal(first.status, 200);

  const second = await request('/transfer', {
    method: 'POST',
    token: sender.token,
    body: {
      from: sender.accountNumber,
      to: receiver.accountNumber,
      amount: '100',
      pin: sender.pin,
      reference,
    },
  });
  assert.equal(second.status, 409);
  assert.equal(second.json.message, 'Duplicate transaction');

  const senderBal = await request('/balance', {
    method: 'GET',
    token: sender.token,
    body: { accountNumber: sender.accountNumber, pin: sender.pin },
  });
  assert.equal(senderBal.json.balance, 'Your balance is 900');
});

test('admin can deposit into any account', async () => {
  const admin = await createFullUser({ name: 'Admin User' });
  const target = await createFullUser();

  // Demote test users are created as role 'user'; the admin deposit endpoint
  // requires an admin role, so promote directly for this authorization test.
  await db.User.update({ role: 'admin' }, { where: { email: admin.email } });
  const adminLogin = await request('/login', {
    method: 'POST',
    body: { email: admin.email, password: admin.password },
  });
  const adminToken = adminLogin.json.details.token;

  const { status, json } = await request(`/adminDeposit/${target.accountNumber}`, {
    method: 'POST',
    token: adminToken,
    body: { pin: admin.pin, amount: '2000' },
  });
  assert.equal(status, 200);
  assert.equal(json.message, 'Successfully deposited 2000. New balance is 2000');

  const bal = await request('/balance', {
    method: 'GET',
    token: target.token,
    body: { accountNumber: target.accountNumber, pin: target.pin },
  });
  assert.equal(bal.json.balance, 'Your balance is 2000');
});

test('non-admin cannot use the admin endpoint', async () => {
  const user = await createFullUser();
  const target = await createFullUser();

  const { status } = await request(`/adminDeposit/${target.accountNumber}`, {
    method: 'POST',
    token: user.token,
    body: { pin: user.pin, amount: '500' },
  });
  assert.equal(status, 400);
});

test('transaction history lists deposits and transfers', async () => {
  const sender = await createFullUser();
  const receiver = await createFullUser();

  await request('/deposit', {
    method: 'PUT',
    token: sender.token,
    body: { accountNumber: sender.accountNumber, amount: '300' },
  });
  await request('/transfer', {
    method: 'POST',
    token: sender.token,
    body: {
      from: sender.accountNumber,
      to: receiver.accountNumber,
      amount: '100',
      pin: sender.pin,
    },
  });

  const { status, json } = await request('/transactions', {
    method: 'GET',
    token: sender.token,
  });
  assert.equal(status, 200);
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.transactions));
  assert.ok(json.transactions.length >= 2);
  const types = json.transactions.map((t) => t.type).sort();
  assert.ok(types.includes('deposit'));
  assert.ok(types.includes('transfer'));
});