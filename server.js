// our libraries
const Logger = require('./logger');

// third party libraries
const express = require('express');
const uuidv4 = require('uuid/v4');
const mysql = require('mysql');
const emojiStrip = require('emoji-strip');
const passwordHash = require('password-hash');
const ioWildcard = require('socketio-wildcard');

// constants
const {
  PORT,
  QUERY_LIMIT,
  MASTER_PASS,
  DB_CREDS,
  HANDSHAKE_WAIT_TIME,
  REJECTION_REASONS
} = require('./globals');

// config
const logger = new Logger();
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
    name: 'allow_editing',
    type: 'tinyint(1)'
  },
  {
    name: 'edit_password',
    type: 'varchar(255)'
  },
  {
    name: 'public',
    type: 'tinyint(1)'
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

http.listen(PORT, () => logger.log('server', 'listening on port', PORT));

// keeps track of what polls are authenticated for editing to which users
const AUTHENTICATED = {};
// keeps track of socket event listeners
const LISTENERS = [];

io.on('connection', (socket) => {
  let CLIENT_ID = null;
  // Cloudflare messes with the connecting IP
  const CLIENT_IP = socket.client.request.headers['cf-connecting-ip'] || socket.request.connection.remoteAddress;
  const SOCKET_ID = socket.id;
  const sendFrame = (target, name, data) => {
    logger.log('socket', 'sending frame', {
      target,
      name,
      data
    });

    if (target === 'everyone') {
      io.emit(name, data);
    } else if (target === SOCKET_ID) {
      socket.emit(name, data);
    } else {
      io.to(target).emit(name, data);
    }
  };
  const registerListener = (name, callback, once) => {
    LISTENERS.push(name);
    socket[once ? 'once' : 'on'](name, (data = {}, ack) => {
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
          error: error.stack
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

  // promise which resolves with the topic, options and vote counts for a poll
  const getPollData = (id, unique, allFields) => {
    const retOptions = [];
    const selected = [];
    let options = null;
    let poll = null;
    return query('SELECT topic, locked, one_vote_per_ip, lock_changing, allow_editing, public FROM polls WHERE id = ?', [id], true)
      .then((row) => {
        if (row) {
          poll = row;
          return query('SELECT id, name FROM options WHERE poll_id = ? ORDER BY position ASC', [id]);
        } else {
          return Promise.reject();
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
          return query(`SELECT option_id FROM votes WHERE ip_address = ? ${poll.one_vote_per_ip ? '' : 'AND client_id = ?'}`, [CLIENT_IP, CLIENT_ID]);
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

        const obj = {
          topic: poll.topic,
          locked: !!poll.locked,
          lock_changing: !!poll.lock_changing,
          allow_editing: !!poll.allow_editing,
          public: !!poll.public,
          options: retOptions.map((option) => Object.assign(option, {
            max: option.votes + QUERY_LIMIT
          })),
          selected: unique ? selected : null
        };

        if (allFields) {
          obj.one_vote_per_ip = !!poll.one_vote_per_ip;
        }

        return obj;
      });
  };

  const sendPublicPolls = (target) => query('SELECT id, topic FROM polls WHERE public = 1 ORDER BY updated_at DESC')
    .then((publicPolls) => sendFrame(target, 'public polls', publicPolls));

  logger.log('socket', 'client connected', {
    id: SOCKET_ID,
    ip: CLIENT_IP
  });

  socket.on('disconnect', () => logger.log('socket', 'client disconnected', {
    id: SOCKET_ID,
    ip: CLIENT_IP
  }));

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

    if (!LISTENERS.includes(name)) {
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

      registerListener('create poll', (data, respond) => {
        const id = uuidv4();
        const options = data.options.filter((option) => option.name.trim());
        // match client-side validation
        if (data.topic && options.length >= 2 && (data.edit_password || !data.allow_editing)) {
          query('INSERT INTO polls SET ?', {
            id,
            created_at: Date.now(),
            updated_at: Date.now(),
            ip_address: CLIENT_IP,
            topic: emojiStrip(data.topic),
            locked: 0,
            one_vote_per_ip: data.one_vote_per_ip ? 1 : 0,
            lock_changing: data.lock_changing ? 1 : 0,
            allow_editing: data.allow_editing ? 1 : 0,
            edit_password: passwordHash.generate(data.edit_password || uuidv4()),
            public: data.public ? 1 : 0
          }).then(() => Promise.all(options.map((option) => query('INSERT INTO options SET ?', {
            id: uuidv4(),
            created_at: Date.now(),
            updated_at: Date.now(),
            poll_id: id,
            position: option.position,
            name: emojiStrip(option.name)
          })))).then(() => respond(true, {
            id
          })).then(() => {
            if (data.public) {
              sendPublicPolls('everyone');
            }
          });
        } else {
          respond(false, {
            reason: REJECTION_REASONS.params
          });
        }
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
        const options = data.options.filter((option) => option.name.trim());
        if (AUTHENTICATED[SOCKET_ID] && AUTHENTICATED[SOCKET_ID].id === data.id && data.topic && options.length >= 2) {
          const dbData = {
            updated_at: Date.now(),
            topic: emojiStrip(data.topic),
            lock_changing: data.lock_changing,
            public: data.public ? 1 : 0
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
          query('SELECT id FROM options WHERE poll_id = ?', [data.id]).then((results) => {
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
                      console.warn('a')
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
              // announce
              sendFrame(data.id, 'poll data', pollData);
              sendPublicPolls('everyone');
              respond(true);
            });
        } else {
          respond(false, {
            reason: REJECTION_REASONS.params
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
            .then(() => getPollData(data.id))
            .then((pollData) => {
              // announce
              sendPublicPolls('everyone');
              sendFrame(data.id, 'poll data', pollData);
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
        query('SELECT locked, one_vote_per_ip, lock_changing FROM polls WHERE id = ?', [pollId], true).then((poll) =>  {
          if (poll.locked) {
            respond(false, {
              reason: REJECTION_REASONS.auth
            });
            return;
          }

          query(`SELECT COUNT(1) FROM votes WHERE poll_id = ? AND ip_address = ? ${poll.one_vote_per_ip ? '' : 'AND client_id = ?'}`, [pollId, CLIENT_IP, CLIENT_ID], true).then((vote) => {
            if (vote['COUNT(1)'] && poll.lock_changing) {
              respond(false, {
                reason: REJECTION_REASONS.auth
              });
              return;
            }

            if (type === 'add') {
              query('SELECT id FROM options WHERE poll_id = ?', [pollId])
                // delete any existing votes from the same ip and/or client to prevent duplicates
                .then((options) => Promise.all(options.map((option) => query(`DELETE FROM votes WHERE option_id = ? AND ip_address = ? ${poll.one_vote_per_ip ? '' : 'AND client_id = ?'}`, [option.id, CLIENT_IP, CLIENT_ID]))))
                // add the new vote
                .then(() => query('INSERT INTO votes SET ?', {
                  id: uuidv4(),
                  created_at: Date.now(),
                  poll_id: pollId,
                  option_id: optionId,
                  client_id: CLIENT_ID,
                  ip_address: CLIENT_IP
                })).then(() => Promise.all([
                  getPollData(pollId),
                  getPollData(pollId, true)
                ])).then((values) => {
                  // announce
                  [pollId, poll.one_vote_per_ip ? CLIENT_IP : CLIENT_ID].forEach((target, index) => sendFrame(target, 'poll data', values[index]));
                  respond(true);
                });
            } else if (type === 'remove') {
              query(`DELETE FROM votes WHERE option_id = ? AND ip_address = ? ${poll.one_vote_per_ip ? '' : 'AND client_id = ?'}`, [optionId, CLIENT_IP, CLIENT_ID])
                .then(() => getPollData(pollId, true)).then((fullData) => {
                  const generalData = {};
                  Object.assign(generalData, fullData);
                  delete generalData.selected;
                  const data = [fullData, generalData];
                  // announce
                  [pollId, poll.one_vote_per_ip ? CLIENT_IP : CLIENT_ID].forEach((target, index) => sendFrame(target, 'poll data', data[index]));
                  respond(true);
              });
            } else {
              respond(false, {
                reason: REJECTION_REASONS.params
              });
            }
          });
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

app.get('/', (req, res) => res.render('pages/index'));
