import EmberRouter from '@ember/routing/router';
import config from './config/environment';

const Router = EmberRouter.extend({
  location: config.locationType,
  rootURL: config.rootURL
});

Router.map(function() {
  this.route('create', {
    path: '/'
  });
  this.route('public');
  this.route('all');
  this.route('view', {
    path: '/view/:poll_id'
  });
  this.route('edit', {
    path: '/edit/:poll_id'
  });
});

export default Router;
