import Ember from 'ember';

export default Ember.Controller.extend({
  socket: Ember.inject.service(),

  pollId: null,

  topic: '',
  locked: false,
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
        .catch(() => this.set('topic', 'Poll not found.'))
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
      return this.get('socket').vote(type, this.get('pollId'), option.id)
        .finally(() => this.set('inFlight', false));
    }
  }
});
