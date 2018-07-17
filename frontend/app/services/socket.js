import config from '../config/environment';

export default Ember.Service.extend({
  socket: null,
  connected: false,
  disconnected: Ember.computed.not('connected'),

  init() {
    this._super(...arguments);

    this.set('socket', io(config.APP.SOCKET_HOST));

    this.registerListener('connect', () => this.set('connected', true));
    this.registerListener('disconnect', () => this.set('connected', false));
  },

  _sendFrame(name, data) {
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
  },

  registerOnce(name, callback) {
    this.get('socket').once(name, callback);
  },

  joinPoll(id) {
    return this._sendFrame('join poll', {
      id
    });
  },

  leavePoll(id) {
    return this._sendFrame('leave poll', {
      id
    });
  },

  addVote(pollId, optionId) {
    return this._sendFrame('vote', {
      type: 'add',
      pollId,
      optionId
    });
  },

  removeVote(pollId, optionId) {
    return this._sendFrame('vote', {
      type: 'remove',
      pollId,
      optionId
    });
  },

  unlockPoll(id, password) {
    return this._sendFrame('unlock poll', {
      id,
      password
    });
  },

  createPoll(data) {
    return this._sendFrame('create poll', data);
  },

  savePoll(data) {
    return this._sendFrame('save poll', data);
  },

  deletePoll(id) {
    return this._sendFrame('delete poll', {
      id
    });
  },

  getPublicPolls() {
    return this._sendFrame('get public polls');
  }
});
