'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.hasMany(models.Transaction, {
        foreignKey: 'senderId',
        as: 'sentTransactions',
      });
      User.hasMany(models.Transaction, {
        foreignKey: 'receiverId',
        as: 'receivedTransactions',
      });
      User.hasMany(models.EmailNotification, {
        foreignKey: 'userId',
        as: 'emailNotifications',
      });
    }

    // Serialise the user without ever exposing the password hash or PIN.
    toSafeJSON() {
      const values = { ...this.get() };
      delete values.password;
      delete values.pin;
      return values;
    }
  }

  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      pin: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      role: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'user',
        validate: { isIn: [['admin', 'user']] },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      accountNumber: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      // Amounts are stored as integer NGN (no floating point arithmetic).
      amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },
      // Profile picture stored as a base64 data URL. Kept small on the client
      // (JPEG/PNG/WebP, max 1 MB) so a single TEXT column is sufficient.
      avatar: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      emailVerified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      emailVerifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
    }
  );

  return User;
};
