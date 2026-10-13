const db = require("../../models");
const notificationCenter = require("../services/notificationCenter");
const emailOutbox = require("../services/notifications");

const addMoney = async (req, res) => {
  const { accountNumber } = req.params;
  const amount = String(req.body.amount);

  if (!/^\d+$/.test(amount) || amount.trim() === "" || Number(amount) <= 0) {
    return res.status(400).json({
      message: "Invaid fund",
    });
  }

  const user = await db.User.findOne({ where: { accountNumber } });

  if (!user) {
    return res.status(400).json({
      error: "Error",
      message: "Account not found",
    });
  }

  let transactionId = null;

  await db.sequelize.transaction(async (transaction) => {
    user.amount += Number(amount);
    await user.save({ transaction });

    const created = await db.Transaction.create(
      {
        type: "admin_deposit",
        status: "success",
        amount: Number(amount),
        receiverId: user.id,
        receiverAccountNumber: user.accountNumber,
      },
      { transaction }
    );

    await notificationCenter.notifyDeposit(
      {
        user,
        amount: Number(amount),
        transactionId: created.id,
        method: "Admin credit",
      },
      { transaction }
    );

    return created;
  });

  await emailOutbox
    .deliverBrandedEmail({
      userId: user.id,
      toEmail: user.email,
      type: "deposit",
      subject: "Credit Alert \u2014 BBT Cash",
      heading: "Deposit Successful",
      greetingName: user.name,
      paragraphs: [
        `${notificationCenter.formatNaira(Number(amount))} has been deposited into your account.`,
      ],
      details: [],
    })
    .catch(() => {});

  return res.status(200).json({
    message: `Successfully deposited ${amount}. New balance is ${user.amount}`,
  });
};

module.exports = addMoney;
