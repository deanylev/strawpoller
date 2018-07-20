/* global io, Fingerprint2 */

import Ember from 'ember';
import config from '../config/environment';

export default Ember.Service.extend({
  socket: null,
  connected: false,
  disconnected: Ember.computed.not('connected'),
  initialConnection: false,

  publicPolls: null,

  connectedDidChange: Ember.observer('connected', function() {
    if (this.get('connected')) {
      this.getClientId().then((clientId) => {
        if (!localStorage.getItem('clientId')) {
          localStorage.setItem('clientId', clientId);
        }
        this.handshake(localStorage.getItem('clientId')).then(() => this.set('initialConnection', true));
      });
    }
  }),

  init() {
    this._super(...arguments);

    this.set('socket', io(config.APP.SOCKET_HOST));

    this.registerListener('connect', () => this.set('connected', true));
    this.registerListener('disconnect', () => this.set('connected', false));

    this.registerListener('public polls', (publicPolls) => this.setProperties({
      publicPolls
    }));
  },

  getClientId() {
    return new Ember.RSVP.Promise((resolve, reject) => {
      new Fingerprint2().get(resolve);
    });
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

  handshake(clientId) {
    return this._sendFrame('handshake', {
      clientId
    });
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

  vote(type, pollId, optionId) {
    return this._sendFrame('vote', {
      type,
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
