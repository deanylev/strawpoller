import Ember from 'ember';

export default Ember.Component.extend({
  router: Ember.inject.service(),
  socket: Ember.inject.service(),

  unlocked: false,
  password: '',
  error: '',

  admin: false,

  topic: '',
  allowEditing: false,
  editPassword: '',
  options: null,
  newOptions: null,
  removedOptions: [],
  disabled: Ember.computed('topic', 'options.[]', 'options.@each.name', 'newOptions.[]', 'newOptions.@each.name', 'socket.connected', function() {
    // topic can't be blank
    return !(this.get('topic')
    // must have at least two options that aren't blank
    && this.get('options').concat(this.get('newOptions')).filter((option) => option.name).length >= 2
    // must be connected to the server
    && this.get('socket.connected'));
  }),

  init() {
    this._super(...arguments);

    this.set('newOptions', []);
  },

  actions: {
    submitPassword() {
      return this.get('socket').unlockPoll(this.get('poll_id'), this.get('password')).then((data) => {
        this.set('admin', data.admin);
        this.set('topic', data.topic);
        this.set('public', data.public);
        this.set('allowEditing', data.allow_editing);
        this.set('options', data.options);
        this.set('unlocked', true);
      }).catch((data) => this.set('error', data.error));
    },

    addOption() {
      this.get('newOptions').pushObject({
        name: ''
      });
    },

    removeOption(array, index) {
      if (array === 'options') {
        this.get('removedOptions').pushObject(this.get(array)[index].id);
      }

      this.set(array, this.get(array).filter((option, i) => i !== index));
    },

    savePoll() {
      return this.get('socket').savePoll({
        id: this.get('poll_id'),
        topic: this.get('topic'),
        public: this.get('public'),
        allow_editing: this.get('allowEditing'),
        edit_password: this.get('editPassword'),
        options: this.get('options').filter((option) => option.name).concat(this.get('newOptions').filter((option) => option.name)),
        removed_options: this.get('removedOptions')
      }).then(() => this.get('router').transitionTo('view', this.get('poll_id')));
    },

    deletePoll() {
      if (confirm('Are you sure? This cannot be undone.')) {
        this.get('socket').deletePoll(this.get('poll_id')).then(() => this.get('router').transitionTo('create'));
      } else {
        return Ember.RSVP.reject();
      }
    }
  }
});
