'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('transactions', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      type: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      status: {
        allowNull: false,
        type: Sequelize.STRING,
        defaultValue: 'success',
      },
      amount: {
        allowNull: false,
        type: Sequelize.INTEGER,
      },
      senderAccountNumber: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      receiverAccountNumber: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      reference: {
        allowNull: true,
        unique: true,
        type: Sequelize.STRING,
      },
      senderId: {
        allowNull: true,
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      receiverId: {
        allowNull: true,
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex('transactions', ['senderId']);
    await queryInterface.addIndex('transactions', ['receiverId']);
    await queryInterface.addIndex('transactions', ['senderAccountNumber']);
    await queryInterface.addIndex('transactions', ['receiverAccountNumber']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('transactions');
  },
};
