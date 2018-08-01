import Ember from 'ember';

const COLOURS = {
  log: 'blue',
  warn: 'orange',
  error: 'red'
};

export default Ember.Service.extend({
  init() {
    this._super(...arguments);

    ['log', 'warn', 'error'].forEach((level) => {
      this.set(level, (context, message, data) => {
        console[level](`%c${level.toUpperCase()}:`, `color: ${COLOURS[level]}`, `[${context}] ${message}`, data ? JSON.stringify(data) : '');
      });
    });

    window.addEventListener('error', (err) => {
      this.error('uncaught', err.message, {
        filename: err.filename,
        lineno: err.lineno,
        colno: err.colno
      });
    });
  }
});
