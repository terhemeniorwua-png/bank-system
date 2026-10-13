'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Notification extends Model {
    static associate(models) {
      Notification.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user',
      });
    }
  }

  Notification.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      // Category, e.g. credit, debit, deposit, withdrawal, failed, reversal,
      // pin_created, pin_changed, security_alert.
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // Monetary value in integer NGN, where applicable.
      amount: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // Human-readable transaction reference, where applicable.
      reference: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      // Links the notification to the underlying transaction row.
      transactionId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      // Safe, non-sensitive transaction details only.
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      // Deterministic key used to make notification creation idempotent.
      dedupeKey: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
    },
    {
      sequelize,
      modelName: 'Notification',
      tableName: 'notifications',
    }
  );

  return Notification;
};
