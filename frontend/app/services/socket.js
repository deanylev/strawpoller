import config from '../config/environment';

export default Ember.Service.extend({
  socket: null,
  connected: false,
  disconnected: Ember.computed.not('connected'),

  init() {
    this._super(...arguments);

    this.set('socket', io(config.APP.SOCKET_HOST));

    this.get('socket').on('connect', () => this.set('connected', true));
    this.get('socket').on('disconnect', () => this.set('connected', false));
  },

  sendFrame(name, data) {
    return new Ember.RSVP.Promise((resolve, reject) => {
      this.get('socket').emit(name, data, (success, serverData) => {
        if (success) {
          resolve(serverData);
        } else {
          reject(serverData);
        }
      });
    });
  },

  registerListener(name, callback) {
    this.get('socket').on(name, callback);
  },

  unregisterListener(name, callback) {
    this.get('socket').off(name, callback);
  }
});
