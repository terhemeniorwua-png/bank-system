'use strict';

const bcrypt = require('bcrypt');

const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const ADMIN_EMAIL = 'admin@bank.local';
const USER_EMAIL = 'peter@bank.local';
const ADMIN_ACCOUNT = '0000000001';
const USER_ACCOUNT = '0000000002';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const saltRounds = Number(process.env.SALT_ROUNDS) || 10;

    const [adminPassword, userPassword] = await Promise.all([
      bcrypt.hash('Admin@123', saltRounds),
      bcrypt.hash('Peter@123', saltRounds),
    ]);

    const now = new Date();

    await queryInterface.bulkInsert('users', [
      {
        id: ADMIN_ID,
        name: 'System Admin',
        email: ADMIN_EMAIL,
        phone: '08000000001',
        pin: '1234',
        role: 'admin',
        password: adminPassword,
        accountNumber: ADMIN_ACCOUNT,
        amount: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: USER_ID,
        name: 'Peter Demo',
        email: USER_EMAIL,
        phone: '08000000002',
        pin: '4321',
        role: 'user',
        password: userPassword,
        accountNumber: USER_ACCOUNT,
        amount: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    const { Op } = Sequelize;
    await queryInterface.bulkDelete('users', {
      email: { [Op.in]: [ADMIN_EMAIL, USER_EMAIL] },
    });
  },
};
