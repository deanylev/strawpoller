import Ember from 'ember';

export default Ember.Controller.extend({
  socket: Ember.inject.service(),

  pollId: null,

  topic: '',
  locked: false,
  lockChanging: false,
  allowEditing: false,
  unlockAt: false,

  options: [],
  displayedOptions: Ember.computed('options', 'selected', function() {
    const options = [...this.get('options')];
    options.forEach((option) => option.selected = this.get('selected').includes(option.id));
    return options;
  }),

  inFlight: false,

  disabled: Ember.computed('inFlight', 'socket.disconnected', 'locked', 'lockChanging', 'selected', function() {
    return this.get('inFlight') || this.get('socket.disconnected') || this.get('locked') || (this.get('lockChanging') && this.get('selected').length)
  }),

  votingLocked: Ember.computed('locked', 'unlockAt', function() {
    if (this.get('locked')) {
      const lockedUntil = new Date(this.get('unlockAt')).toLocaleDateString();
      return `(voting locked${this.get('unlockAt') > Date.now() ? ` until ${lockedUntil}` : ''})`;
    } else {
      return '';
    }
  }),

  init() {
    this._super(...arguments);

    this.setDefaults();
    this.get('socket').registerListener('poll data', (data) => this.handleData(data));
    // don't call join on the initial handshake
    this.get('socket').registerOnce('handshake', () => {
      this.get('socket').registerListener('handshake', () => this.join());
    });
  },

  setDefaults() {
    this.setProperties({
      initialLoad: false,
      selected: []
    });
  },

  handleData(data) {
    this.setProperties({
      topic: data.topic,
      locked: data.locked,
      lockChanging: data.lock_changing,
      allowEditing: data.allow_editing,
      unlockAt: data.unlock_at,
      options: data.options
    });
    if (data.selected) {
      this.set('selected', data.selected);
    }
  },

  join() {
    this.get('socket').joinPoll(this.get('pollId'))
      .then((data) => this.handleData(data))
      .catch((err) => {
        this.set('topic', err.reason);
        this.set('locked', false);
        this.set('allowEditing', false);
        this.set('options', []);
      })
      .finally(() => this.set('initialLoad', true));
  },

  leave() {
    this.setDefaults();

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
