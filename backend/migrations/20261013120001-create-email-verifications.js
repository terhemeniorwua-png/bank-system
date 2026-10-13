'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('email_verifications', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      email: {
        allowNull: false,
        unique: true,
        type: Sequelize.STRING,
      },
      codeHash: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      data: {
        allowNull: false,
        type: Sequelize.JSON,
      },
      expiresAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      attempts: {
        allowNull: false,
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      usedAt: {
        allowNull: true,
        type: Sequelize.DATE,
      },
      lastSentAt: {
        allowNull: true,
        type: Sequelize.DATE,
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

    await queryInterface.addIndex('email_verifications', ['email']);
    await queryInterface.addIndex('email_verifications', ['expiresAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('email_verifications');
  },
};