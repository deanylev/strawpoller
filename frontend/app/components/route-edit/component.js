import Component from '@ember/component';
import config from '../../config/environment';

export default Component.extend({
  router: Ember.inject.service(),

  socket: null,
  socketConnected: false,
  socketDisconnected: Ember.computed.not('socketConnected'),

  unlocked: false,
  wrongPassword: false,

  topic: '',
  options: null,
  disabled: Ember.computed('topic', 'options.[]', 'options.@each.name', 'socketConnected', function() {
    // topic can't be blank
    return !(this.get('topic')
    // must have at least two options that aren't blank
    && this.get('options').filter((option) => option.name).length >= 2
    // must be connected to the server
    && this.get('socketConnected'));
  }),

  init() {
    this._super(...arguments);

    this.set('socket', io(config.APP.SOCKET_HOST));

    this.get('socket').on('connect', () => this.set('socketConnected', true));
    this.get('socket').on('disconnect', () => this.set('socketConnected', false));

    this.get('socket').emit('edit poll', this.get('poll_id'), (pollData) => {
      this.set('topic', pollData.topic);
      this.set('options', pollData.options);
    });
  },

  willDestroy() {
    this.get('socket').disconnect();

    this._super(...arguments);
  },

  actions: {
    submitPassword() {
      return new Ember.RSVP.Promise((resolve, reject) => {
        this.get('socket').emit('unlock poll', {
          id: this.get('poll_id'),
          password: this.get('editPassword')
        }, (success) => {
          if (success) {
            this.set('unlocked', true);
            resolve();
          } else {
            this.set('wrongPassword', true);
            reject();
          }
        });
      });
    },

    addOption() {
      this.get('options').pushObject({
        name: ''
      });
    },

    removeOption(index) {
      this.set('options', this.get('options').filter((option, i) => i !== index));
    },

    savePoll() {
      return new Ember.RSVP.Promise((resolve, reject) => {
        this.get('socket').emit('save poll', {
          id: this.get('poll_id'),
          topic: this.get('topic'),
          options: this.get('options').filter((option) => option.name)
        }, (success) => {
          if (success) {
            this.get('router').transitionTo('view', this.get('poll_id'));
            resolve();
          } else {
            reject();
          }
        });
      });
    }
  }
});
