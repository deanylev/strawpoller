# Strawpoller

Strawpoller uses Node.js/Socket.IO/Ember.js to produce live updating, interactive polls.

## Installing Locally

You must have Node.js and Yarn installed (preferably the latest version).

### Running the backend

1. Run `yarn` once from the root of the repo to set up dependencies.
2. Run `npm start` from the root of the repo. The default port is 8080, but you can change this by setting the `PORT` env variable.
3. Access the app at `http://localhost:PORT` where PORT is whatever you set the port to (the default being 8080).

### Running the frontend

When running in development mode, the frontend assumes the backend is running on port 8080. You can change this by setting the `SERVER_PORT` env variable.

1. Run `yarn` once from `frontend` to set up dependencies.
2. Run `ember s` from `frontend`.
3. Access the frontend at `http://localhost:4200`.

### Building the frontend

Run `make compile` in the root of the repo. It will build the frontend and move the generated files to the correct places.

### Environment Variables

`PORT` - What port the backend will run on. (default 8080)

`SERVER_PORT` - What port the frontend will try to access the backend on. This needs to be the same as `PORT`. (default 8080)

`DB_HOST` - MySQL host. (default 'localhost')

`DB_USER` - MySQL username. (default 'root')

`DB_PASS` - MySQL password. (default '')

`DB_NAME` - MySQL DB name. (default 'awesome_media_downloader')

`MASTER_PASS` - An optional 'master password' to access editing for any poll, whether editing is set to allowed or not. Also grants special admin permissions when editing a poll. (default null)

`QUERY_LIMIT` - The max number of queries allowed to be run in a single function. (default 1000)

`ENABLE_API` - Whether to enable the undocumented public API. (default false)

`THROTTLE_INTERVAL` - The number of milliseconds that have to pass before a new request can be made by the client over the socket. If a request is made before this interval has passed, the timer gets reset back to this interval, and a throttle violation is recorded against the client. This is to prevent exploiting the database-heavy nature of requests such as voting. (default 300)

`THROTTLE_VIOLATION_THRESHOLD` - The number of throttle violations that need to be exceeded before a client is kicked from the server. This should be set low enough so as to prevent exploits, but high enough so as to not hurt users who simply click vote buttons repeatedly, for example. If set to 0, this feature will be disabled. (default 0)
