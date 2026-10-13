'use strict';

/**
 * Payment (airtime, data, bill) support reuses the existing `transactions`
 * table. These additive, nullable/defaulted columns add the small amount of
 * extra detail payments need without altering any existing rows or behaviour.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('transactions', 'fee', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('transactions', 'providerReference', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('transactions', 'metadata', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('transactions', 'metadata');
    await queryInterface.removeColumn('transactions', 'providerReference');
    await queryInterface.removeColumn('transactions', 'fee');
  },
};
