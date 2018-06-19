import Component from '@ember/component';
import config from '../../config/environment';

const socket = io(config.APP.SOCKET_HOST);

export default Component.extend({
  router: Ember.inject.service(),

  topic: '',
  options: [],
  disabled: Ember.computed('topic', 'options.[]', 'options.@each.name', function() {
    return !(this.get('topic') && this.get('options').filter((option) => option.name).length >= 2)
  }),

  init() {
    this._super(...arguments);

    socket.on('poll created', (id) => this.get('router').transitionTo('view', id));
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
      socket.emit('create poll', {
        topic: this.get('topic'),
        options: this.get('options').filter((option) => option.name)
      });
    }
  }
});
