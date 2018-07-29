import Ember from 'ember';

export default Ember.Route.extend({
  model(params) {
    return {
      pollId: params.poll_id
    };
  },

  setupController(controller, model) {
    controller.set('pollId', model.pollId);
  },

  resetController(controller) {
    controller.setDefaults();
  }
});
