"use strict";

const db = require("../../models");
const emailService = require("./email");

const ACCOUNT_CREATED_TYPE = "account_created";
const ACCOUNT_CREATED_SUBJECT =
  "Welcome to BBT Cash \u2014 Your Account Has Been Created Successfully";

// Sends the account-created confirmation and records the delivery status in
// the email outbox. This is a notification only: it never creates, deletes, or
// modifies a banking account, so it is safe to call again to retry delivery.
async function deliverAccountCreatedEmail(user, toEmail) {
  const notification = await db.EmailNotification.create({
    userId: user.id,
    type: ACCOUNT_CREATED_TYPE,
    toEmail,
    subject: ACCOUNT_CREATED_SUBJECT,
    status: "pending",
  });

  return attemptDelivery(notification, user, toEmail);
}

async function attemptDelivery(notification, user, toEmail) {
  try {
    await emailService.sendAccountCreatedEmail({
      to: toEmail,
      name: user.name,
      accountNumber: user.accountNumber,
      accountType: user.role,
      email: toEmail,
    });
    notification.status = "sent";
    notification.lastError = null;
  } catch (error) {
    notification.status = "failed";
    notification.lastError = safeMessage(error);
    console.error(
      `[email] account-created delivery failed for ${toEmail}: ${notification.lastError}`
    );
  }

  notification.attempts += 1;
  notification.lastAttemptAt = new Date();
  await notification.save();
  return notification;
}

// Retries the most recent account-created notification for a user. This only
// re-sends email; it never creates another account. Returns the notification
// (possibly still failed if the retry also fails), or null if there is nothing
// to retry.
async function retryAccountCreatedEmail(userId) {
  const notification = await db.EmailNotification.findOne({
    where: { userId, type: ACCOUNT_CREATED_TYPE },
    order: [["createdAt", "DESC"]],
  });

  if (!notification || notification.status === "sent") {
    return notification || null;
  }

  const user = await db.User.findByPk(userId);
  if (!user) {
    return null;
  }

  return attemptDelivery(notification, user, notification.toEmail);
}

function safeMessage(error) {
  const raw = (error && error.message) || String(error);
  return raw.replace(/\s+/g, " ").slice(0, 300);
}

module.exports = {
  deliverAccountCreatedEmail,
  retryAccountCreatedEmail,
  ACCOUNT_CREATED_TYPE,
  ACCOUNT_CREATED_SUBJECT,
};
