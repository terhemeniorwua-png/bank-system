const db = require("../../models");

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

  await db.sequelize.transaction(async (transaction) => {
    user.amount += Number(amount);
    await user.save({ transaction });

    await db.Transaction.create(
      {
        type: "admin_deposit",
        status: "success",
        amount: Number(amount),
        receiverId: user.id,
        receiverAccountNumber: user.accountNumber,
      },
      { transaction }
    );
  });

  return res.status(200).json({
    message: `Successfully deposited ${amount}. New balance is ${user.amount}`,
  });
};

module.exports = addMoney;
