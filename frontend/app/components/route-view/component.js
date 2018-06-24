import Component from '@ember/component';
import config from '../../config/environment';

export default Component.extend({
  socket: Ember.inject.service(),

  initialLoad: false,

  topic: '',
  allowEditing: false,
  options: [],

  handleData: null,
  join: null,

  pie: null,
  pieData: Ember.computed('options.@each.votes', function() {
    return this.get('options').map((option) => ({
      label: option.name,
      value: option.votes
    }));
  }),

  votesDidChange: Ember.observer('options.@each.votes', function() {
    if (this.get('pie')) {
      this.get('pie').updateProp('data.content', this.get('pieData'));
    }
  }),

  init() {
    this._super(...arguments);

    this.set('handleData', (data) => {
      this.set('topic', data.topic);
      this.set('allowEditing', data.allow_editing);
      this.set('options', data.options);
      if (!this.get('initialLoad')) {
        const pie = new d3pie('pie', {
          effects: {
            load: {
              effect: 'none'
            },
            pullOutSegmentOnClick: {
              effect: 'none'
            },
          },
          data: {
            content: this.get('pieData')
          }
        });
        this.set('pie', pie);
        this.set('initialLoad', true);
      }
    });

    this.set('join', () => {
      this.get('socket').sendFrame('join poll', {
        id: this.get('poll_id')
      });
    });

    this.join();

    this.get('socket').registerListener('poll data', this.handleData);
    this.get('socket').registerListener('connect', this.join);
  },

  willDestroy() {
    // remove listeners
    this.get('socket').unregisterListener('poll data', this.handleData);
    this.get('socket').unregisterListener('connect', this.join);

    // unsubscribe from the room
    this.get('socket').sendFrame('leave poll', {
      id: this.get('poll_id')
    });

    this._super(...arguments);
  },

  actions: {
    vote(optionId) {
      const option = this.get('options').find((option) => option.id === optionId);
      this.get('socket').sendFrame(option.selected ? 'remove vote' : 'add vote', {
        id: optionId
      }).then(() => Ember.set(option, 'selected', !option.selected));
    }
  }
});
