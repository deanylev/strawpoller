import Ember from 'ember';

export default Ember.Component.extend({
  socket: Ember.inject.service(),

  initialLoad: false,

  topic: '',
  allowEditing: false,
  options: [],

  handleData: null,
  join: null,

  waitingForResponse: false,

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
    addVote(option) {
      if (this.get('waitingForResponse')) {
        return;
      }

      this.set('waitingForResponse', true);

      const selectedOption = this.get('options').find((option) => option.selected);
      if (selectedOption) {
        Ember.setProperties(selectedOption, {
          selected: false,
          votes: selectedOption.votes - 1
        });
      }
      Ember.setProperties(option, {
        selected: true,
        votes: option.votes + 1
      });
      this.get('socket').addVote(this.get('poll_id'), option.id);
    },

    removeVote(option) {
      if (this.get('waitingForResponse')) {
        return;
      }

      this.set('waitingForResponse', true);

      Ember.setProperties(option, {
        selected: false,
        votes: option.votes - 1
      });
      this.get('socket').removeVote(this.get('poll_id'), option.id);
    }
  }
});
