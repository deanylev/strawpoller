import Ember from 'ember';

export default Ember.Controller.extend({
  router: Ember.inject.service(),
  socket: Ember.inject.service(),

  admin: false,

  topic: '',
  locked: false,
  oneVotePerIp: false,
  lockChanging: false,
  public: false,
  allowEditing: false,
  editPassword: '',
  options: null,
  newOptions: [],
  removedOptions: [],
  disabled: Ember.computed('topic', 'options.[]', 'options.@each.name', 'newOptions.[]', 'newOptions.@each.name', 'socket.connected', function() {
    // topic can't be blank
    return !(this.get('topic').trim()
    // must have at least two options that aren't blank
    && this.get('options').concat(this.get('newOptions')).filter((option) => option.name.trim()).length >= 2
    // must be connected to the server
    && this.get('socket.connected'));
  }),

  init() {
    this._super(...arguments);

    this.setDefaults();
    this.get('socket').registerListener('handshake', () => this.setDefaults());
  },

  setDefaults() {
    this.setProperties({
      authenticated: false,
      password: '',
      error: ''
    });
  },

  actions: {
    submitPassword() {
      return this.get('socket').authenticatePoll(this.get('pollId'), this.get('password')).then((data) => {
        this.setProperties({
          admin: data.admin,
          topic: data.topic,
          locked: data.locked,
          oneVotePerIp: data.one_vote_per_ip,
          lockChanging: data.lock_changing,
          public: data.public,
          allowEditing: data.allow_editing,
          options: data.options,
          authenticated: true
        });
      }).catch((err) => this.set('error', err.reason));
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
        id: this.get('pollId'),
        topic: this.get('topic'),
        one_vote_per_ip: this.get('oneVotePerIp'),
        lock_changing: this.get('lockChanging'),
        public: this.get('public'),
        allow_editing: this.get('allowEditing'),
        edit_password: this.get('editPassword'),
        options: this.get('options')
          .concat(this.get('newOptions')
          .filter((option) => option.name.trim()))
          .map((option, index) => Object.assign({
            position: index
          }, option)),
        removed_options: this.get('removedOptions')
      }).then(() => this.get('router').transitionTo('view', this.get('pollId')));
    },

    changeLocked() {
      return this.get('socket').setPollLocked(this.get('pollId'), !this.get('locked'))
        .then(() => this.toggleProperty('locked'));
    },

    deletePoll() {
      if (confirm('Are you sure? This cannot be undone.')) {
        return this.get('socket').deletePoll(this.get('pollId')).then(() => this.get('router').transitionTo('create'));
      } else {
        return Ember.RSVP.reject();
      }
    }
  }
});
