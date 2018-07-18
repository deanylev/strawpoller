// third party libraries
const chalk = require('chalk');

// globals
const {
  LOGGER
} = require('./globals');

function Logger() {}

LOGGER.levels.forEach((level) => {
  Logger.prototype[level] = function(context, message, data) {
    console[level](`${chalk.bold[LOGGER.colours[level]](`${level.toUpperCase()}:`)} [${context}] ${message}`, JSON.stringify(data));
  };
});

module.exports = Logger;
