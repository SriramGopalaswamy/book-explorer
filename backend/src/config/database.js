const { Sequelize } = require('sequelize');
require('dotenv').config();

const env = process.env.NODE_ENV || 'development';

const config = {
  development: {
    dialect: 'sqlite',
    storage: './database/dev.sqlite',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
  },
  production: {
    dialect: 'postgres',
    url: process.env.DATABASE_URL,
    dialectOptions: {
      ssl: process.env.DATABASE_SSL === 'true' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    },
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
};

const dbConfig = config[env];
let sequelize;

if (env === 'production' && dbConfig.url) {
  sequelize = new Sequelize(dbConfig.url, {
    dialect: dbConfig.dialect,
    dialectOptions: dbConfig.dialectOptions,
    logging: dbConfig.logging,
    pool: dbConfig.pool
  });
  console.log('📊 DATABASE: PostgreSQL (Production)');
  console.log('   Connection: DATABASE_URL (environment variable)');
} else {
  sequelize = new Sequelize({
    dialect: dbConfig.dialect,
    storage: dbConfig.storage,
    logging: dbConfig.logging
  });
  console.log('📊 DATABASE: SQLite (Development)');
  console.log('   Storage:', dbConfig.storage);
}

module.exports = { sequelize, Sequelize };
