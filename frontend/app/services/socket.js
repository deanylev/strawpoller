/* global io, Fingerprint2 */

import Ember from 'ember';
import config from '../config/environment';

const DEFAULT_LISTENERS = ['connect', 'disconnect'];

export default Ember.Service.extend({
  logger: Ember.inject.service(),

  socket: null,
  connected: false,
  disconnected: Ember.computed.not('connected'),
  isHandshook: false,

  publicPolls: [],
  allPolls: [],

  connectedDidChange: Ember.observer('connected', function() {
    this.get('logger').warn('socket', `socket is now ${this.get('connected') ? 'connected' : 'disconnected'}`);
    if (this.get('connected')) {
      this._getClientId().then((clientId) => this.handshake(clientId)).then(() => this.set('isHandshook', true));
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

  _getClientId() {
    return new Ember.RSVP.Promise((resolve, reject) => {
      const { clientId } = localStorage;
      if (clientId && clientId.length === 32) {
        resolve(clientId);
      } else {
        new Fingerprint2().get((newClientId) => {
          localStorage.setItem('clientId', newClientId);
          resolve(newClientId);
        });
      }
    });
  },

  _sendFrame(name, data) {
    return new Ember.RSVP.Promise((resolve, reject) => {
      this.get('logger').log('socket', 'sending frame', {
        name,
        data
      });
      this.get('socket').emit(name, data, (success, serverData) => {
        if (success) {
          this.get('logger').log('socket', 'frame accepted', {
            name,
            data: serverData || {}
          });
          resolve(serverData);
        } else {
          this.get('logger').warn('socket', 'frame rejected', {
            name,
            data: serverData || {}
          });
          reject(serverData);
        }
      });
    });
  },

  registerListener(name, callback) {
    this.get('socket').on(name, (data) => {
      if (!DEFAULT_LISTENERS.includes(name)) {
        this.get('logger').log('socket', 'received frame', {
          name,
          data: data || {}
        });
      }
      callback(data);
    });
  },

  unregisterListener(name, callback) {
    this.get('socket').off(name, callback);
  },

  registerOnce(name, callback) {
    this.get('socket').once(name, (data) => {
      if (!DEFAULT_LISTENERS.includes(name)) {
        this.get('logger').log('socket', 'received frame', {
          name,
          data: data || {}
        });
      }
      callback(data);
    });
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

  authenticatePoll(id, password) {
    return this._sendFrame('authenticate poll', {
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

  setPollLocked(id, locked) {
    return this._sendFrame('set poll locked', {
      id,
      locked
    });
  },

  deletePoll(id) {
    return this._sendFrame('delete poll', {
      id
    });
  },

  getPublicPolls() {
    return this._sendFrame('get public polls');
  },

  getAllPolls(password) {
    return this._sendFrame('get all polls', {
      password
    });
  }
});
