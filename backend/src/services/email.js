'use strict';

const nodemailer = require('nodemailer');

require('dotenv').config({ quiet: true });

const IN_TEST_MODE = process.env.NODE_ENV === 'test';

// Test mode never touches a real SMTP server. Incoming messages are captured
// in memory so automated tests can assert delivery and inspect recipients and
// content without using real credentials or sending real email.
const capturedMessages = [];
let mockFailNext = false;

const smtpConfig = {
  host: process.env.BREVO_SMTP_HOST,
  port: process.env.BREVO_SMTP_PORT
    ? Number(process.env.BREVO_SMTP_PORT)
    : 587,
  user: process.env.BREVO_SMTP_USER,
  pass: process.env.BREVO_SMTP_KEY,
  senderEmail: process.env.BREVO_SENDER_EMAIL,
  senderName: process.env.BREVO_SENDER_NAME || 'BBT Cash',
};

const smtpConfigured = Boolean(smtpConfig.host && smtpConfig.user && smtpConfig.pass);

let transporter = null;

if (!IN_TEST_MODE) {
  if (smtpConfigured) {
    transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.port === 465,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
      // STARTTLS (port 587) with certificate verification enabled.
      tls: {
        rejectUnauthorized: true,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
}

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const brandHeader = () => `
  <tr>
    <td align="center" style="padding: 32px 24px 8px;">
      <p style="margin:0;font-size:22px;font-weight:700;color:#168BFA;font-family:Arial,Helvetica,sans-serif;">BBT Cash</p>
    </td>
  </tr>
`;

const footer = () => `
  <tr>
    <td align="center" style="padding: 24px;font-family:Arial,Helvetica,sans-serif;">
      <p style="margin:0 0 8px;font-size:12px;color:#7184A6;">
        If you did not request this email, you can safely ignore it.
      </p>
      <p style="margin:0;font-size:12px;color:#7184A6;">This is a service message from BBT Cash.</p>
    </td>
  </tr>
`;

function renderVerificationEmail({ name, code }) {
  const firstName = name ? String(name).trim().split(/\s+/)[0] : '';
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <body style="margin:0;padding:0;background:#F5F9FF;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F9FF;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:#FFFFFF;border-radius:16px;box-shadow:0 4px 20px rgba(16,42,86,0.08);">
        ${brandHeader()}
            <tr>
              <td style="padding:16px 32px;font-family:Arial,Helvetica,sans-serif;">
                <h1 style="margin:0 0 12px;font-size:22px;color:#102A56;">Verify your BBT Cash email</h1>
                <p style="margin:0 0 6px;font-size:15px;color:#102A56;line-height:1.6;">
                  Hello${firstName ? ` ${escapeHtml(firstName)}` : ''},
                </p>
                <p style="margin:0 0 20px;font-size:15px;color:#102A56;line-height:1.6;">
                  Use the six-digit code below to verify your email address and finish creating
                  your BBT Cash account.
                </p>
                <p align="center" style="margin:0 0 20px;">
                  <span style="display:inline-block;padding:16px 24px;background:#EAF5FF;border-radius:12px;font-size:32px;font-weight:700;letter-spacing:8px;color:#0755C9;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(code)}</span>
                </p>
                <p style="margin:0 0 20px;font-size:14px;color:#7184A6;line-height:1.6;">
                  This code expires in <strong>10 minutes</strong>. If you did not request it, you can
                  safely ignore this email.
                </p>
                <p style="margin:0;padding:14px 16px;background:#F5F9FF;border-left:4px solid #168BFA;font-size:14px;color:#102A56;line-height:1.6;">
                  <strong>Never share this code with anyone.</strong> BBT Cash will never ask for your
                  password or verification code by text, email, or phone.
                </p>
              </td>
            </tr>
        ${footer()}
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  const text = [
    'BBT Cash',
    '',
    'Verify your BBT Cash email',
    '',
    `Hello${firstName ? ` ${firstName}` : ''},`,
    '',
    `Use the six-digit code ${code} to verify your email address and finish`,
    'creating your BBT Cash account.',
    '',
    'This code expires in 10 minutes.',
    '',
    'Never share this code with anyone.',
  ].join('\n');

  return { subject: 'BBT Cash — Verify your email', text, html };
}

function renderAccountCreatedEmail({ name, accountNumber, accountType, email }) {
  const firstName = name ? String(name).trim().split(/\s+/)[0] : '';
  const accountTypeLabel = accountType || 'User';
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <body style="margin:0;padding:0;background:#F5F9FF;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F9FF;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:#FFFFFF;border-radius:16px;box-shadow:0 4px 20px rgba(16,42,86,0.08);">
        ${brandHeader()}
            <tr>
              <td style="padding:16px 32px;font-family:Arial,Helvetica,sans-serif;">
                <h1 style="margin:0 0 12px;font-size:22px;color:#102A56;">Welcome to BBT Cash</h1>
                <p style="margin:0 0 6px;font-size:15px;color:#102A56;line-height:1.6;">
                  Hello${firstName ? ` ${escapeHtml(firstName)}` : ''},
                </p>
                <p style="margin:0 0 20px;font-size:15px;color:#102A56;line-height:1.6;">
                  Your email has been verified and your BBT Cash account has been created
                  successfully.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F9FF;border-radius:12px;margin-bottom:20px;">
                  <tr>
                    <td style="padding:16px 20px;font-family:Arial,Helvetica,sans-serif;">
                      <p style="margin:0 0 4px;font-size:12px;color:#7184A6;">ACCOUNT NUMBER</p>
                      <p style="margin:0 0 14px;font-size:20px;font-weight:700;color:#102A56;letter-spacing:2px;">${escapeHtml(accountNumber)}</p>
                      <p style="margin:0 0 4px;font-size:12px;color:#7184A6;">ACCOUNT TYPE</p>
                      <p style="margin:0 0 14px;font-size:15px;color:#102A56;">${escapeHtml(accountTypeLabel)}</p>
                      <p style="margin:0 0 4px;font-size:12px;color:#7184A6;">REGISTERED EMAIL</p>
                      <p style="margin:0;font-size:15px;color:#102A56;">${escapeHtml(email)}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 20px;font-size:15px;color:#102A56;line-height:1.6;">
                  You can now log in to BBT Cash to access your banking dashboard and available
                  services.
                </p>
                <p style="margin:0;padding:14px 16px;background:#F5F9FF;border-left:4px solid #168BFA;font-size:14px;color:#102A56;line-height:1.6;">
                  For your security, never share your password or verification codes with anyone.
                </p>
              </td>
            </tr>
        ${footer()}
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  const text = [
    'BBT Cash',
    '',
    'Welcome to BBT Cash!',
    '',
    `Hello${firstName ? ` ${firstName}` : ''},`,
    '',
    'Your email has been verified, and your BBT Cash account has been created',
    'successfully.',
    '',
    `Account Number: ${accountNumber}`,
    `Account Type: ${accountTypeLabel}`,
    `Registered Email: ${email}`,
    '',
    'You can now log in to BBT Cash to access your banking dashboard and',
    'available services.',
    '',
    'For your security, never share your password or verification codes with anyone.',
    '',
    'Thank you for choosing BBT Cash.',
  ].join('\n');

  return {
    subject: 'Welcome to BBT Cash — Your Account Has Been Created Successfully',
    text,
    html,
  };
}

function buildFrom() {
  const senderEmail = smtpConfig.senderEmail;
  if (!senderEmail) {
    if (IN_TEST_MODE) {
      return { name: 'BBT Cash', address: 'test@bbt.local' };
    }
    throw new Error(
      'Email is not configured: set BREVO_SENDER_EMAIL (and SMTP credentials) in the backend environment.'
    );
  }
  return { name: smtpConfig.senderName, address: senderEmail };
}

async function sendVerificationEmail({ to, name, code }) {
  const { subject, text, html } = renderVerificationEmail({ name, code });
  return deliver({ to, subject, text, html, from: buildFrom() });
}

async function sendAccountCreatedEmail({ to, name, accountNumber, accountType, email }) {
  const { subject, text, html } = renderAccountCreatedEmail({
    name,
    accountNumber,
    accountType,
    email,
  });
  return deliver({ to, subject, text, html, from: buildFrom() });
}

async function deliver(message) {
  if (IN_TEST_MODE) {
    if (mockFailNext) {
      mockFailNext = false;
      throw new Error('Simulated SMTP delivery failure (test mode)');
    }
    const record = {
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      from: message.from,
      sentAt: new Date().toISOString(),
    };
    capturedMessages.push(record);
    return { accepted: true, messageId: `test-${capturedMessages.length}`, record };
  }

  if (!transporter) {
    throw new Error(
      'Email is not configured: set BREVO_SMTP_HOST, BREVO_SMTP_USER and BREVO_SMTP_KEY in the backend environment.'
    );
  }

  const result = await transporter.sendMail({
    from: message.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  // Only report success when the SMTP operation actually succeeded (no
  // rejected recipients). nodemailer reports delivery otherwise.
  return { accepted: true, messageId: result.messageId, response: result.response };
}

function getCapturedMessages() {
  return capturedMessages.slice();
}

function setMockFailure(shouldFail) {
  mockFailNext = Boolean(shouldFail);
}

module.exports = {
  sendVerificationEmail,
  sendAccountCreatedEmail,
  renderVerificationEmail,
  renderAccountCreatedEmail,
  getCapturedMessages,
  setMockFailure,
  smtpConfigured,
  IN_TEST_MODE,
};