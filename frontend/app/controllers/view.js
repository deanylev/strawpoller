import Ember from 'ember';

export default Ember.Controller.extend({
  socket: Ember.inject.service(),

  pollId: null,

  topic: '',
  locked: false,
  lockChanging: false,
  allowEditing: false,

  options: [],
  displayedOptions: Ember.computed('options', 'selected', function() {
    const options = [...this.get('options')];
    options.forEach((option) => option.selected = this.get('selected').includes(option.id));
    return options;
  }),

  handleData: null,
  join: null,

  inFlight: false,

  disabled: Ember.computed('inFlight', 'socket.disconnected', 'locked', 'lockChanging', 'selected', function() {
    return this.get('inFlight') || this.get('socket.disconnected') || this.get('locked') || (this.get('lockChanging') && this.get('selected').length)
  }),

  init() {
    this._super(...arguments);

    this.setDefaults();
  },

  setDefaults() {
    this.setProperties({
      initialLoad: false,
      selected: []
    });
  },

  subscribe(pollId) {
    this.set('pollId', pollId);
    this.set('handleData', (data) => {
      this.setProperties({
        topic: data.topic,
        locked: data.locked,
        lockChanging: data.lock_changing,
        allowEditing: data.allow_editing,
        options: data.options,
        waitingForResponse: false
      });
      if (data.selected) {
        this.set('selected', data.selected);
      }
    });

    this.set('join', () => {
      this.get('socket').joinPoll(pollId)
        .then(this.handleData)
        .catch((err) => this.set('topic', err.reason))
        .finally(() => this.set('initialLoad', true))
    });

    this.join();

    this.get('socket').registerListener('poll data', this.handleData);
    this.get('socket').registerListener('handshake', this.join);
  },

  unsubscribe() {
    this.setDefaults();

    // remove listeners
    this.get('socket').unregisterListener('poll data', this.handleData);
    this.get('socket').unregisterListener('handshake', this.join);

    // unsubscribe from the room
    this.get('socket').leavePoll(this.get('pollId'));
  },

  actions: {
    vote(option) {
      const type = option.selected ? 'remove': 'add';
      this.set('inFlight', true);
      let promise = null;
      if (!this.get('lockChanging') || confirm('Are you sure? You cannot change your vote.')) {
        promise = this.get('socket').vote(type, this.get('pollId'), option.id);
      } else {
        promise = Ember.RSVP.reject();
      }
      return promise.finally(() => this.set('inFlight', false));
    }
  }
});
