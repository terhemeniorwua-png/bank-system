'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('../src/app');

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

const uniqueUser = (role, overrides = {}) => {
  const stamp = Date.now() + Math.floor(Math.random() * 100000);
  return {
    name: `Test User ${stamp}`,
    email: `user${stamp}@test.local`,
    phone: '08012345678',
    password: 'Test@1234',
    pin: '1234',
    role,
    ...overrides,
  };
};

test('registration accepts a valid user', async () => {
  const payload = uniqueUser('user');
  const { status, json } = await request('/register', { method: 'POST', body: payload });
  assert.equal(status, 200);
  assert.equal(json.status, 'Success');
  assert.equal(json.message, 'Account created successfully');
});

test('registration rejects an invalid role', async () => {
  const payload = uniqueUser('superadmin');
  const { status, json } = await request('/register', { method: 'POST', body: payload });
  assert.equal(status, 409);
  assert.equal(json.message, 'Invalid role');
});

test('registration rejects a duplicate email', async () => {
  const payload = uniqueUser('user');
  await request('/register', { method: 'POST', body: payload });
  const { status, json } = await request('/register', { method: 'POST', body: payload });
  assert.equal(status, 409);
  assert.equal(json.message, 'Email already exist');
});

test('registration rejects an invalid password', async () => {
  const payload = uniqueUser('user', { password: 'weakpass' });
  const { status, json } = await request('/register', { method: 'POST', body: payload });
  assert.equal(status, 400);
  assert.equal(json.message, 'Validation failed');
});

test('login succeeds with correct credentials', async () => {
  const payload = uniqueUser('user');
  await request('/register', { method: 'POST', body: payload });
  const { status, json } = await request('/login', {
    method: 'POST',
    body: { email: payload.email, password: payload.password },
  });
  assert.equal(status, 200);
  assert.equal(json.status, 'success');
  assert.ok(json.details.token);
  assert.equal(json.details.role, 'user');
  assert.ok(!json.details.password, 'password hash must not be returned');
});

test('login rejects a wrong password', async () => {
  const payload = uniqueUser('user');
  await request('/register', { method: 'POST', body: payload });
  const { status, json } = await request('/login', {
    method: 'POST',
    body: { email: payload.email, password: 'Wrong@999' },
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

test('protected routes reject missing tokens', async () => {
  const { status } = await request('/balance', { method: 'GET', body: {} });
  assert.equal(status, 403);
});

test('deposit credits the account and records a transaction', async () => {
  const payload = uniqueUser('user');
  await request('/register', { method: 'POST', body: payload });
  const login = await request('/login', {
    method: 'POST',
    body: { email: payload.email, password: payload.password },
  });
  const token = login.json.details.token;
  const accountNumber = login.json.details.accountNum;

  const { status, json } = await request('/deposit', {
    method: 'PUT',
    token,
    body: { accountNumber, amount: '1000' },
  });
  assert.equal(status, 200);
  assert.equal(json.message, 'Deposit successful');
  assert.equal(json.userDetails.amount, 1000);
  assert.ok(!('password' in json.userDetails), 'deposit response must not expose the password');
});

test('deposit rejects an invalid amount', async () => {
  const payload = uniqueUser('user');
  await request('/register', { method: 'POST', body: payload });
  const login = await request('/login', {
    method: 'POST',
    body: { email: payload.email, password: payload.password },
  });
  const token = login.json.details.token;

  const { status } = await request('/deposit', {
    method: 'PUT',
    token,
    body: { accountNumber: login.json.details.accountNum, amount: 'abc' },
  });
  assert.equal(status, 400);
});

test('balance returns the current balance when pin matches', async () => {
  const payload = uniqueUser('user');
  await request('/register', { method: 'POST', body: payload });
  const login = await request('/login', {
    method: 'POST',
    body: { email: payload.email, password: payload.password },
  });
  const token = login.json.details.token;
  const accountNumber = login.json.details.accountNum;

  await request('/deposit', {
    method: 'PUT',
    token,
    body: { accountNumber, amount: '500' },
  });

  const { status, json } = await request('/balance', {
    method: 'GET',
    token,
    body: { accountNumber, pin: payload.pin },
  });
  assert.equal(status, 200);
  assert.equal(json.balance, 'Your balance is 500');
});

test('transfer debits sender and credits recipient atomically', async () => {
  const sender = uniqueUser('user');
  const receiver = uniqueUser('user');
  await request('/register', { method: 'POST', body: sender });
  await request('/register', { method: 'POST', body: receiver });

  const senderLogin = await request('/login', {
    method: 'POST',
    body: { email: sender.email, password: sender.password },
  });
  const receiverLogin = await request('/login', {
    method: 'POST',
    body: { email: receiver.email, password: receiver.password },
  });
  const sendToken = senderLogin.json.details.token;
  const recvToken = receiverLogin.json.details.token;
  const from = senderLogin.json.details.accountNum;
  const to = receiverLogin.json.details.accountNum;

  await request('/deposit', {
    method: 'PUT',
    token: sendToken,
    body: { accountNumber: from, amount: '1000' },
  });

  const { status, json } = await request('/transfer', {
    method: 'POST',
    token: sendToken,
    body: { from, to, amount: '400', pin: sender.pin },
  });
  assert.equal(status, 200);
  assert.equal(json.status, 'sucess');
  assert.equal(json.message, `Transfer to ${receiver.name} successful. Your balance is 600`);

  const senderBal = await request('/balance', {
    method: 'GET',
    token: sendToken,
    body: { accountNumber: from, pin: sender.pin },
  });
  assert.equal(senderBal.json.balance, 'Your balance is 600');

  const receiverBal = await request('/balance', {
    method: 'GET',
    token: recvToken,
    body: { accountNumber: to, pin: receiver.pin },
  });
  assert.equal(receiverBal.json.balance, 'Your balance is 400');
});

test('transfer rejects insufficient funds without partial effects', async () => {
  const sender = uniqueUser('user');
  const receiver = uniqueUser('user');
  await request('/register', { method: 'POST', body: sender });
  await request('/register', { method: 'POST', body: receiver });

  const senderLogin = await request('/login', {
    method: 'POST',
    body: { email: sender.email, password: sender.password },
  });
  const sendToken = senderLogin.json.details.token;
  const receiverLogin = await request('/login', {
    method: 'POST',
    body: { email: receiver.email, password: receiver.password },
  });
  const recvToken = receiverLogin.json.details.token;
  const from = senderLogin.json.details.accountNum;
  const to = receiverLogin.json.details.accountNum;

  await request('/deposit', {
    method: 'PUT',
    token: sendToken,
    body: { accountNumber: from, amount: '100' },
  });

  const { status } = await request('/transfer', {
    method: 'POST',
    token: sendToken,
    body: { from, to, amount: '5000', pin: sender.pin },
  });
  assert.equal(status, 400);

  const senderBal = await request('/balance', {
    method: 'GET',
    token: sendToken,
    body: { accountNumber: from, pin: sender.pin },
  });
  assert.equal(senderBal.json.balance, 'Your balance is 100');

  const receiverBal = await request('/balance', {
    method: 'GET',
    token: recvToken,
    body: { accountNumber: to, pin: receiver.pin },
  });
  assert.equal(receiverBal.json.balance, 'Your balance is 0');
});

test('transfer rejects an unknown recipient', async () => {
  const sender = uniqueUser('user');
  await request('/register', { method: 'POST', body: sender });
  const senderLogin = await request('/login', {
    method: 'POST',
    body: { email: sender.email, password: sender.password },
  });
  const sendToken = senderLogin.json.details.token;

  const { status, json } = await request('/transfer', {
    method: 'POST',
    token: sendToken,
    body: { from: senderLogin.json.details.accountNum, to: '9999999999', amount: '10', pin: sender.pin },
  });
  assert.equal(status, 404);
  assert.equal(json.message, 'Recipient not found');
});

test('concurrent transfers cannot overspend a balance', async () => {
  const sender = uniqueUser('user');
  const receiverA = uniqueUser('user');
  const receiverB = uniqueUser('user');
  await request('/register', { method: 'POST', body: sender });
  await request('/register', { method: 'POST', body: receiverA });
  await request('/register', { method: 'POST', body: receiverB });

  const senderLogin = await request('/login', {
    method: 'POST',
    body: { email: sender.email, password: sender.password },
  });
  const sendToken = senderLogin.json.details.token;
  const from = senderLogin.json.details.accountNum;

  await request('/deposit', {
    method: 'PUT',
    token: sendToken,
    body: { accountNumber: from, amount: '1000' },
  });

  const loginA = await request('/login', {
    method: 'POST',
    body: { email: receiverA.email, password: receiverA.password },
  });
  const loginB = await request('/login', {
    method: 'POST',
    body: { email: receiverB.email, password: receiverB.password },
  });
  const toA = loginA.json.details.accountNum;
  const toB = loginB.json.details.accountNum;

  const [resA, resB] = await Promise.all([
    request('/transfer', {
      method: 'POST',
      token: sendToken,
      body: { from, to: toA, amount: '1000', pin: sender.pin },
    }),
    request('/transfer', {
      method: 'POST',
      token: sendToken,
      body: { from, to: toB, amount: '1000', pin: sender.pin },
    }),
  ]);

  const statuses = [resA.status, resB.status].sort();
  assert.deepEqual(statuses, [200, 400]);

  const senderBal = await request('/balance', {
    method: 'GET',
    token: sendToken,
    body: { accountNumber: from, pin: sender.pin },
  });
  assert.equal(senderBal.json.balance, 'Your balance is 0');
});

test('transfer is idempotent for a supplied reference', async () => {
  const sender = uniqueUser('user');
  const receiver = uniqueUser('user');
  await request('/register', { method: 'POST', body: sender });
  await request('/register', { method: 'POST', body: receiver });

  const senderLogin = await request('/login', {
    method: 'POST',
    body: { email: sender.email, password: sender.password },
  });
  const sendToken = senderLogin.json.details.token;
  const from = senderLogin.json.details.accountNum;
  const receiverLogin = await request('/login', {
    method: 'POST',
    body: { email: receiver.email, password: receiver.password },
  });
  const to = receiverLogin.json.details.accountNum;
  const reference = `REF-${Date.now()}`;

  await request('/deposit', {
    method: 'PUT',
    token: sendToken,
    body: { accountNumber: from, amount: '1000' },
  });

  const first = await request('/transfer', {
    method: 'POST',
    token: sendToken,
    body: { from, to, amount: '100', pin: sender.pin, reference },
  });
  assert.equal(first.status, 200);

  const second = await request('/transfer', {
    method: 'POST',
    token: sendToken,
    body: { from, to, amount: '100', pin: sender.pin, reference },
  });
  assert.equal(second.status, 409);
  assert.equal(second.json.message, 'Duplicate transaction');

  const senderBal = await request('/balance', {
    method: 'GET',
    token: sendToken,
    body: { accountNumber: from, pin: sender.pin },
  });
  assert.equal(senderBal.json.balance, 'Your balance is 900');
});

test('admin can deposit into any account', async () => {
  const admin = uniqueUser('admin');
  const target = uniqueUser('user');
  await request('/register', { method: 'POST', body: admin });
  await request('/register', { method: 'POST', body: target });

  const adminLogin = await request('/login', {
    method: 'POST',
    body: { email: admin.email, password: admin.password },
  });
  const adminToken = adminLogin.json.details.token;
  const targetLogin = await request('/login', {
    method: 'POST',
    body: { email: target.email, password: target.password },
  });
  const targetToken = targetLogin.json.details.token;
  const targetAcc = targetLogin.json.details.accountNum;

  const { status, json } = await request(`/adminDeposit/${targetAcc}`, {
    method: 'POST',
    token: adminToken,
    body: { pin: admin.pin, amount: '2000' },
  });
  assert.equal(status, 200);
  assert.equal(json.message, 'Successfully deposited 2000. New balance is 2000');

  const bal = await request('/balance', {
    method: 'GET',
    token: targetToken,
    body: { accountNumber: targetAcc, pin: target.pin },
  });
  assert.equal(bal.json.balance, 'Your balance is 2000');
});

test('non-admin cannot use the admin endpoint', async () => {
  const user = uniqueUser('user');
  const target = uniqueUser('user');
  await request('/register', { method: 'POST', body: user });
  await request('/register', { method: 'POST', body: target });

  const userLogin = await request('/login', {
    method: 'POST',
    body: { email: user.email, password: user.password },
  });
  const userToken = userLogin.json.details.token;
  const targetLogin = await request('/login', {
    method: 'POST',
    body: { email: target.email, password: target.password },
  });

  const { status } = await request(`/adminDeposit/${targetLogin.json.details.accountNum}`, {
    method: 'POST',
    token: userToken,
    body: { pin: user.pin, amount: '500' },
  });
  assert.equal(status, 400);
});

test('transaction history lists deposits and transfers', async () => {
  const sender = uniqueUser('user');
  const receiver = uniqueUser('user');
  await request('/register', { method: 'POST', body: sender });
  await request('/register', { method: 'POST', body: receiver });

  const senderLogin = await request('/login', {
    method: 'POST',
    body: { email: sender.email, password: sender.password },
  });
  const sendToken = senderLogin.json.details.token;
  const from = senderLogin.json.details.accountNum;
  const receiverLogin = await request('/login', {
    method: 'POST',
    body: { email: receiver.email, password: receiver.password },
  });
  const to = receiverLogin.json.details.accountNum;

  await request('/deposit', {
    method: 'PUT',
    token: sendToken,
    body: { accountNumber: from, amount: '300' },
  });
  await request('/transfer', {
    method: 'POST',
    token: sendToken,
    body: { from, to, amount: '100', pin: sender.pin },
  });

  const { status, json } = await request('/transactions', { method: 'GET', token: sendToken });
  assert.equal(status, 200);
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.transactions));
  assert.ok(json.transactions.length >= 2);
  const types = json.transactions.map((t) => t.type).sort();
  assert.ok(types.includes('deposit'));
  assert.ok(types.includes('transfer'));
});