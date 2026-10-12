'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Transaction extends Model {
    static associate(models) {
      Transaction.belongsTo(models.User, {
        foreignKey: 'senderId',
        as: 'sender',
      });
      Transaction.belongsTo(models.User, {
        foreignKey: 'receiverId',
        as: 'receiver',
      });
    }
  }

  Transaction.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'success',
      },
      // Amounts are stored as integer NGN (no floating point arithmetic).
      amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 0 },
      },
      senderAccountNumber: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      receiverAccountNumber: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      // Optional caller supplied idempotency reference.
      reference: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
      senderId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      receiverId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Transaction',
      tableName: 'transactions',
    }
  );

  return Transaction;
};
