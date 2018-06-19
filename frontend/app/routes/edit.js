import Route from '@ember/routing/route';

export default Route.extend({
  model(params) {
    return {
      poll_id: params.poll_id
    };
  },

  renderTemplate() {
    this.render({
      into: 'application'
    });
  }
});
