import Ember from 'ember';

export default Ember.Route.extend({
  model(params) {
    return {
      poll_id: params.poll_id
    };
  },

  renderTemplate() {
    this.render({
      into: 'application'
    });
  },
});
