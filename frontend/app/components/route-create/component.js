import Component from '@ember/component';
import config from '../../config/environment';

export default Component.extend({
  router: Ember.inject.service(),
  socket: Ember.inject.service(),

  topic: '',
  allowEditing: false,
  editPassword: '',
  options: null,
  disabled: Ember.computed('topic', 'options.[]', 'options.@each.name', 'editPassword', 'allowEditing', 'socket.connected', function() {
    // topic can't be blank
    return !(this.get('topic')
    // must have at least two options that aren't blank
    && this.get('options').filter((option) => option.name).length >= 2
    // password can't be blank if allowing editing
    && (this.get('editPassword') || !this.get('allowEditing'))
    // must be connected to the server
    && this.get('socket.connected'));
  }),

  init() {
    this._super(...arguments);

    this.set('options', []);
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
      return this.get('socket').sendFrame('create poll', {
        topic: this.get('topic'),
        options: this.get('options').filter((option) => option.name),
        allow_editing: this.get('allowEditing') ? 1 : 0,
        edit_password: this.get('editPassword')
      }).then((data) => {
        this.get('router').transitionTo('view', data.id);
      });
    }
  }
});
