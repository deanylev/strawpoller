import Component from '@ember/component';
import config from '../../config/environment';

const socket = io(config.APP.SOCKET_HOST);

export default Component.extend({
  initialLoad: false,
  topic: '',
  options: [],
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

    socket.emit('view poll', this.get('poll_id'));
    socket.on('poll data', (data) => {
      this.set('topic', data.topic);
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
  },

  actions: {
    vote(optionId) {
      this.get('options').filter((option) => option.selected && option.id !== optionId).forEach((option) => {
        Ember.set(option, 'selected', false);
        socket.emit('remove vote', option.id);
      });

      const option = this.get('options').find((option) => option.id === optionId);
      socket.emit(option.selected ? 'remove vote' : 'add vote', optionId);
      Ember.set(option, 'selected', !option.selected);
    }
  }
});
