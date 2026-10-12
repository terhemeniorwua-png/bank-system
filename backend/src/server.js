const app = require('./app');
const db = require('../models');

require('dotenv').config();

const PORT = process.env.PORT || 5100;

// Strip anything that looks like the database password from an error message
// before it is displayed, so credentials never reach logs or terminals.
const sanitizeError = (error) => {
  let message = (error && error.message) || String(error);

  const secrets = [];

  try {
    if (process.env.DATABASE_URL) {
      const url = new URL(process.env.DATABASE_URL);
      if (url.password) secrets.push(decodeURIComponent(url.password));
    }
  } catch {
    // Ignore malformed URL; its password simply will not be scrubbed here.
  }

  if (process.env.DB_PASSWORD) secrets.push(process.env.DB_PASSWORD);

  secrets
    .filter((secret) => secret && secret.length > 0)
    .forEach((secret) => {
      message = message.split(secret).join('***');
    });

  return message;
};

const start = async () => {
  try {
    await db.sequelize.authenticate();
    console.log('Database connection established.');
  } catch (error) {
    console.error(`Failed to connect to the database: ${sanitizeError(error)}`);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down.`);
    server.close(async () => {
      try {
        await db.sequelize.close();
      } catch {
        // Closing the pool is best-effort during shutdown.
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

start();