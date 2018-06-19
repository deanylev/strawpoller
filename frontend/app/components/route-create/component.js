import Component from '@ember/component';
import config from '../../config/environment';

export default Component.extend({
  router: Ember.inject.service(),

  socket: null,
  socketConnected: false,
  socketDisconnected: Ember.computed.not('socketConnected'),

  topic: '',
  allowEditing: false,
  editPassword: '',
  options: null,
  disabled: Ember.computed('topic', 'options.[]', 'options.@each.name', 'socketConnected', function() {
    return !(this.get('topic') && this.get('options').filter((option) => option.name).length >= 2 && this.get('socketConnected'));
  }),

  init() {
    this._super(...arguments);

    this.set('socket', io(config.APP.SOCKET_HOST));
    this.set('options', []);

    this.get('socket').on('connect', () => this.set('socketConnected', true));
    this.get('socket').on('disconnect', () => this.set('socketConnected', false));
  },

  willDestroy() {
    this.get('socket').disconnect();

    this._super(...arguments);
  },

  actions: {
    addOption() {
      this.get('options').pushObject({
        name: ''
      });
    },

    removeOption(index) {
      this.set('options', this.get('options').filter((option, i) => i !== index));
    },

    createPoll() {
      return new Ember.RSVP.Promise((resolve, reject) => {
        this.get('socket').emit('create poll', {
          topic: this.get('topic'),
          options: this.get('options').filter((option) => option.name),
          allow_editing: this.get('allowEditing') ? 1 : 0,
          edit_password: this.get('editPassword')
        }, (success, id) => {
          if (success) {
            this.get('router').transitionTo('view', id);
            resolve();
          } else {
            reject();
          }
        });
      });
    }
  }
});
