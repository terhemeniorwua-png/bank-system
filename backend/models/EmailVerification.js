'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EmailVerification extends Model {
    static associate() {
      // No foreign key to users: a pending verification exists before the
      // user row is created.
    }
  }

  EmailVerification.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      // SHA-256 hash of the six-digit code. The plaintext code is never stored.
      codeHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      // Snapshot of the pending signup data (name, phone, hashed password).
      data: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      attempts: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      // Set when a code is successfully redeemed, making it single-use.
      usedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      lastSentAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'EmailVerification',
      tableName: 'email_verifications',
    }
  );

  return EmailVerification;
};