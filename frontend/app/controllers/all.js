import Ember from 'ember';

export default Ember.Controller.extend({
  socket: Ember.inject.service(),

  password: '',
  error: '',

  actions: {
    submitPassword() {
      return this.get('socket').getAllPolls(this.get('password'))
        .then((data) => this.set('socket.allPolls', data.polls))
        .catch((err) => this.set('error', err.reason));
    }
  }
});
