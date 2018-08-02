import Ember from 'ember';

export default Ember.Controller.extend({
  socket: Ember.inject.service(),
  router: Ember.inject.service(),

  initialLoad: false,

  init() {
    this._super(...arguments);

    this.get('socket').registerOnce('public polls', () => this.set('initialLoad', true));
  }
});
