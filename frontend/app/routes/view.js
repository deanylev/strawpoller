import Ember from 'ember';

export default Ember.Route.extend({
  model(params) {
    return {
      pollId: params.poll_id
    };
  },

  setupController(controller, model) {
    controller.subscribe(model.pollId);
  },

  resetController(controller) {
    controller.unsubscribe();
  }
});
