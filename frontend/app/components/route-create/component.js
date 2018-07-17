import Ember from 'ember';

export default Ember.Component.extend({
  router: Ember.inject.service(),
  socket: Ember.inject.service(),

  topic: '',
  public: false,
  allowEditing: false,
  editPassword: '',
  options: null,
  disabled: Ember.computed('topic', 'options.[]', 'options.@each.name', 'editPassword', 'allowEditing', 'socket.connected', function() {
    // topic can't be blank
    return !(this.get('topic')
    // must have at least two options that aren't blank
    && this.get('options').filter((option) => option.name.trim()).length >= 2
    // password can't be blank if allowing editing
    && (this.get('editPassword') || !this.get('allowEditing'))
    // must be connected to the server
    && this.get('socket.connected'));
  }),

  publicPolls: [],

  allowEditingDidChange: Ember.observer('allowEditing', function() {
    this.set('editPassword', '');
  }),

  init() {
    this._super(...arguments);

    this.set('options', [
      {
        name: ''
      },
      {
        name: ''
      }
    ]);
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
      return this.get('socket').createPoll({
        topic: this.get('topic'),
        public: this.get('public'),
        allow_editing: this.get('allowEditing'),
        edit_password: this.get('editPassword'),
        options: this.get('options').filter((option) => option.name)
      }).then((data) => this.get('router').transitionTo('view', data.id));
    }
  }
});
