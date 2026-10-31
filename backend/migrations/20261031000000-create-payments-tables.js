"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const { Op } = Sequelize;

    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "accounts",
        {
          id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("gen_random_uuid()") },
          user_id: { type: Sequelize.UUID, allowNull: false, unique: true }, // match your users.id type
          balance_kobo: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
          currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: "NGN" },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
        },
        { transaction }
      );

      await queryInterface.createTable(
        "deposits",
        {
          id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("gen_random_uuid()") },
          account_id: { type: Sequelize.UUID, allowNull: false, references: { model: "accounts", key: "id" } },
          reference: { type: Sequelize.STRING(100), allowNull: false, unique: true },
          amount_kobo: { type: Sequelize.BIGINT, allowNull: false },
          currency: { type: Sequelize.STRING(3), allowNull: false },
          status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: "PENDING" },
          paystack_transaction_id: { type: Sequelize.STRING(64) },
          paid_at: { type: Sequelize.DATE },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
        },
        { transaction }
      );

      await queryInterface.createTable(
        "ledger_entries",
        {
          id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("gen_random_uuid()") },
          account_id: { type: Sequelize.UUID, allowNull: false, references: { model: "accounts", key: "id" } },
          deposit_id: { type: Sequelize.UUID, references: { model: "deposits", key: "id" } },
          type: { type: Sequelize.STRING(6), allowNull: false },
          amount_kobo: { type: Sequelize.BIGINT, allowNull: false },
          balance_after_kobo: { type: Sequelize.BIGINT, allowNull: false },
          reference: { type: Sequelize.STRING(120), allowNull: false, unique: true },
          description: { type: Sequelize.STRING(255) },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
        },
        { transaction }
      );

      // Database-level safety nets: bad code can't create a negative balance or an invalid status
      await queryInterface.addConstraint("accounts", {
        fields: ["balance_kobo"], type: "check", name: "accounts_balance_nonnegative",
        where: { balance_kobo: { [Op.gte]: 0 } }, transaction,
      });
      await queryInterface.addConstraint("deposits", {
        fields: ["amount_kobo"], type: "check", name: "deposits_amount_positive",
        where: { amount_kobo: { [Op.gt]: 0 } }, transaction,
      });
      await queryInterface.addConstraint("deposits", {
        fields: ["status"], type: "check", name: "deposits_status_valid",
        where: { status: ["PENDING", "SUCCESS", "FAILED", "REVIEW"] }, transaction,
      });
      await queryInterface.addConstraint("ledger_entries", {
        fields: ["type"], type: "check", name: "ledger_type_valid",
        where: { type: ["CREDIT", "DEBIT"] }, transaction,
      });
      await queryInterface.addConstraint("ledger_entries", {
        fields: ["amount_kobo"], type: "check", name: "ledger_amount_positive",
        where: { amount_kobo: { [Op.gt]: 0 } }, transaction,
      });

      await queryInterface.addIndex("deposits", ["account_id"], { transaction });
      await queryInterface.addIndex("ledger_entries", ["account_id", "created_at"], { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ledger_entries");
    await queryInterface.dropTable("deposits");
    await queryInterface.dropTable("accounts");
  },
};