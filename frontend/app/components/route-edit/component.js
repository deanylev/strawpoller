import Component from '@ember/component';
import config from '../../config/environment';

export default Component.extend({
  router: Ember.inject.service(),
  socket: Ember.inject.service(),

  unlocked: false,
  editPassword: '',
  error: '',

  topic: '',
  options: null,
  disabled: Ember.computed('topic', 'options.[]', 'options.@each.name', 'editPassword', 'socket.connected', function() {
    // topic can't be blank
    return !(this.get('topic')
    // must have at least two options that aren't blank
    && this.get('options').filter((option) => option.name).length >= 2
    // password can't be blank
    && this.get('editPassword')
    // must be connected to the server
    && this.get('socket.connected'));
  }),

  actions: {
    submitPassword() {
      return this.get('socket').sendFrame('unlock poll', {
        id: this.get('poll_id'),
        password: this.get('editPassword')
      }).then((data) => {
        this.set('topic', data.topic);
        this.set('options', data.options);
        this.set('unlocked', true);
      }).catch((data) => this.set('error', data.error));
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
        this.get('socket').sendFrame('edit poll', {
          id: this.get('poll_id'),
          topic: this.get('topic'),
          edit_password: this.get('editPassword'),
          options: this.get('options').filter((option) => option.name)
        }).then(() => this.get('router').transitionTo('view', this.get('poll_id')));
      });
    }
  }
});
