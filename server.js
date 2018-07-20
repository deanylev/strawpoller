// our libraries
const Logger = require('./logger');

// third party libraries
const express = require('express');
const uuidv4 = require('uuid/v4');
const mysql = require('mysql');
const emojiStrip = require('emoji-strip');
const passwordHash = require('password-hash');

// constants
const {
  PORT,
  QUERY_LIMIT,
  MASTER_PASS,
  DB_CREDS
} = require('./globals');

// config
const logger = new Logger();
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const pool = mysql.createPool(DB_CREDS);

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

// keeps track of what polls are unlocked for editing to which users
const UNLOCKED = {};

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
  const registerListener = (name, callback) => {
    socket.on(name, (data, ack) => {
      let cleanData = {};
      Object.keys(data || {}).forEach((key) => cleanData[key] = key === 'password' ? 'REDACTED' : data[key]);
      logger.log('socket', 'received frame', {
        socketId: SOCKET_ID,
        name,
        data: cleanData
      });

      function respond(success, data) {
        ack(success, data);
        logger[success ? 'log' : 'warn']('socket', `${success ? 'accepting' : 'rejecting'} frame`, Object.assign({
          socketId: SOCKET_ID,
          name
        }, data || {}));
      }

      callback(data, respond);
    });
  };

  // promise which resolves with the topic, options and vote counts for a poll
  const getPollData = (id, unique) => {
    const options = [];
    const selected = [];
    let optionResults = null;
    return query('SELECT id, name FROM options WHERE poll_id = ? ORDER BY position ASC', [id]).then((results) => {
      const promises = results.map((option) => query('SELECT COUNT(*) FROM votes WHERE option_id = ?', [option.id]));
      optionResults = results;
      return Promise.all(promises);
    }).then((values) => {
      values.forEach((value, index) => {
        const { id } = optionResults[index];
        options.push({
          id,
          name: optionResults[index].name,
          votes: value[0]['COUNT(*)']
        });
      });

      if (unique) {
        return query('SELECT option_id FROM votes WHERE client_id = ? AND ip_address = ?', [CLIENT_ID, CLIENT_IP]).then((votes) => {
          votes.forEach((vote) => {
            const option = options.find((option) => option.id === vote.option_id);
            if (option) {
              selected.push(option.id);
            }
          });
        });
      } else {
        return Promise.resolve();
      }
    }).then(() => query('SELECT topic, public, allow_editing FROM polls WHERE id = ?', [id], true)).then((poll) => {
      return {
        topic: poll ? poll.topic : 'Poll not found.',
        public: poll ? !!poll.public : false,
        allow_editing: poll ? !!poll.allow_editing : false,
        options: poll ? options.map((option) => Object.assign(option, {
          max: option.votes + QUERY_LIMIT
        })) : [],
        selected: unique ? selected : null
      };
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

  registerListener('handshake', (data, respond) => {
    if (typeof data.clientId === 'string' && data.clientId.length === 32) {
      CLIENT_ID = data.clientId;
      socket.join(CLIENT_ID);
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
            public: data.public ? 1 : 0,
            allow_editing: data.allow_editing ? 1 : 0,
            edit_password: passwordHash.generate(data.edit_password || uuidv4())
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
            reason: 'Invalid params.'
          });
        }
      });

      registerListener('join poll', (data) => getPollData(data.id, true).then((pollData) => socket.join(data.id, () => sendFrame(SOCKET_ID, 'poll data', pollData))));
      registerListener('leave poll', (data) => socket.leave(data.id));

      registerListener('unlock poll', (data, respond) => {
        query('SELECT allow_editing, edit_password FROM polls WHERE id = ?', [data.id], true).then((poll) => {
          if (poll) {
            if ((poll.allow_editing && passwordHash.verify(data.password, poll.edit_password)) || data.password === MASTER_PASS) {
              const admin = data.password === MASTER_PASS;
              UNLOCKED[data.id] = {
                socketId: SOCKET_ID,
                admin
              };
              // return data to client requesting it
              getPollData(data.id).then((pollData) => respond(true, Object.assign(pollData, {
                admin
              })));
            } else {
              respond(false, {
                reason: 'Password incorrect.'
              });
            }
          } else {
            respond(false, {
              reason: 'Poll not found.'
            });
          }
        });
      });

      registerListener('save poll', (data, respond) => {
        // match client-side validation
        const options = data.options.filter((option) => option.name.trim());
        if (UNLOCKED[data.id] && UNLOCKED[data.id].socketId === SOCKET_ID && data.topic && options.length >= 2) {
          const dbData = {
            updated_at: Date.now(),
            topic: emojiStrip(data.topic),
            public: data.public ? 1 : 0
          };
          // only allow admins to change allow_editing prop
          if (UNLOCKED[data.id] && UNLOCKED[data.id].admin) {
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
            .then(() => data.removed_options.length ? query('DELETE FROM options WHERE id IN (?)', [data.removed_options]) : Promise.resolve())
            // change names of options from before
            .then(() => Promise.all(currentOptions.map((option) => query('UPDATE options SET ? WHERE id = ?', [{
              updated_at: Date.now(),
              position: option.position,
              name: emojiStrip(option.name)
            }, option.id]))))
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
              if (UNLOCKED[data.id] && UNLOCKED[data.id].admin) {
                let remainingQueries = QUERY_LIMIT;
                const promises = [];
                return Promise.all(currentOptions.map((option) => query('SELECT COUNT(*) FROM votes WHERE option_id = ?', [option.id], true)
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
                          client_id: CLIENT_ID,
                          ip_address: 'ADMIN'
                        }));
                      }
                      remainingQueries -= option.votes - voteCount;
                    } else {
                      // otherwise, votes need to be deleted from the db
                      promises.push(query('DELETE FROM votes WHERE option_id = ? LIMIT ?', [option.id, voteCount - option.votes]));
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
              respond(true);

              if (data.public) {
                sendPublicPolls('everyone');
              }
            });
        } else {
          respond(false, {
            reason: 'Invalid params.'
          });
        }
      });

      registerListener('delete poll', (data, respond) => {
        if (UNLOCKED[data.id] && UNLOCKED[data.id].socketId === SOCKET_ID) {
          let isPublic = false;
          query('SELECT public FROM polls WHERE id = ?', [data.id], true)
            .then((poll) => {
              isPublic = poll.public;
              return query('DELETE FROM polls WHERE id = ?', [data.id])
            })
            .then(() => getPollData(data.id))
            .then((pollData) => {
              // announce
              if (isPublic) {
                sendPublicPolls('everyone');
              }
              sendFrame(data.id, 'poll data', pollData);
              respond(true);
            });
        } else {
          respond(false, {
            reason: 'Unauthorised.'
          });
        }
      });

      registerListener('vote', (data, respond) => {
        const { type, pollId, optionId } = data;
        if (type === 'add') {
          query('SELECT id FROM options WHERE poll_id = ?', [pollId])
            // delete any existing votes from the same ip to prevent duplicates
            .then((options) => Promise.all(options.map((option) => query('DELETE FROM votes WHERE option_id = ? AND client_id = ? AND ip_address = ?', [option.id, CLIENT_ID, CLIENT_IP]))))
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
              [pollId, CLIENT_ID].forEach((target, index) => sendFrame(target, 'poll data', values[index]));
              respond(true);
            });
        } else if (type === 'remove') {
          query('DELETE FROM votes WHERE option_id = ? AND client_id = ? AND ip_address = ?', [optionId, CLIENT_ID, CLIENT_IP]).then(() => Promise.all([
            getPollData(pollId),
            getPollData(pollId, true)
          ])).then((values) => {
            // announce
            [pollId, CLIENT_ID].forEach((target, index) => sendFrame(target, 'poll data', values[index]));
            respond(true);
          });
        } else {
          respond(false, {
            reason: 'Invalid params.'
          });
        }
      });
    } else {
      respond(false, {
        reason: 'Invalid client ID.'
      });
      socket.disconnect();
    }
  });
});

app.get('/', (req, res) => res.render('pages/index'));
