import Component from '@ember/component';
import config from '../../config/environment';

export default Component.extend({
  router: Ember.inject.service(),

  socket: null,
  socketConnected: false,
  socketDisconnected: Ember.computed.not('socketConnected'),
  topic: '',
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
    this.get('socket').on('poll created', (id) => this.get('router').transitionTo('view', id));
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
      this.get('socket').emit('create poll', {
        topic: this.get('topic'),
        options: this.get('options').filter((option) => option.name)
      });
    }
  }
});
