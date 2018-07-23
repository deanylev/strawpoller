import Ember from 'ember';

export default Ember.Route.extend({
  socket: Ember.inject.service(),

  beforeModel() {
    return new Ember.RSVP.Promise((resolve, reject) => {
      this.get('socket').registerOnce('connect', resolve);
    });
  },
});
