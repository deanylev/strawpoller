// third party libraries
const chalk = require('chalk');

// globals
const {
  LOGGER
} = require('./globals');

function Logger() {}

LOGGER.levels.forEach((level) => {
  Logger.prototype[level] = function(context, message, data ) {
    console[level](`${new Date().toLocaleTimeString()} ${chalk.bold[LOGGER.colours[level]](`${level.toUpperCase()}:`)} [${context}] ${message}`, data ? JSON.stringify(data) : '');
  };
});

module.exports = Logger;
