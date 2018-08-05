import Ember from 'ember';

export default Ember.Controller.extend({
  router: Ember.inject.service(),
  socket: Ember.inject.service(),

  disabled: Ember.computed('topic', 'options.[]', 'options.@each.name', 'editPassword', 'allowEditing', 'socket.connected', function() {
    // topic can't be blank
    return !(this.get('topic').trim()
    // must have at least two options that aren't blank
    && this.get('options').filter((option) => option.name.trim()).length >= 2
    // password can't be blank if allowing editing
    && (this.get('editPassword') || !this.get('allowEditing'))
    // must be connected to the server
    && this.get('socket.connected'));
  }),

  allowEditingDidChange: Ember.observer('allowEditing', function() {
    this.set('editPassword', '');
  }),

  init() {
    this._super(...arguments);

    this.setDefaults();
  },

  setDefaults() {
    this.setProperties({
      topic: '',
      oneVotePerIp: false,
      lockChanging: false,
      public: false,
      allowEditing: false,
      editPassword: '',
      options: []
    });

    this.addOptions(2);
  },

  addOptions(amount) {
    for (let i = 0; i < amount; i++) {
      this.get('options').pushObject({
        name: ''
      });
    }
  },

  removeOption(index) {
    this.set('options', this.get('options').filter((option, i) => i !== index));
  },

  actions: {
    createPoll() {
      return this.get('socket').createPoll({
        topic: this.get('topic'),
        one_vote_per_ip: this.get('oneVotePerIp'),
        lock_changing: this.get('lockChanging'),
        public: this.get('public'),
        allow_editing: this.get('allowEditing'),
        edit_password: this.get('editPassword'),
        options: this.get('options').filter((option) => option.name.trim()).map((option, index) => Object.assign({
          position: index
        }, option))
      }).then((data) => this.get('router').transitionTo('view', data.id)).then(() => this.setDefaults());
    },

    optionFocusIn(index) {
      if (index + 1 === this.get('options').length) {
        this.addOptions(1);
      }
    },

    optionFocusOut(index) {
      if (index > 0 ) {
        if (index + 2 === this.get('options').length && !this.get('options')[index].name.trim()) {
          this.removeOption(index + 1);
        } else if (this.get('options').length >= 2 && !this.get('options')[index].name.trim()) {
          this.removeOption(index);
        }
      }
    }
  }
});
