const { DataTypes } = require("sequelize");
const sequelize = require("../config/database"); // adjust to your path

const Account = sequelize.define(
  "Account",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, unique: true },
    balanceKobo: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: "NGN" },
  },
  { tableName: "accounts", underscored: true }
);

const Deposit = sequelize.define(
  "Deposit",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    accountId: { type: DataTypes.UUID, allowNull: false },
    reference: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    amountKobo: { type: DataTypes.BIGINT, allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "PENDING" },
    paystackTransactionId: { type: DataTypes.STRING(64) },
    paidAt: { type: DataTypes.DATE },
  },
  { tableName: "deposits", underscored: true }
);

const LedgerEntry = sequelize.define(
  "LedgerEntry",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    accountId: { type: DataTypes.UUID, allowNull: false },
    depositId: { type: DataTypes.UUID },
    type: { type: DataTypes.STRING(6), allowNull: false },
    amountKobo: { type: DataTypes.BIGINT, allowNull: false },
    balanceAfterKobo: { type: DataTypes.BIGINT, allowNull: false },
    reference: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    description: { type: DataTypes.STRING(255) },
  },
  { tableName: "ledger_entries", underscored: true, updatedAt: false }
);

// Ledger entries are append-only
LedgerEntry.beforeUpdate(() => { throw new Error("Ledger entries are immutable"); });
LedgerEntry.beforeDestroy(() => { throw new Error("Ledger entries cannot be deleted"); });

Account.hasMany(Deposit, { foreignKey: "accountId" });
Deposit.belongsTo(Account, { foreignKey: "accountId" });
Account.hasMany(LedgerEntry, { foreignKey: "accountId" });
LedgerEntry.belongsTo(Account, { foreignKey: "accountId" });

module.exports = { sequelize, Account, Deposit, LedgerEntry };