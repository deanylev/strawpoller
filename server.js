// our libraries
const SkrtLogger = require('skrt-logger');

// third party libraries
const express = require('express');
const uuidv4 = require('uuid/v4');
const mysql = require('mysql');
const emojiStrip = require('emoji-strip');
const passwordHash = require('password-hash');
const ioWildcard = require('socketio-wildcard');
const bodyParser = require('body-parser');
const cors = require('cors');
const _ = require('lodash');

// constants
const {
  PORT,
  QUERY_LIMIT,
  MASTER_PASS,
  DB_CREDS,
  HANDSHAKE_WAIT_TIME,
  REJECTION_REASONS,
  MAXIMUM_UNLOCK_AT,
  ENABLE_API,
  THROTTLE_INTERVAL,
  THROTTLE_VIOLATION_THRESHOLD
} = require('./globals');

// config
const logger = new SkrtLogger();
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const pool = mysql.createPool(DB_CREDS);

io.use(ioWildcard());

// promise which resolves with the query results
const query = (query, values, singleRow) => {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      connection.query(query, values, (err, results) => {
        connection.release();
        if (err) {
          reject(err);
        } else {
          resolve(singleRow ? results[0] : results);
        }
      });
    });
  });
};

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({
  extended: true
}));

app.use((req, res, next) => {
  logger.log('router', 'request',  Object.assign(_.pick(req, 'method', 'url', 'body'), {
    ip: req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress
  }));
  next();
});

// actual logic

// create DB tables

const createTable = (name, columns, updatedAt = true) => {
  let columnsQuery = '';

  columns.forEach((column) => columnsQuery += `${column.name} ${column.type} ${column.allowNull ? '' : 'NOT NULL'},`);

  query(`
    CREATE TABLE IF NOT EXISTS ${name} (
      id varchar(36) NOT NULL,
      created_at bigint(13) NOT NULL,
      ${updatedAt ? 'updated_at bigint(13) NOT NULL,' : ''}
      ${columnsQuery}
      PRIMARY KEY (id),
      UNIQUE KEY id_UNIQUE (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
};

createTable('options', [
  {
    name: 'poll_id',
    type: 'varchar(36)'
  },
  {
    name: 'position',
    type: 'int(11)'
  },
  {
    name: 'name',
    type: 'varchar(255)'
  }
]);

createTable('polls', [
  {
    name: 'ip_address',
    type: 'varchar(45)'
  },
  {
    name: 'topic',
    type: 'mediumtext'
  },
  {
    name: 'locked',
    type: 'tinyint(1)'
  },
  {
    name: 'one_vote_per_ip',
    type: 'tinyint(1)'
  },
  {
    name: 'lock_changing',
    type: 'tinyint(1)'
  },
  {
    name: 'multiple_votes',
    type: 'tinyint(1)'
  },
  {
    name: 'public',
    type: 'tinyint(1)'
  },
  {
    name: 'allow_editing',
    type: 'tinyint(1)'
  },
  {
    name: 'edit_password',
    type: 'varchar(255)'
  },
  {
    name: 'unlock_at',
    type: 'bigint(13)',
    allowNull: true
  },
  {
    name: 'vote_display',
    type: 'smallint(1)'
  }
]);

createTable('votes', [
  {
    name: 'poll_id',
    type: 'varchar(36)'
  },
  {
    name: 'option_id',
    type: 'varchar(36)'
  },
  {
    name: 'client_id',
    type: 'varchar(80)'
  },
  {
    name: 'ip_address',
    type: 'varchar(45)'
  }
], false);

http.listen(PORT, () => logger.log('server', 'started listening', {
  port: PORT
}));

// keeps track of what polls are authenticated for editing to which users
const AUTHENTICATED = {};
// keeps track of timeouts to unlock polls
const TIMEOUTS = {};
// keeps track of connected clients
let CLIENTS = [];

// promise which resolves with the topic, options and vote counts for a poll
const pollData = (data, unique, allFields) => {
  const retOptions = [];
  const selected = [];
  let options = null;
  let poll = null;
  const { id, clientIp, clientId } = data;
  return query('SELECT topic, locked, one_vote_per_ip, lock_changing, multiple_votes, public, allow_editing, unlock_at, vote_display FROM polls WHERE id = ?', [id], true)
    .then((row) => {
      if (row) {
        poll = row;
        return query('SELECT id, name FROM options WHERE poll_id = ? ORDER BY position ASC', [id]);
      } else {
        return Promise.reject(REJECTION_REASONS.existence);
      }
    }).then((rows) => {
      const promises = rows.map((option) => query('SELECT COUNT(*) FROM votes WHERE option_id = ?', [option.id]));
      options = rows;
      return Promise.all(promises);
    }).then((values) => {
      values.forEach((value, index) => {
        const { id } = options[index];
        retOptions.push({
          id,
          name: options[index].name,
          votes: value[0]['COUNT(*)']
        });
      });

      if (unique) {
        return query(`SELECT option_id FROM votes WHERE ip_address = ? ${poll.one_vote_per_ip ? '' : 'AND client_id = ?'}`, [clientIp, clientId]);
      } else {
        return Promise.resolve();
      }
    }).then((votes) => {
      if (votes) {
        votes.forEach((vote) => {
          const option = retOptions.find((option) => option.id === vote.option_id);
          if (option) {
            selected.push(option.id);
          }
        });
      }

      if (!allFields && (poll.vote_display === 1 && unique && !selected.length || poll.vote_display === 2)) {
        retOptions.forEach((option) => option.votes = null);
      }

      const obj = {
        id,
        topic: poll.topic,
        locked: !!poll.locked,
        lock_changing: !!poll.lock_changing,
        multiple_votes: !!poll.multiple_votes,
        public: !!poll.public,
        allow_editing: !!poll.allow_editing,
        unlock_at: poll.unlock_at,
        vote_display: poll.vote_display,
        options: allFields ? retOptions.map((option) => Object.assign(option, {
          max: option.votes + QUERY_LIMIT
        })) : retOptions
      };

      if (unique) {
        obj.selected = selected;
      }

      if (allFields) {
        obj.one_vote_per_ip = !!poll.one_vote_per_ip;
      }

      return obj;
    });
};
const createPoll = (data, ipAddress) => {
  const id = uuidv4();
  const topic = emojiStrip(data.topic.trim());
  data.options = data.options || [];
  data.options.forEach((option, index) => option.name = option.name.trim());
  const options = data.options.filter((o1, i, arr) => o1.name && arr.map((o2) => o2.name).indexOf(o1.name) === i);
  let unlockAt = new Date(data.unlock_at);
  // set time to 12 am
  ['Hour', 'Minute', 'Second'].forEach((unit) => unlockAt[`set${unit}s`](0));
  unlockAt = +unlockAt;
  // match client-side validation
  if (topic && options.length >= 2 && (data.edit_password || !data.allow_editing) && (!data.lock_changing || !data.multiple_votes) &&
    ((typeof data.unlock_at === 'number' && data.unlock_at >= Date.now() && data.unlock_at <= MAXIMUM_UNLOCK_AT) || !data.unlock_at)) {
    return query('INSERT INTO polls SET ?', {
      id,
      created_at: Date.now(),
      updated_at: Date.now(),
      ip_address: ipAddress,
      topic,
      locked: data.unlock_at ? 1 : 0,
      one_vote_per_ip: data.one_vote_per_ip ? 1 : 0,
      lock_changing: data.lock_changing ? 1 : 0,
      multiple_votes: data.multiple_votes ? 1 : 0,
      public: data.public ? 1 : 0,
      allow_editing: data.allow_editing ? 1 : 0,
      edit_password: passwordHash.generate(data.edit_password || uuidv4()),
      unlock_at: data.unlock_at ? unlockAt : null,
      vote_display: typeof data.vote_display === 'number' && !isNaN(data.vote_display) && data.vote_display >= 0 && data.vote_display <= 2 ? data.vote_display : 0
    }).then(() => Promise.all(options.map((option, position) => query('INSERT INTO options SET ?', {
      id: uuidv4(),
      created_at: Date.now(),
      updated_at: Date.now(),
      poll_id: id,
      position,
      name: emojiStrip(option.name)
    })))).then(() => ({
      id,
      unlockAt
    }));
  } else {
    return Promise.reject();
  }
};

const schedulePollUnlock = (id, at) => {
  logger.log('server', 'scheduled poll to unlock', {
    id,
    at: new Date(at).toGMTString()
  });
  TIMEOUTS[id] = setTimeout(() => {
    query('UPDATE polls SET ? WHERE locked = 1 AND id = ?', [{
      locked: 0
    }, id]).then((results) => {
      if (results.affectedRows) {
        logger.log('server', 'automatically unlocked poll', {
          id
        });
        pollData(id).then((pollData) => io.to(id).emit('poll data', pollData));
      }
    });
  }, at - Date.now());
};
const cancelPollUnlock = (id) => {
  logger.log('server', 'cancelled poll unlock', {
    id
  });
  clearTimeout(TIMEOUTS[id]);
};

// set polls to unlock on schedule
query('SELECT id, unlock_at FROM polls WHERE unlock_at >= ?', [Date.now()]).then((polls) => {
  polls.forEach((poll) => schedulePollUnlock(poll.id, poll.unlock_at));
});

io.on('connection', (socket) => {
  const LISTENERS = new Set();
  // Cloudflare messes with the connecting IP
  const CLIENT_IP = socket.client.request.headers['cf-connecting-ip'] || socket.request.connection.remoteAddress;
  const SOCKET_ID = socket.id;
  let CLIENT_ID = null;
  let CLIENT = null;
  // wrap function to make code cleaner
  const getPollData = (id, unique, allFields) => {
    return pollData({
      id,
      clientIp: CLIENT_IP,
      clientId: CLIENT_ID
    }, unique, allFields);
  };
  const sendFrame = (target, name, data, excludeCurrent) => {
    logger.log('socket', 'sending frame', {
      target,
      excludeCurrent,
      name,
      data
    });

    if (target === 'everyone') {
      (excludeCurrent ? socket.broadcast : io).emit(name, data);
    } else if (target === SOCKET_ID) {
      socket.emit(name, data);
    } else {
      (excludeCurrent ? socket.broadcast : io).to(target).emit(name, data);
    }
  };
  const registerListener = (name, callback, once) => {
    LISTENERS.add(name);
    socket[once ? 'once' : 'on'](name, (data = {}, ack) => {
      const client = CLIENT || {};
      if (once) {
        LISTENERS.delete(name);
      }
      if (typeof data !== 'object' || data === null || typeof ack !== 'function') {
        logger.warn('socket', 'dropping frame', {
          socketId: SOCKET_ID,
          name,
          data,
          ack,
          reason: REJECTION_REASONS.params
        });
        return;
      }
      if (Date.now() - client.throttledAt < THROTTLE_INTERVAL) {
        logger.warn('socket', 'dropping frame', {
          socketId: SOCKET_ID,
          name,
          data,
          ack,
          reason: REJECTION_REASONS.throttled
        });
        ack(false);
        if (THROTTLE_VIOLATION_THRESHOLD && ++client.throttleViolations >= THROTTLE_VIOLATION_THRESHOLD) {
          kickClient('throttle violation threshold crossed');
        } else {
          client.throttledAt = Date.now();
        }
        return;
      }

      client.throttledAt = Date.now();

      try {
        callback(data, (success, data) => {
          ack(success, data);
          logger[success ? 'log' : 'warn']('socket', `${success ? 'accepting' : 'rejecting'} frame`, {
            socketId: SOCKET_ID,
            name,
            data
          });
        });
      } catch (error) {
        logger.error('socket', 'uncaught error inside listener callback', {
          socketId: SOCKET_ID,
          name,
          data,
          error
        });

        ack(false);
      }
    });
  };
  const kickClient = (reason) => {
    logger.warn('socket', 'kicking client', {
      socketId: SOCKET_ID,
      reason
    });

    socket.disconnect();
  };
  const waitForThrottle = (callback) => {
    setTimeout(callback, Math.max(0, CLIENT.throttledAt + THROTTLE_INTERVAL - Date.now()));
  };

  const sendPublicPolls = (target) => query('SELECT id, topic FROM polls WHERE public = 1 ORDER BY updated_at DESC')
    .then((publicPolls) => sendFrame(target, 'public polls', publicPolls));

  logger.log('socket', 'client connected', {
    id: SOCKET_ID,
    ip: CLIENT_IP
  });

  socket.on('disconnect', () => {
    logger.log('socket', 'client disconnected', {
      id: SOCKET_ID,
      ip: CLIENT_IP
    });

    CLIENTS = CLIENTS.filter((client) => client.socketId !== SOCKET_ID);
  });

  socket.on('*', (packet) => {
    const name = packet.data[0];
    const data = typeof packet.data[1] === 'object' && packet.data[1] !== null ? packet.data[1] : {};
    const cleanData = {};
    Object.keys(data).forEach((key) => cleanData[key] = key === 'password' ? 'REDACTED' : data[key]);
    logger.log('socket', 'received frame', {
      socketId: SOCKET_ID,
      name,
      data: cleanData
    });

    if (!LISTENERS.has(name)) {
      logger.warn('socket', 'dropping frame', {
        socketId: SOCKET_ID,
        name,
        data,
        reason: REJECTION_REASONS.listener
      });
    }
  });

  // kick client if no handshake within specified period
  setTimeout(() => {
    if (CLIENT_ID === null) {
      kickClient('handshake timeout');
    }
  }, HANDSHAKE_WAIT_TIME);

  registerListener('handshake', (data, respond) => {
    if (typeof data.clientId === 'string' && data.clientId.length === 32) {
      CLIENT_ID = data.clientId;
      socket.join(CLIENT_ID);
      socket.join(CLIENT_IP);
      sendFrame(SOCKET_ID, 'handshake');
      respond(true);
      sendPublicPolls(SOCKET_ID);

      CLIENT = {
        id: CLIENT_ID,
        socketId: SOCKET_ID,
        throttledAt: 0,
        throttleViolations: 0
      };

      CLIENTS.push(CLIENT);

      registerListener('create poll', (data, respond) => {
        createPoll(data, CLIENT_IP)
          .then((poll) => {
            waitForThrottle(() => respond(true, {
              id: poll.id
            }));

            if (data.public) {
              sendPublicPolls('everyone');
            }

            if (data.unlock_at) {
              schedulePollUnlock(poll.id, poll.unlockAt);
            }
          })
          .catch(() => respond(false, {
            reason: REJECTION_REASONS.params
          }));
      });

      registerListener('join poll', (data, respond) => {
        getPollData(data.id, true)
          .then((pollData) => socket.join(data.id, () => respond(true, pollData)))
          .catch((err) => respond(false, {
            reason: REJECTION_REASONS.existence
          }));
      });

      registerListener('leave poll', (data) => socket.leave(data.id));

      registerListener('authenticate poll', (data, respond) => {
        query('SELECT allow_editing, edit_password FROM polls WHERE id = ?', [data.id], true).then((poll) => {
          if (poll) {
            if ((poll.allow_editing && passwordHash.verify(data.password, poll.edit_password)) || data.password === MASTER_PASS) {
              const admin = data.password === MASTER_PASS;
              // unassign the poll if someone has else authenticated it before
              const previous = Object.keys(AUTHENTICATED).find((socketId) => AUTHENTICATED[socketId].id === data.id);
              if (previous) {
                AUTHENTICATED[previous].id = null;
              }
              AUTHENTICATED[SOCKET_ID] = {
                id: data.id,
                admin
              };
              // return data to client requesting it
              getPollData(data.id, false, admin).then((pollData) => respond(true, Object.assign(pollData, {
                admin
              })));
            } else {
              respond(false, {
                reason: REJECTION_REASONS.password
              });
            }
          } else {
            respond(false, {
              reason: REJECTION_REASONS.existence
            });
          }
        });
      });

      registerListener('save poll', (data, respond) => {
        // match client-side validation
        const topic = emojiStrip(data.topic.trim());
        data.options.forEach((option, index) => option.name = option.name.trim());
        const options = data.options.filter((o1, i, arr) => o1.name && arr.map((o2) => o2.name).indexOf(o1.name) === i);
        let unlockAt = new Date(data.unlock_at);
        // set time to 12 am
        ['Hour', 'Minute', 'Second'].forEach((unit) => unlockAt[`set${unit}s`](0));
        unlockAt = +unlockAt;
        if (AUTHENTICATED[SOCKET_ID] && AUTHENTICATED[SOCKET_ID].id === data.id) {
          if (topic && options.length >= 2 && (!data.lock_changing || !data.multiple_votes) &&
            ((typeof data.unlock_at === 'number' && data.unlock_at >= Date.now() && data.unlock_at <= MAXIMUM_UNLOCK_AT) || !data.unlock_at)) {
            const dbData = {
              updated_at: Date.now(),
              topic,
              locked: data.unlock_at ? 1 : 0,
              lock_changing: data.lock_changing ? 1 : 0,
              multiple_votes: data.multiple_votes ? 1 : 0,
              public: data.public ? 1 : 0,
              unlock_at: data.unlock_at ? unlockAt : null,
              vote_display: typeof data.vote_display === 'number' && !isNaN(data.vote_display) && data.vote_display >= 0 && data.vote_display <= 2 ? data.vote_display : 0
            };
            // only allow admins to change certain props
            if (AUTHENTICATED[SOCKET_ID].admin) {
              dbData.one_vote_per_ip = data.one_vote_per_ip ? 1 : 0;
              dbData.allow_editing = data.allow_editing ? 1 : 0;
            }
            if (data.edit_password) {
              dbData.edit_password = passwordHash.generate(data.edit_password);
            }
            let currentOptions = null;
            let newOptions = null;
            query('SELECT id FROM options WHERE poll_id = ?', [data.id])
              .then((results) => {
                currentOptions = options.filter((o1) => results.find((o2) => o2.id === o1.id));
                newOptions = options.filter((o1) => !currentOptions.find((o2) => o2.id === o1.id));
                return query('UPDATE polls SET ? WHERE id = ?', [dbData, data.id]);
              })
              // delete options from before that have been removed
              .then(() => {
                if (data.removed_options.length) {
                  return Promise.all([
                    query('DELETE FROM options WHERE poll_id = ? AND id IN (?)', [data.id, data.removed_options]),
                    query('DELETE FROM votes WHERE poll_id = ? AND option_id IN (?)', [data.id, data.removed_options])
                  ]);
                } else {
                  return Promise.resolve();
                }
              })
              // change names of options from before
              .then(() => Promise.all(currentOptions.map((option) => query('UPDATE options SET ? WHERE poll_id = ? AND id = ?', [{
                updated_at: Date.now(),
                position: option.position,
                name: emojiStrip(option.name)
              }, data.id, option.id]))))
              // add new options
              .then(() => Promise.all(newOptions.map((option) => query('INSERT INTO options SET ?', [{
                id: uuidv4(),
                created_at: Date.now(),
                updated_at: Date.now(),
                poll_id: data.id,
                position: option.position,
                name: emojiStrip(option.name)
              }, option.id]))))
              .then(() => {
                // only allow admins to insert fake votes
                if (AUTHENTICATED[SOCKET_ID].admin) {
                  let remainingQueries = QUERY_LIMIT;
                  const promises = [];
                  return Promise.all(currentOptions.map((option) => query('SELECT COUNT(*) FROM votes WHERE poll_id = ? AND option_id = ?', [data.id, option.id], true)
                    .then((result) => {
                      const voteCount = result['COUNT(*)'];
                      // the new vote count is higher than the current count, votes need to be added to the db
                      if (option.votes > voteCount) {
                        for (let i = 0; i < Math.min(option.votes - voteCount, remainingQueries); i++) {
                          promises.push(query('INSERT INTO votes SET ?', {
                            id: uuidv4(),
                            created_at: Date.now(),
                            poll_id: data.id,
                            option_id: option.id,
                            client_id: 'ADMIN',
                            ip_address: 'ADMIN'
                          }));
                        }
                        remainingQueries -= option.votes - voteCount;
                      } else {
                        // otherwise, votes need to be deleted from the db
                        promises.push(query('DELETE FROM votes WHERE poll_id = ? AND option_id = ? LIMIT ?', [data.id, option.id, voteCount - option.votes]));
                      }
                    }))).then(() => Promise.all(promises));
                } else {
                  return Promise.resolve();
                }
              })
              .then(() => getPollData(data.id))
              .then((pollData) => {
                cancelPollUnlock(data.id);
                if (data.unlock_at) {
                  schedulePollUnlock(data.id, unlockAt);
                }
                // announce
                sendFrame(data.id, 'poll data', pollData);
                sendPublicPolls('everyone');
                waitForThrottle(() => respond(true));
              });
          } else {
            respond(false, {
              reason: REJECTION_REASONS.params
            });
          }
        } else {
          respond(false, {
            reason: REJECTION_REASONS.auth
          });
        }
      });

      registerListener('set poll locked', (data, respond) => {
        if (AUTHENTICATED[SOCKET_ID] && AUTHENTICATED[SOCKET_ID].id === data.id) {
          query('UPDATE polls SET ? WHERE id = ?', [{
            locked: data.locked
          }, data.id]).then(() => getPollData(data.id).then((pollData) => {
            sendFrame(data.id, 'poll data', pollData);
            respond(true);
          }));
        } else {
          respond(false, {
            reason: REJECTION_REASONS.auth
          });
        }
      });

      registerListener('delete poll', (data, respond) => {
        if (AUTHENTICATED[SOCKET_ID] && AUTHENTICATED[SOCKET_ID].id === data.id) {
          query('DELETE FROM polls WHERE id = ?', [data.id])
            .then(() => query('DELETE FROM options WHERE poll_id = ?', [data.id]))
            .then(() => query('DELETE FROM votes WHERE poll_id = ?', [data.id]))
            .then(() => {
              cancelPollUnlock(data.id);
              sendPublicPolls('everyone');
              // send fake poll data
              sendFrame(data.id, 'poll data', {
                topic: 'Poll deleted.',
                options: []
              });
              respond(true);
            });
        } else {
          respond(false, {
            reason: REJECTION_REASONS.auth
          });
        }
      });

      registerListener('vote', (data, respond) => {
        const { type, pollId, optionId } = data;
        let poll = null;
        query('SELECT locked, one_vote_per_ip, lock_changing, multiple_votes FROM polls WHERE id = ?', [pollId], true).then((row) => {
          poll = row;
          if (!poll) {
            respond(false, {
              reason: REJECTION_REASONS.existence
            });
            return Promise.reject();
          }
          if (poll.locked) {
            respond(false, {
              reason: REJECTION_REASONS.auth
            });
            return Promise.reject();
          }

          return query(`SELECT COUNT(1) FROM votes WHERE poll_id = ? AND ip_address = ? ${poll.one_vote_per_ip ? '' : 'AND client_id = ?'}`, [pollId, CLIENT_IP, CLIENT_ID], true);
        }).then((vote) => {
          if (vote['COUNT(1)'] && poll.lock_changing) {
            respond(false, {
              reason: REJECTION_REASONS.auth
            });
            return Promise.reject();
          }

          if (type === 'add') {
            return query('SELECT id FROM options WHERE poll_id = ?', [pollId])
              // delete any existing votes from the same ip and/or client to prevent duplicates
              .then((options) => {
                if (poll.multiple_votes) {
                  return query(`DELETE FROM votes WHERE option_id = ? AND ip_address = ? ${poll.one_vote_per_ip ? '' : 'AND client_id = ?'}`, [optionId, CLIENT_IP, CLIENT_ID]);
                } else {
                  return Promise.all(options.map((option) => query(`DELETE FROM votes WHERE option_id = ? AND ip_address = ? ${poll.one_vote_per_ip ? '' : 'AND client_id = ?'}`, [option.id, CLIENT_IP, CLIENT_ID])))
                }
              })
              // add the new vote
              .then(() => query('INSERT INTO votes SET ?', {
                id: uuidv4(),
                created_at: Date.now(),
                poll_id: pollId,
                option_id: optionId,
                client_id: CLIENT_ID,
                ip_address: CLIENT_IP
              }));
          } else if (type === 'remove') {
            return query(`DELETE FROM votes WHERE option_id = ? AND ip_address = ? ${poll.one_vote_per_ip ? '' : 'AND client_id = ?'}`, [optionId, CLIENT_IP, CLIENT_ID]);
          } else {
            respond(false, {
              reason: REJECTION_REASONS.params
            });
            return Promise.reject();
          }
        }).then(() => getPollData(pollId, true)).then((fullData) => {
          const generalData = {};
          Object.assign(generalData, fullData);
          delete generalData.selected;
          const data = [generalData, fullData];
          // announce
          [pollId, poll.one_vote_per_ip ? CLIENT_IP : CLIENT_ID].forEach((target, index) => sendFrame(target, 'poll data', data[index], !index));
          respond(true);
        });
      });

      registerListener('get all polls', (data, respond) => {
        if (data.password === MASTER_PASS) {
          query('SELECT id, topic, public FROM polls ORDER BY updated_at ASC').then((polls) => {
            respond(true, {
              polls
            });
          });
        } else {
          respond(false, {
            reason: REJECTION_REASONS.password
          });
        }
      });
    } else {
      respond(false, {
        reason: REJECTION_REASONS.params
      });
      kickClient('handshake rejected');
    }
  }, true);
});

// public routes

app.get('/', (req, res) => res.render('pages/index'));

if (ENABLE_API) {
  const apiV1 = express.Router();
  apiV1.all('*', cors());
  app.use('/api/v1', apiV1);

  apiV1.get('/polls/:id', (req, res) => {
    pollData(req.params)
      .then((pollData) => res.json(pollData))
      .catch(() => res.sendStatus(404));
  });

  apiV1.post('/polls', (req, res) => {
    createPoll(req.body, getIp(req))
      .then((poll) => getPollData(poll.id))
      .then((pollData) => res.json(pollData))
      .catch(() => res.sendStatus(400));
  });
}
