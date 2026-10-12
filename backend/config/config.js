'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const envFiles = [
  path.join(rootDir, 'src', '.env'),
  path.join(rootDir, '.env'),
];

envFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    require('dotenv').config({ path: file, quiet: true });
  }
});

function readEnvLines() {
  const lines = [];

  envFiles.forEach((file) => {
    try {
      lines.push(...fs.readFileSync(file, 'utf8').split(/\r?\n/));
    } catch {
      // Missing env files are ignored; required variables are validated below.
    }
  });

  return lines;
}

const envLines = readEnvLines();

// A PEM certificate can span many unquoted lines. dotenv only captures the
// first line of such a value, so the full block is recovered here by reading
// the raw env files. The certificate itself is never logged.
function readPem(keys) {
  for (let i = 0; i < envLines.length; i += 1) {
    const match = envLines[i].match(
      /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-----BEGIN [A-Z ]+-----)\s*$/
    );

    if (!match || !keys.includes(match[1])) {
      continue;
    }

    const collected = [match[2]];

    for (let j = i + 1; j < envLines.length; j += 1) {
      collected.push(envLines[j]);
      if (envLines[j].includes('-----END')) {
        break;
      }
    }

    return collected.join('\n');
  }

  return undefined;
}

function baseOptions() {
  return {
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  };
}

function parseDatabaseUrl(url) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
  }

  if (!parsed.hostname) {
    throw new Error('DATABASE_URL is missing a host.');
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')) || undefined,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
  };
}

// Development and production always target the managed (Aiven) PostgreSQL
// service. There is deliberately no localhost/default fallback: if the
// configuration is missing or incomplete the process fails loudly instead of
// silently connecting somewhere unintended.
function buildManagedConfig() {
  const config = baseOptions();
  const url = process.env.DATABASE_URL;

  if (url && url.trim() !== '') {
    const parsed = parseDatabaseUrl(url);
    config.host = parsed.host;
    config.port = parsed.port;
    config.database = parsed.database;
    config.username = parsed.username;
    config.password = parsed.password;
  } else {
    const host = process.env.DB_HOST;
    const database = process.env.DB_NAME;
    const username = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;

    if (!host || !database || !username || !password) {
      throw new Error(
        'Database configuration is incomplete: set DATABASE_URL, or the full ' +
          'DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD set.'
      );
    }

    config.host = host;
    config.port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432;
    config.database = database;
    config.username = username;
    config.password = password;
  }

  if (!config.database) {
    throw new Error('Database configuration is missing a database name.');
  }

  // Aiven requires TLS. Certificate verification is always enabled and the
  // service CA (provided in the env file) is trusted when available.
  const ssl = {
    require: true,
    rejectUnauthorized: true,
  };

  const ca = readPem(['CAC', 'DB_SSL_CA', 'SSL_CA', 'DB_CA_CERT']);

  if (ca) {
    ssl.ca = ca;
  }

  config.dialectOptions = { ssl };

  return config;
}

// Tests never inherit DATABASE_URL or the managed DB_* values. They are
// pointed at a separate, explicitly-named test database so test migrations can
// never touch the Aiven service.
function buildTestConfig() {
  const config = baseOptions();

  config.host = process.env.DB_HOST_TEST || '127.0.0.1';
  config.port = process.env.DB_PORT_TEST ? Number(process.env.DB_PORT_TEST) : 5432;
  config.database = process.env.DB_NAME_TEST || 'banking_test';
  config.username = process.env.DB_USER_TEST || 'postgres';
  config.password = process.env.DB_PASSWORD_TEST || null;

  if (process.env.DB_SSL_TEST === 'true') {
    const ssl = { require: true, rejectUnauthorized: true };
    const ca = readPem(['DB_SSL_CA_TEST', 'CAC_TEST']);

    if (ca) {
      ssl.ca = ca;
    }

    config.dialectOptions = { ssl };
  }

  return config;
}

function safeBuild(builder) {
  try {
    return builder();
  } catch (error) {
    return { __error: (error && error.message) || 'Invalid database configuration.' };
  }
}

const development = safeBuild(buildManagedConfig);
const production = safeBuild(buildManagedConfig);
const test = buildTestConfig();

const requestedEnv = process.env.NODE_ENV || 'development';

if (requestedEnv !== 'test') {
  const selected = requestedEnv === 'production' ? production : development;

  if (selected && selected.__error) {
    throw new Error(selected.__error);
  }
}

module.exports = {
  development,
  test,
  production,
};
