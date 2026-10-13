'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notifications', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      userId: {
        allowNull: false,
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      type: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      title: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      message: {
        allowNull: false,
        type: Sequelize.TEXT,
      },
      amount: {
        allowNull: true,
        type: Sequelize.INTEGER,
      },
      reference: {
        allowNull: true,
        type: Sequelize.STRING,
      },
      transactionId: {
        allowNull: true,
        type: Sequelize.UUID,
      },
      isRead: {
        allowNull: false,
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      metadata: {
        allowNull: true,
        type: Sequelize.JSONB,
      },
      dedupeKey: {
        allowNull: true,
        unique: true,
        type: Sequelize.STRING,
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

    await queryInterface.addIndex('notifications', ['userId']);
    await queryInterface.addIndex('notifications', ['userId', 'isRead']);
    await queryInterface.addIndex('notifications', ['userId', 'createdAt']);
    await queryInterface.addIndex('notifications', ['transactionId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
  },
};
