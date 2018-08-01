import Ember from 'ember';

export default Ember.Controller.extend({
  socket: Ember.inject.service(),
  router: Ember.inject.service(),

  socketPublicPollsDidChange: Ember.observer('socket.publicPolls', function() {
    if (!this.get('socket.publicPolls').length) {
      this.get('router').transitionTo('create');
    }
  }),

  init() {
    this._super(...arguments);

    if (!this.get('socket.publicPolls').length) {
      this.get('router').transitionTo('create');
    }
  },
});
