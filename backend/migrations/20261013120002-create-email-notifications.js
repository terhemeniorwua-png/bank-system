'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('email_notifications', {
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
      toEmail: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      subject: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      status: {
        allowNull: false,
        type: Sequelize.STRING,
        defaultValue: 'pending',
      },
      attempts: {
        allowNull: false,
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      lastAttemptAt: {
        allowNull: true,
        type: Sequelize.DATE,
      },
      lastError: {
        allowNull: true,
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

    await queryInterface.addIndex('email_notifications', ['userId']);
    await queryInterface.addIndex('email_notifications', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('email_notifications');
  },
};