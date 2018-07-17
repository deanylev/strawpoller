import Ember from 'ember';

export default Ember.Component.extend({
  socket: Ember.inject.service(),

  initialLoad: false,

  topic: '',
  allowEditing: false,
  options: [],

  handleData: null,
  join: null,

  inFlight: false,

  init() {
    this._super(...arguments);

    this.set('handleData', (data) => {
      this.setProperties({
        topic: data.topic,
        allowEditing: data.allow_editing,
        options: data.options,
        waitingForResponse: false
      });
      this.set('topic', data.topic);
      this.set('allowEditing', data.allow_editing);
      this.set('options', data.options);
      if (!this.get('initialLoad')) {
        this.set('initialLoad', true);
      }
    });

    this.set('join', () => this.get('socket').joinPoll(this.get('poll_id')));

    this.join();

    this.get('socket').registerListener('poll data', this.handleData);
    this.get('socket').registerListener('connect', this.join);
  },

  willDestroy() {
    // remove listeners
    this.get('socket').unregisterListener('poll data', this.handleData);
    this.get('socket').unregisterListener('connect', this.join);

    // unsubscribe from the room
    this.get('socket').leavePoll(this.get('poll_id'))

    this._super(...arguments);
  },

  actions: {
    vote(option) {
      this.set('inFlight', true);
      return new Ember.RSVP.Promise((resolve, reject) => {
        let func = option.selected ? 'removeVote': 'addVote';
        this.get('socket')[func](this.get('poll_id'), option.id).then(() => {
          // make a best effort to wait for the vote queue to be processed
          this.get('socket').registerOnce('poll data', resolve);
          // but only wait 3 seconds for the sake of UX
          setTimeout(resolve, 3000);
        });
      }).then(() => this.set('inFlight', false));
    }
  }
});
