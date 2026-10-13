'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('../src/app');
const db = require('../models');
const emailService = require('../src/services/email');
const notifications = require('../src/services/notifications');
const pinAttempts = require('../src/services/pinAttempts');

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

test('a failed account creation does not send a confirmation email', async () => {
  const payload = signupPayload();
  await request('/signup', { method: 'POST', body: payload });
  const code = lastCodeFor(payload.email);

  const originalCreate = db.User.create;
  db.User.create = async () => {
    throw new Error('simulated database failure');
  };

  let verifyRes;
  try {
    verifyRes = await request('/verify-email', {
      method: 'POST',
      body: { email: payload.email, code },
    });
  } finally {
    db.User.create = originalCreate;
  }

  assert.equal(verifyRes.status, 500);

  const user = await db.User.findOne({ where: { email: payload.email } });
  assert.equal(user, null, 'no account should be persisted on failure');
  assert.equal(
    lastAccountCreatedEmailFor(payload.email),
    null,
    'no confirmation email may be sent when account creation fails'
  );
});

test('a temporary confirmation-email failure keeps the account and can be retried without duplicating it', async () => {
  const payload = signupPayload();
  await request('/signup', { method: 'POST', body: payload });
  const code = lastCodeFor(payload.email);

  // Fail only the account-creation confirmation delivery, not the verification.
  emailService.setMockFailure(true);

  const verifyRes = await request('/verify-email', {
    method: 'POST',
    body: { email: payload.email, code },
  });

  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.json.emailVerified, true);
  assert.equal(
    verifyRes.json.confirmationEmail,
    'failed',
    'the API must not report success for an undelivered email'
  );

  const accountNumber = verifyRes.json.user.accountNumber;
  assert.ok(accountNumber);

  const users = await db.User.findAll({ where: { email: payload.email } });
  assert.equal(users.length, 1, 'the account must survive an email failure');
  assert.equal(users[0].accountNumber, accountNumber);

  const notification = await db.EmailNotification.findOne({
    where: { userId: users[0].id, type: 'account_created' },
  });
  assert.ok(notification, 'delivery status must be recorded for retry');
  assert.equal(notification.status, 'failed');

  assert.equal(
    lastAccountCreatedEmailFor(payload.email),
    null,
    'a failed delivery must not capture an email'
  );

  // Retrying delivery re-sends the email without creating another account.
  const retried = await notifications.retryAccountCreatedEmail(users[0].id);
  assert.equal(retried.status, 'sent');

  const usersAfterRetry = await db.User.findAll({
    where: { email: payload.email },
  });
  assert.equal(
    usersAfterRetry.length,
    1,
    'retrying email delivery must not create another account'
  );

  const confirmation = lastAccountCreatedEmailFor(payload.email);
  assert.ok(confirmation, 'retry should deliver the confirmation email');
  assert.ok(confirmation.html.includes(accountNumber));

  // A second retry must not re-send an already-sent notification.
  await notifications.retryAccountCreatedEmail(users[0].id);
  const delivered = emailService
    .getCapturedMessages()
    .filter(
      (m) => m.to === payload.email && m.subject.includes('Created Successfully')
    );
  assert.equal(delivered.length, 1, 'a sent notification must not be re-sent');
});

test('account numbers are unique and not derived from the internal id', async () => {
  const numbers = new Set();

  for (let i = 0; i < 5; i += 1) {
    const account = await createFullUser();
    assert.match(account.accountNumber, /^\d{10}$/);
    assert.ok(
      !numbers.has(account.accountNumber),
      'account numbers must be unique'
    );
    numbers.add(account.accountNumber);

    const row = await db.User.findOne({ where: { email: account.email } });
    assert.equal(row.accountNumber, account.accountNumber);
    assert.notEqual(String(row.accountNumber), String(row.id));
  }
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

test('a failed login alerts the account owner', async () => {
  const user = await createFullUser();
  await request('/login', {
    method: 'POST',
    body: { email: user.email, password: 'Wrong@999' },
  });

  const account = await db.User.findOne({ where: { email: user.email } });
  const notes = await db.Notification.findAll({ where: { userId: account.id } });
  const alert = notes.find(
    (n) => n.type === 'security_alert' && n.metadata && n.metadata.event === 'login_attempt'
  );
  assert.ok(alert, 'the owner receives a failed-login alert');
});

test('a failed PIN change attempt alerts the account owner', async () => {
  const user = await createFullUser();
  const res = await request('/change-pin', {
    method: 'POST',
    token: user.token,
    body: { currentPin: '0000', newPin: '5678', confirmPin: '5678' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.message, 'Your current PIN is incorrect');

  const account = await db.User.findOne({ where: { email: user.email } });
  const notes = await db.Notification.findAll({ where: { userId: account.id } });
  assert.ok(
    notes.some((n) => n.type === 'security_alert'),
    'the owner receives an alert about the failed PIN change'
  );
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

// ---------------------------------------------------------------------------
// Transaction PIN security and notifications
// ---------------------------------------------------------------------------

async function listNotifications(token) {
  const res = await request('/notifications', { method: 'GET', token });
  assert.equal(res.status, 200);
  return res.json.notifications;
}

test('transaction PIN is stored hashed and excluded from the JWT', async () => {
  const user = await createFullUser({ pin: '4321' });

  const stored = await db.User.findOne({ where: { email: user.email } });
  assert.notEqual(stored.pin, '4321');
  assert.match(stored.pin, /^\$2[aby]\$/, 'PIN must be stored as a bcrypt hash');

  const payload = JSON.parse(
    Buffer.from(user.token.split('.')[1], 'base64').toString('utf8')
  );
  assert.ok(!('pin' in payload), 'the JWT must not carry the PIN');

  const wrong = await request('/balance', {
    method: 'GET',
    token: user.token,
    body: { accountNumber: user.accountNumber, pin: '0000' },
  });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.json.message, 'Invalid PIN.');

  const right = await request('/balance', {
    method: 'GET',
    token: user.token,
    body: { accountNumber: user.accountNumber, pin: '4321' },
  });
  assert.equal(right.status, 200);
});

test('a user cannot transfer from an account they do not own', async () => {
  const attacker = await createFullUser();
  const victim = await createFullUser();
  const receiver = await createFullUser();

  await request('/deposit', {
    method: 'PUT',
    token: victim.token,
    body: { accountNumber: victim.accountNumber, amount: '1000' },
  });

  const res = await request('/transfer', {
    method: 'POST',
    token: attacker.token,
    body: {
      from: victim.accountNumber,
      to: receiver.accountNumber,
      amount: '100',
      pin: attacker.pin,
    },
  });
  assert.equal(res.status, 403);
});

test('deposit creates a deposit notification for the account owner', async () => {
  const user = await createFullUser();

  const depositRes = await request('/deposit', {
    method: 'PUT',
    token: user.token,
    body: { accountNumber: user.accountNumber, amount: '700' },
  });
  assert.equal(depositRes.status, 200);

  const { status, json } = await request('/notifications', {
    method: 'GET',
    token: user.token,
  });
  assert.equal(status, 200);
  const deposit = json.notifications.find(
    (n) => n.type === 'deposit' && n.amount === 700
  );
  assert.ok(deposit, 'a deposit notification should exist');
  assert.equal(deposit.isRead, false);

  const unread = await request('/notifications/unread-count', {
    method: 'GET',
    token: user.token,
  });
  assert.ok(unread.json.unreadCount >= 1);
});

test('transfer creates matching debit and credit notifications', async () => {
  const sender = await createFullUser();
  const receiver = await createFullUser();

  await request('/deposit', {
    method: 'PUT',
    token: sender.token,
    body: { accountNumber: sender.accountNumber, amount: '1000' },
  });

  const transfer = await request('/transfer', {
    method: 'POST',
    token: sender.token,
    body: {
      from: sender.accountNumber,
      to: receiver.accountNumber,
      amount: '250',
      pin: sender.pin,
    },
  });
  assert.equal(transfer.status, 200);

  const senderList = (
    await request('/notifications', { method: 'GET', token: sender.token })
  ).json.notifications;
  const receiverList = (
    await request('/notifications', { method: 'GET', token: receiver.token })
  ).json.notifications;

  const debit = senderList.find((n) => n.type === 'debit' && n.amount === 250);
  const credit = receiverList.find((n) => n.type === 'credit' && n.amount === 250);

  assert.ok(debit, 'sender should have a debit notification');
  assert.ok(credit, 'receiver should have a credit notification');
  assert.equal(debit.transactionId, credit.transactionId);
});

test('a retried transfer does not duplicate notifications', async () => {
  const sender = await createFullUser();
  const receiver = await createFullUser();

  await request('/deposit', {
    method: 'PUT',
    token: sender.token,
    body: { accountNumber: sender.accountNumber, amount: '1000' },
  });

  const reference = `retry-ref-${Date.now()}`;
  const body = {
    from: sender.accountNumber,
    to: receiver.accountNumber,
    amount: '300',
    pin: sender.pin,
    reference,
  };

  const first = await request('/transfer', { method: 'POST', token: sender.token, body });
  assert.equal(first.status, 200);

  const replay = await request('/transfer', { method: 'POST', token: sender.token, body });
  assert.equal(replay.status, 409);

  const list = (
    await request('/notifications', { method: 'GET', token: sender.token })
  ).json.notifications;
  const matches = list.filter(
    (n) => n.type === 'debit' && n.reference === reference
  );
  assert.equal(matches.length, 1, 'no duplicate debit notifications on retry');
});

test('a failed transfer notifies the initiator', async () => {
  const sender = await createFullUser();
  const receiver = await createFullUser();

  const res = await request('/transfer', {
    method: 'POST',
    token: sender.token,
    body: {
      from: sender.accountNumber,
      to: receiver.accountNumber,
      amount: '500',
      pin: sender.pin,
    },
  });
  assert.equal(res.status, 400);

  const list = (
    await request('/notifications', { method: 'GET', token: sender.token })
  ).json.notifications;
  assert.ok(list.some((n) => n.type === 'failed'));
  assert.ok(!list.some((n) => n.type === 'debit'));
});

test('notifications are isolated to the authenticated account', async () => {
  const alice = await createFullUser();
  const bob = await createFullUser();

  await request('/deposit', {
    method: 'PUT',
    token: alice.token,
    body: { accountNumber: alice.accountNumber, amount: '300' },
  });

  const aliceList = (
    await request('/notifications', { method: 'GET', token: alice.token })
  ).json.notifications;
  assert.ok(aliceList.length >= 1);
  const aliceIds = new Set(aliceList.map((n) => n.id));

  const bobList = (
    await request('/notifications', { method: 'GET', token: bob.token })
  ).json.notifications;
  assert.ok(
    bobList.every((n) => !aliceIds.has(n.id)),
    'a user must not see another user notifications'
  );

  const steal = await request(`/notifications/${aliceList[0].id}/read`, {
    method: 'PATCH',
    token: bob.token,
  });
  assert.equal(steal.status, 404);
});

test('notifications can be marked read individually and all at once', async () => {
  const user = await createFullUser();

  await request('/deposit', {
    method: 'PUT',
    token: user.token,
    body: { accountNumber: user.accountNumber, amount: '100' },
  });
  await request('/deposit', {
    method: 'PUT',
    token: user.token,
    body: { accountNumber: user.accountNumber, amount: '200' },
  });

  const list = (
    await request('/notifications', { method: 'GET', token: user.token })
  ).json.notifications;
  assert.ok(list.length >= 2);

  const read = await request(`/notifications/${list[0].id}/read`, {
    method: 'PATCH',
    token: user.token,
  });
  assert.equal(read.status, 200);
  assert.equal(read.json.notification.isRead, true);

  const all = await request('/notifications/read-all', {
    method: 'PATCH',
    token: user.token,
  });
  assert.equal(all.status, 200);
  assert.equal(all.json.unreadCount, 0);

  const unread = await request('/notifications/unread-count', {
    method: 'GET',
    token: user.token,
  });
  assert.equal(unread.json.unreadCount, 0);
});

test('notifications can be filtered by category', async () => {
  const user = await createFullUser();

  await request('/deposit', {
    method: 'PUT',
    token: user.token,
    body: { accountNumber: user.accountNumber, amount: '150' },
  });

  const filtered = await request('/notifications?filter=deposit', {
    method: 'GET',
    token: user.token,
  });
  assert.equal(filtered.status, 200);
  assert.ok(filtered.json.notifications.length >= 1);
  assert.ok(filtered.json.notifications.every((n) => n.type === 'deposit'));
});

test('notifications require authentication', async () => {
  const list = await request('/notifications', { method: 'GET' });
  assert.equal(list.status, 403);
});

test('changing the PIN updates the hash, notifies, and emails the user', async () => {
  const user = await createFullUser({ pin: '1234' });

  const res = await request('/change-pin', {
    method: 'PATCH',
    token: user.token,
    body: { currentPin: '1234', newPin: '5678', confirmPin: '5678' },
  });
  assert.equal(res.status, 200);

  const stored = await db.User.findOne({ where: { email: user.email } });
  assert.match(stored.pin, /^\$2[aby]\$/);
  assert.notEqual(stored.pin, '5678');

  const oldPin = await request('/balance', {
    method: 'GET',
    token: user.token,
    body: { accountNumber: user.accountNumber, pin: '1234' },
  });
  assert.equal(oldPin.status, 400);

  const newPin = await request('/balance', {
    method: 'GET',
    token: user.token,
    body: { accountNumber: user.accountNumber, pin: '5678' },
  });
  assert.equal(newPin.status, 200);

  const list = (
    await request('/notifications', { method: 'GET', token: user.token })
  ).json.notifications;
  assert.ok(list.some((n) => n.type === 'pin_changed'));

  const email = emailService
    .getCapturedMessages()
    .find((m) => m.to === user.email && /PIN was changed/i.test(m.subject));
  assert.ok(email, 'a PIN-changed email should be sent');
});

test('changing the PIN rejects an incorrect current PIN', async () => {
  const user = await createFullUser({ pin: '1234' });

  const res = await request('/change-pin', {
    method: 'PATCH',
    token: user.token,
    body: { currentPin: '9999', newPin: '5678', confirmPin: '5678' },
  });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /current PIN is incorrect/i);
});

test('changing the PIN validates the new PIN', async () => {
  const user = await createFullUser({ pin: '1234' });

  const mismatch = await request('/change-pin', {
    method: 'PATCH',
    token: user.token,
    body: { currentPin: '1234', newPin: '5678', confirmPin: '5679' },
  });
  assert.equal(mismatch.status, 400);

  const same = await request('/change-pin', {
    method: 'PATCH',
    token: user.token,
    body: { currentPin: '1234', newPin: '1234', confirmPin: '1234' },
  });
  assert.equal(same.status, 400);
  assert.match(same.json.message, /different/i);

  const badFormat = await request('/change-pin', {
    method: 'PATCH',
    token: user.token,
    body: { currentPin: '1234', newPin: '12', confirmPin: '12' },
  });
  assert.equal(badFormat.status, 400);
});

test('repeated incorrect PIN changes are locked and raise a security alert', async () => {
  const user = await createFullUser({ pin: '1234' });

  for (let i = 0; i < 5; i += 1) {
    const res = await request('/change-pin', {
      method: 'PATCH',
      token: user.token,
      body: { currentPin: '0000', newPin: '5678', confirmPin: '5678' },
    });
    assert.equal(res.status, 400);
  }

  const locked = await request('/change-pin', {
    method: 'PATCH',
    token: user.token,
    body: { currentPin: '1234', newPin: '5678', confirmPin: '5678' },
  });
  assert.equal(locked.status, 429);

  const list = (
    await request('/notifications', { method: 'GET', token: user.token })
  ).json.notifications;
  assert.ok(list.some((n) => n.type === 'security_alert'));

  pinAttempts.resetAll();
});

test('change PIN requires authentication', async () => {
  const res = await request('/change-pin', {
    method: 'PATCH',
    body: { currentPin: '1234', newPin: '5678', confirmPin: '5678' },
  });
  assert.equal(res.status, 403);
});
// ---------------------------------------------------------------------------
// Payments: airtime, data and bills
// ---------------------------------------------------------------------------

// Creates a verified, logged-in user that has NOT created a transaction PIN.
async function createUserWithoutPin(overrides = {}) {
  const payload = signupPayload(overrides);
  const password = payload.password;

  await request('/signup', { method: 'POST', body: payload });
  const code = lastCodeFor(payload.email);
  assert.ok(code, 'verification code should be sent');

  await request('/verify-email', {
    method: 'POST',
    body: { email: payload.email, code },
  });

  const loginRes = await request('/login', {
    method: 'POST',
    body: { email: payload.email, password },
  });

  return {
    name: payload.name,
    email: payload.email,
    password,
    token: loginRes.json.details.token,
    accountNumber: loginRes.json.details.accountNum,
  };
}

async function fund(user, amount) {
  const res = await request('/deposit', {
    method: 'PUT',
    token: user.token,
    body: { accountNumber: user.accountNumber, amount: String(amount) },
  });
  assert.equal(res.status, 200);
}

async function currentBalance(user) {
  const res = await request('/account/balance', { method: 'GET', token: user.token });
  assert.equal(res.status, 200);
  return res.json.balance;
}

test('a user can list supported networks for airtime and data', async () => {
  const user = await createFullUser();

  const airtime = await request('/airtime/networks', { method: 'GET', token: user.token });
  assert.equal(airtime.status, 200);
  assert.equal(airtime.json.paymentMode, 'simulation');
  const ids = airtime.json.networks.map((n) => n.id);
  assert.ok(ids.includes('mtn') && ids.includes('airtel'));

  const data = await request('/data/networks', { method: 'GET', token: user.token });
  assert.equal(data.status, 200);
  assert.ok(data.json.networks.length >= 4);
  assert.ok(!('price' in data.json.networks[0]), 'networks must not leak prices');
});

test('data plans are scoped to the selected network', async () => {
  const user = await createFullUser();

  const mtn = await request('/data/plans?network=mtn', { method: 'GET', token: user.token });
  assert.equal(mtn.status, 200);
  assert.ok(mtn.json.plans.length > 0);
  assert.ok(mtn.json.plans.every((p) => p.network === 'mtn'));

  const glo = await request('/data/plans?network=glo', { method: 'GET', token: user.token });
  assert.ok(glo.json.plans.every((p) => p.network === 'glo'));
  assert.notDeepEqual(
    mtn.json.plans.map((p) => p.id),
    glo.json.plans.map((p) => p.id)
  );

  const unknown = await request('/data/plans?network=unknown', {
    method: 'GET',
    token: user.token,
  });
  assert.equal(unknown.status, 404);
});

test('airtime purchase validates network, phone, amount and PIN', async () => {
  const user = await createFullUser();
  await fund(user, 1000);

  const cases = [
    { network: 'unknown', phone: '08030000001', amount: '100' },
    { network: 'mtn', phone: 'bad-number', amount: '100' },
    { network: 'mtn', phone: '08030000001', amount: '0' },
    { network: 'mtn', phone: '08030000001', amount: '-50' },
    { network: 'mtn', phone: '08030000001', amount: '25' },
  ];

  for (const c of cases) {
    const { status } = await request('/airtime/purchase', {
      method: 'POST',
      token: user.token,
      body: { ...c, pin: user.pin },
    });
    assert.ok(status >= 400, `expected rejection for ${JSON.stringify(c)}`);
  }

  assert.equal(await currentBalance(user), 1000, 'no funds debited for invalid requests');
});

test('a user without a transaction PIN cannot make a PIN-protected payment', async () => {
  const user = await createUserWithoutPin();
  await fund(user, 1000);

  const noPin = await request('/airtime/purchase', {
    method: 'POST',
    token: user.token,
    body: { network: 'mtn', phone: '08030000001', amount: '100' },
  });
  assert.ok(noPin.status >= 400);

  const fakePin = await request('/airtime/purchase', {
    method: 'POST',
    token: user.token,
    body: { network: 'mtn', phone: '08030000001', amount: '100', pin: '1234' },
  });
  assert.ok(fakePin.status >= 400);

  assert.equal(await currentBalance(user), 1000, 'balance must be untouched');
});

test('a payer cannot debit another account by changing request ids', async () => {
  const payer = await createFullUser();
  const victim = await createFullUser();
  await fund(payer, 1000);
  await fund(victim, 1000);

  const res = await request('/airtime/purchase', {
    method: 'POST',
    token: payer.token,
    body: {
      network: 'mtn',
      phone: '08030000001',
      amount: '200',
      pin: payer.pin,
      from: victim.accountNumber,
      accountNumber: victim.accountNumber,
    },
  });
  assert.equal(res.status, 200);

  assert.equal(await currentBalance(payer), 800, 'payer is debited');
  assert.equal(await currentBalance(victim), 1000, 'victim is never touched');
});

test('airtime purchase debits once and creates exactly one debit notification', async () => {
  const user = await createFullUser();
  await fund(user, 1000);

  const res = await request('/airtime/purchase', {
    method: 'POST',
    token: user.token,
    body: { network: 'mtn', phone: '08030000001', amount: '300', pin: user.pin },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'success');
  assert.equal(res.json.simulated, true);
  assert.ok(res.json.transaction.reference);
  assert.equal(res.json.transaction.amount, 300);

  assert.equal(await currentBalance(user), 700);

  const list = (
    await request('/notifications', { method: 'GET', token: user.token })
  ).json.notifications;
  const debits = list.filter((n) => n.type === 'debit' && n.reference === res.json.transaction.reference);
  assert.equal(debits.length, 1);
  assert.match(debits[0].title, /Airtime/);
});

test('a replay with the same reference does not charge twice', async () => {
  const user = await createFullUser();
  await fund(user, 1000);
  const reference = `air-idem-${Date.now()}`;
  const body = {
    network: 'mtn',
    phone: '08030000001',
    amount: '250',
    pin: user.pin,
    reference,
  };

  const first = await request('/airtime/purchase', { method: 'POST', token: user.token, body });
  assert.equal(first.status, 200);

  const replay = await request('/airtime/purchase', { method: 'POST', token: user.token, body });
  assert.equal(replay.status, 200);
  assert.equal(replay.json.idempotent, true);
  assert.equal(replay.json.transaction.id, first.json.transaction.id);

  assert.equal(await currentBalance(user), 750, 'only one debit');

  const list = (
    await request('/notifications', { method: 'GET', token: user.token })
  ).json.notifications;
  assert.equal(
    list.filter((n) => n.type === 'debit' && n.reference === reference).length,
    1
  );
});

test('insufficient balance is rejected without partial effects', async () => {
  const user = await createFullUser();
  await fund(user, 100);

  const res = await request('/airtime/purchase', {
    method: 'POST',
    token: user.token,
    body: { network: 'mtn', phone: '08030000001', amount: '5000', pin: user.pin },
  });
  assert.equal(res.status, 400);
  assert.equal(await currentBalance(user), 100);
});

test('data purchase resolves the plan price on the server and ignores client price', async () => {
  const user = await createFullUser();
  await fund(user, 5000);

  const res = await request('/data/purchase', {
    method: 'POST',
    token: user.token,
    body: {
      network: 'mtn',
      planId: 'mtn-1gb-1d',
      phone: '08030000001',
      amount: '1',
      price: '1',
      pin: user.pin,
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.transaction.amount, 350, 'uses catalog price, not client price');
  assert.equal(await currentBalance(user), 4650);
});

test('data purchase rejects an unknown plan', async () => {
  const user = await createFullUser();
  await fund(user, 5000);

  const res = await request('/data/purchase', {
    method: 'POST',
    token: user.token,
    body: { network: 'mtn', planId: 'nope', phone: '08030000001', pin: user.pin },
  });
  assert.equal(res.status, 400);
  assert.equal(await currentBalance(user), 5000);
});

test('bill payment validates customer details and pays a fixed plan', async () => {
  const user = await createFullUser();
  await fund(user, 30000);

  const categories = await request('/bills/categories', { method: 'GET', token: user.token });
  assert.equal(categories.status, 200);
  assert.ok(categories.json.categories.some((c) => c.id === 'electricity'));

  const providers = await request('/bills/providers?category=cable-tv', {
    method: 'GET',
    token: user.token,
  });
  assert.equal(providers.status, 200);
  const dstv = providers.json.providers.find((p) => p.id === 'dstv');
  assert.ok(dstv && dstv.plans.length > 0);

  const badValidate = await request('/bills/validate', {
    method: 'POST',
    token: user.token,
    body: { category: 'cable-tv', provider: 'dstv', customerRef: '00001234' },
  });
  assert.equal(badValidate.status, 404);

  const goodValidate = await request('/bills/validate', {
    method: 'POST',
    token: user.token,
    body: { category: 'cable-tv', provider: 'dstv', customerRef: '12345678' },
  });
  assert.equal(goodValidate.status, 200);
  assert.ok(goodValidate.json.customer.name);

  const pay = await request('/bills/pay', {
    method: 'POST',
    token: user.token,
    body: {
      category: 'cable-tv',
      provider: 'dstv',
      customerRef: '12345678',
      planId: 'dstv-padi',
      amount: '1',
      pin: user.pin,
    },
  });
  assert.equal(pay.status, 200);
  assert.equal(pay.json.transaction.amount, 4400);
  assert.equal(await currentBalance(user), 25600);

  const list = (
    await request('/notifications', { method: 'GET', token: user.token })
  ).json.notifications;
  assert.ok(
    list.some((n) => n.type === 'debit' && /Bill Payment/.test(n.title))
  );
});

test('electricity bill rejects an out-of-range amount', async () => {
  const user = await createFullUser();
  await fund(user, 100000);

  const res = await request('/bills/pay', {
    method: 'POST',
    token: user.token,
    body: {
      category: 'electricity',
      provider: 'ikedc',
      customerRef: '1234567890',
      amount: '100',
      pin: user.pin,
    },
  });
  assert.equal(res.status, 400);
  assert.equal(await currentBalance(user), 100000);
});

test('a declined payment is refunded and never produces a debit notification', async () => {
  const user = await createFullUser();
  await fund(user, 1000);

  // The simulated provider declines recipients ending in 0000.
  const body = { network: 'mtn', phone: '08030000000', amount: '400', pin: user.pin };
  const res = await request('/airtime/purchase', {
    method: 'POST',
    token: user.token,
    body,
  });
  assert.equal(res.status, 402);
  assert.equal(res.json.status, 'failed');

  assert.equal(await currentBalance(user), 1000, 'reserved funds are returned');

  const list = (
    await request('/notifications', { method: 'GET', token: user.token })
  ).json.notifications;
  assert.ok(!list.some((n) => n.type === 'debit'), 'no false debit notification');
  assert.ok(list.some((n) => n.type === 'reversal'), 'a reversal notification is written');
  assert.ok(list.some((n) => n.type === 'failed'), 'a failure notification is written');

  const reversal = list.find((n) => n.type === 'reversal');
  assert.equal(reversal.amount, 400);

  // Replaying the same failed reference must not be reported as success.
  const replayBody = { ...body, reference: res.json.transaction.reference };
  const replay = await request('/airtime/purchase', {
    method: 'POST',
    token: user.token,
    body: replayBody,
  });
  assert.equal(replay.status, 402);
  assert.equal(replay.json.status, 'failed');
  assert.equal(replay.json.idempotent, true);
  assert.equal(await currentBalance(user), 1000, 'no second refund or debit');
});

test('transaction history lists payment amounts and statuses', async () => {
  const user = await createFullUser();
  await fund(user, 1000);

  const purchase = await request('/airtime/purchase', {
    method: 'POST',
    token: user.token,
    body: { network: 'mtn', phone: '08030000001', amount: '200', pin: user.pin },
  });
  assert.equal(purchase.status, 200);

  const history = await request('/airtime/history', { method: 'GET', token: user.token });
  assert.equal(history.status, 200);
  const found = history.json.transactions.find(
    (t) => t.reference === purchase.json.transaction.reference
  );
  assert.ok(found, 'payment appears in airtime history');
  assert.equal(found.amount, 200);
  assert.equal(found.status, 'success');
  assert.equal(found.type, 'airtime');

  const allTx = await request('/transactions', { method: 'GET', token: user.token });
  assert.ok(
    allTx.json.transactions.some((t) => t.reference === purchase.json.transaction.reference),
    'payment also appears in the general history'
  );
});

test('email delivery failure does not repeat or reverse a payment', async () => {
  const user = await createFullUser();
  await fund(user, 1000);
  emailService.setMockFailure(true);
  try {
    const res = await request('/airtime/purchase', {
      method: 'POST',
      token: user.token,
      body: { network: 'mtn', phone: '08030000001', amount: '150', pin: user.pin },
    });
    assert.equal(res.status, 200);
    assert.equal(await currentBalance(user), 850, 'debited exactly once');

    const txs = (
      await request('/airtime/history', { method: 'GET', token: user.token })
    ).json.transactions;
    assert.equal(
      txs.filter((t) => t.reference === res.json.transaction.reference).length,
      1
    );
  } finally {
    emailService.setMockFailure(false);
  }
});

test('concurrent payments cannot overspend a balance', async () => {
  const user = await createFullUser();
  await fund(user, 1000);

  const make = () =>
    request('/airtime/purchase', {
      method: 'POST',
      token: user.token,
      body: {
        network: 'mtn',
        phone: '08030000001',
        amount: '600',
        pin: user.pin,
        reference: `concurrent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    });

  const results = await Promise.all([make(), make(), make()]);
  const successes = results.filter((r) => r.status === 200 && r.json.status === 'success');
  assert.equal(successes.length, 1, 'only one 600 payment can succeed from 1000');
  assert.equal(await currentBalance(user), 400);
});

test('payments require authentication and a matching PIN', async () => {
  const user = await createFullUser();
  await fund(user, 1000);

  const noAuth = await request('/airtime/purchase', {
    method: 'POST',
    body: { network: 'mtn', phone: '08030000001', amount: '100', pin: user.pin },
  });
  assert.equal(noAuth.status, 403);

  const wrongPin = await request('/airtime/purchase', {
    method: 'POST',
    token: user.token,
    body: { network: 'mtn', phone: '08030000001', amount: '100', pin: '0000' },
  });
  assert.equal(wrongPin.status, 400);
  assert.equal(await currentBalance(user), 1000);
});

// ---------------------------------------------------------------------------
// Bank catalog and recipient-account validation
// ---------------------------------------------------------------------------

test('GET /banks lists BBT Cash Bank as the default internal bank', async () => {
  const user = await createFullUser();

  const res = await request('/banks', { method: 'GET', token: user.token });
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'success');
  assert.equal(res.json.defaultBank, 'bbt-cash');

  const bbt = res.json.banks.find((b) => b.id === 'bbt-cash');
  assert.ok(bbt, 'BBT Cash Bank must be in the catalog');
  assert.equal(bbt.name, 'BBT Cash Bank');
  assert.equal(bbt.internal, true);
  assert.equal(bbt.accountNumberLength, 10);

  assert.ok(
    res.json.banks.some((b) => b.internal === false),
    'external banks are listed and clearly marked'
  );
  assert.ok(
    res.json.banks.every((b) => b.providerConfigured !== undefined),
    'configured/provider status must be exposed'
  );
});

test('banks and account validation require a session', async () => {
  const banks = await request('/banks', { method: 'GET' });
  assert.equal(banks.status, 403);

  const validate = await request('/transfer/validate-account', {
    method: 'POST',
    body: { bank: 'bbt-cash', accountNumber: '0000000000' },
  });
  assert.equal(validate.status, 403);
});

test('BBT account validation rejects short, long and nonnumeric numbers', async () => {
  const user = await createFullUser();
  const cases = ['', '1', '123456789', '12345678901', 'abcdefghij', '000000000a'];

  for (const accountNumber of cases) {
    const res = await request('/transfer/validate-account', {
      method: 'POST',
      token: user.token,
      body: { bank: 'bbt-cash', accountNumber },
    });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(accountNumber)}`);
    assert.match(res.json.message, /Invalid account number/i);
    assert.match(res.json.message, /BBT Cash Bank/);
  }
});

test('BBT account validation rejects a nonexistent account', async () => {
  const user = await createFullUser();

  const res = await request('/transfer/validate-account', {
    method: 'POST',
    token: user.token,
    body: { bank: 'bbt-cash', accountNumber: '0000000000' },
  });
  assert.equal(res.status, 404);
  assert.equal(res.json.message, 'Recipient account not found. Please check the account number.');
  assert.equal(res.json.code, 'recipient_not_found');
});

test('BBT account validation resolves an existing recipient without leaking secrets', async () => {
  const sender = await createFullUser();
  const receiver = await createFullUser();

  const res = await request('/transfer/validate-account', {
    method: 'POST',
    token: sender.token,
    body: { bank: 'bbt-cash', accountNumber: receiver.accountNumber },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.status, 'success');
  assert.equal(res.json.account.name, receiver.name);
  assert.equal(res.json.account.accountNumber, receiver.accountNumber);
  assert.equal(res.json.account.internal, true);

  const serialized = JSON.stringify(res.json);
  assert.ok(!serialized.includes(receiver.password));
  assert.ok(!serialized.includes(receiver.pin));
});

test('external bank validation enforces 11 digits and is refused without a provider', async () => {
  const user = await createFullUser();

  const short = await request('/transfer/validate-account', {
    method: 'POST',
    token: user.token,
    body: { bank: 'gtbank', accountNumber: '0000000000' },
  });
  assert.equal(short.status, 400);
  assert.equal(short.json.message, 'Invalid account number. Please enter an 11-digit account number.');

  const long = await request('/transfer/validate-account', {
    method: 'POST',
    token: user.token,
    body: { bank: 'gtbank', accountNumber: '000000000000' },
  });
  assert.equal(long.status, 400);

  const formatted = await request('/transfer/validate-account', {
    method: 'POST',
    token: user.token,
    body: { bank: 'gtbank', accountNumber: '00000000001' },
  });
  assert.equal(formatted.status, 503);
  assert.equal(formatted.json.code, 'EXTERNAL_TRANSFER_UNAVAILABLE');
});

test('a transfer to an external bank is refused and never debits the sender', async () => {
  const sender = await createFullUser();
  await fund(sender, 1000);

  const res = await request('/transfer', {
    method: 'POST',
    token: sender.token,
    body: {
      from: sender.accountNumber,
      to: '00000000001',
      amount: '100',
      pin: sender.pin,
      bank: 'gtbank',
    },
  });
  assert.equal(res.status, 503);
  assert.equal(res.json.code, 'EXTERNAL_TRANSFER_UNAVAILABLE');
  assert.equal(await currentBalance(sender), 1000, 'no external "success" debit');
});

test('an unknown bank is rejected', async () => {
  const user = await createFullUser();
  await fund(user, 1000);

  const validate = await request('/transfer/validate-account', {
    method: 'POST',
    token: user.token,
    body: { bank: 'nope', accountNumber: '0000000000' },
  });
  assert.equal(validate.status, 400);

  const transfer = await request('/transfer', {
    method: 'POST',
    token: user.token,
    body: {
      from: user.accountNumber,
      to: '0000000000',
      amount: '10',
      pin: user.pin,
      bank: 'nope',
    },
  });
  assert.equal(transfer.status, 400);
  assert.equal(await currentBalance(user), 1000);
});

test('an internal transfer works when the bank is passed explicitly', async () => {
  const sender = await createFullUser();
  const receiver = await createFullUser();
  await fund(sender, 1000);

  const res = await request('/transfer', {
    method: 'POST',
    token: sender.token,
    body: {
      from: sender.accountNumber,
      to: receiver.accountNumber,
      amount: '300',
      pin: sender.pin,
      bank: 'bbt-cash',
    },
  });
  assert.equal(res.status, 200);
  assert.equal(await currentBalance(sender), 700);
  assert.equal(await currentBalance(receiver), 300);
});
