import Ember from 'ember';
import config from '../config/environment';
import io from 'npm:socket.io-client';
import ioWildcard from 'npm:socketio-wildcard';
import Fingerprint2 from 'npm:fingerprintjs2';

export default Ember.Service.extend({
  logger: Ember.inject.service(),

  socket: null,
  connected: false,
  disconnected: Ember.computed.not('connected'),
  reconnecting: false,
  isHandshook: false,

  publicPolls: null,
  allPolls: null,

  connectedDidChange: Ember.observer('connected', function() {
    const connected = this.get('connected');
    this.get('logger')[connected ? 'log' : 'warn']('socket', `socket is now ${connected ? 'connected' : 'disconnected'}`);
    if (connected) {
      this._getClientId().then((clientId) => this.handshake(clientId)).then(() => this.set('isHandshook', true));
    }
  }),

  attempts: 0,
  attemptType: Ember.computed('isHandshook', function() {
    return this.get('isHandshook') ? 'reconnect' : 'connect';
  }),

  init() {
    this._super(...arguments);

    const socket = io(config.APP.SOCKET_HOST);
    ioWildcard(io.Manager)(socket);
    this.set('socket', socket);

    this.get('socket').on('*', (packet) => {
      const name = packet.data[0];
      const data = typeof packet.data[1] === 'object' && packet.data[1] !== null ? packet.data[1] : {};
      this.get('logger').log('socket', 'received frame', {
        name,
        data
      });
    });

    this.registerListener('connect', () => this.set('connected', true));
    this.registerListener('disconnect', () => this.set('connected', false));
    this.registerListener('reconnect_attempt', () => {
      this.incrementProperty('attempts');
      this.set('reconnecting', true);
      this.get('logger').log('socket', `attempting to ${this.get('attemptType')}...`, {
        attempts: this.get('attempts')
      });
    });
    this.registerListener('reconnect_error', () => this.get('logger').warn('socket', `${this.get('attemptType')}ion attempt failed`));
    this.registerListener('reconnect', () => {
      this.set('reconnecting', false);
      this.set('attempts', 0);
      this.get('logger').log('socket', `successful attempt to ${this.get('attemptType')}`);
    });

    this.registerListener('public polls', (publicPolls) => this.setProperties({
      publicPolls
    }));
  },

  _getClientId() {
    return new Ember.RSVP.Promise((resolve, reject) => {
      const { clientId } = localStorage;
      if (clientId && clientId.length === 32) {
        this.get('logger').log('socket', 'using existing client id');
        resolve(clientId);
      } else {
        this.get('logger').log('socket', 'generating new client id');
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
