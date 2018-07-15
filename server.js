// third party libraries
const express = require('express');
const uuidv4 = require('uuid/v4');
const mysql = require('mysql');
const emojiStrip = require('emoji-strip');
const passwordHash = require('password-hash');

// constants
const PORT = process.env.PORT || 8080;
const QUERY_LIMIT = process.env.QUERY_LIMIT || 1000;
const { MASTER_PASS } = process.env;

// config
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const pool = mysql.createPool({
  connectionLimit: 5,
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'strawpoller'
});

// promise which resolves with the query results
const query = (query, values) => {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      connection.query(query, values, (err, results) => {
        connection.release();
        if (err) {
          reject(err);
        } else {
          resolve(results);
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
    name: 'option_id',
    type: 'varchar(36)'
  },
  {
    name: 'ip_address',
    type: 'varchar(45)'
  }
], false);

http.listen(PORT, () => console.log('listening on port', PORT));

const UNLOCKED = {};

io.on('connection', (socket) => {
  // Cloudflare messes with the connecting IP
  const clientIp = socket.client.request.headers['cf-connecting-ip'] || socket.request.connection.remoteAddress;
  const socketId = socket.id;
  console.log('client connected', {
    id: socketId,
    ip: clientIp
  });

  socket.on('disconnect', () => {
    console.log('client disconnected', {
      id: socketId,
      clientIp
    });
  });

  // promise which resolves with the topic, options and vote counts for a poll
  const getPollData = (id) => {
    const options = [];
    let optionResults = null;
    return query('SELECT id, name FROM options WHERE poll_id = ?', [id]).then((results) => {
      const promises = results.map((option) => query('SELECT COUNT(*) FROM votes WHERE option_id = ?', [option.id]));
      optionResults = results;
      return Promise.all(promises);
    }).then((values) => {
      const getSelected = [];
      values.forEach((value, index) => {
        const { id } = optionResults[index];
        options.push({
          id,
          name: optionResults[index].name,
          votes: value[0]['COUNT(*)']
        });
      });

      return query('SELECT option_id FROM votes WHERE ip_address = ?', [clientIp]).then((votes) => {
        votes.forEach((vote) => {
          const option = options.find((option) => option.id === vote.option_id);
          if (option) {
            option.selected = true;
          }
        });
      });
    }).then(() => query('SELECT topic, public, allow_editing FROM polls WHERE id = ?', [id])).then((polls) => {
      const poll = polls[0];
      return {
        topic: poll ? poll.topic : 'Poll not found.',
        public: poll ? !!poll.public : false,
        allow_editing: poll ? !!poll.allow_editing : false,
        options: poll ? options.map((option) => Object.assign(option, {
          max: option.votes + QUERY_LIMIT
        })) : []
      };
    });
  };

  socket.on('get public polls', (data, callback) => query('SELECT id, topic FROM polls WHERE public = 1 ORDER BY updated_at DESC').then((polls) => {
    callback(true, polls);
  }));

  socket.on('create poll', (data, callback) => {
    const id = uuidv4();
    // match client-side validation
    if (data.topic && data.options.length >= 2 && (data.edit_password || !data.allow_editing)) {
      query('INSERT INTO polls SET ?', {
        id,
        created_at: Date.now(),
        updated_at: Date.now(),
        ip_address: clientIp,
        topic: emojiStrip(data.topic),
        public: data.public,
        allow_editing: data.allow_editing,
        edit_password: passwordHash.generate(data.edit_password || uuidv4())
      }).then(() => Promise.all(data.options.map((option) => query('INSERT INTO options SET ?', {
        id: uuidv4(),
        created_at: Date.now(),
        updated_at: Date.now(),
        poll_id: id,
        name: emojiStrip(option.name)
      })))).then(() => callback(true, {
        id
      }));
    } else {
      callback(false);
    }
  });

  socket.on('join poll', (data) => getPollData(data.id).then((pollData) => socket.join(data.id, () => socket.emit('poll data', pollData))));
  socket.on('leave poll', (data) => socket.leave(data.id));

  socket.on('unlock poll', (data, callback) => {
    query('SELECT allow_editing, edit_password FROM polls WHERE id = ?', [data.id]).then((polls) => {
      const poll = polls[0];
      if (poll) {
        if ((poll.allow_editing && passwordHash.verify(data.password, poll.edit_password)) || data.password === MASTER_PASS) {
          const admin = data.password === MASTER_PASS;
          UNLOCKED[data.id] = {
            socketId,
            admin
          };
          // return data to client requesting it
          getPollData(data.id).then((pollData) => callback(true, Object.assign(pollData, {
            admin
          })));
        } else {
          callback(false, {
            error: 'Password incorrect.'
          });
        }
      } else {
        callback(false, {
          error: 'Poll not found.'
        });
      }
    });
  });

  socket.on('edit poll', (data, callback) => {
    // match client-side validation
    if (UNLOCKED[data.id] && UNLOCKED[data.id].socketId === socketId && data.topic && data.options.length >= 2) {
      const dbData = {
        updated_at: Date.now(),
        topic: emojiStrip(data.topic),
        public: data.public
      };
      // only allow admins to change allow_editing prop
      if (UNLOCKED[data.id] && UNLOCKED[data.id].admin) {
        dbData.allow_editing = data.allow_editing;
      }
      if (data.edit_password) {
        dbData.edit_password = passwordHash.generate(data.edit_password);
      }
      // hack to keep MySQL happy
      if (!data.removed_options.length) {
        data.removed_options.push(uuidv4());
      }
      let currentOptions = null;
      let newOptions = null;
      query('SELECT id FROM options WHERE poll_id = ?', [data.id]).then((options) => {
          currentOptions = data.options.filter((o1) => options.find((o2) => o2.id === o1.id));
          newOptions = data.options.filter((o1) => !currentOptions.find((o2) => o2.id === o1.id));
          return query('UPDATE polls SET ? WHERE id = ?', [dbData, data.id]);
        })
        // delete options from before that have been removed
        .then(() => query('DELETE FROM options WHERE id IN (?)', [data.removed_options]))
        // change names of options from before
        .then(() => Promise.all(currentOptions.map((option) => query('UPDATE options SET ? WHERE id = ?', [{
          updated_at: Date.now(),
          name: emojiStrip(option.name)
        }, option.id]))))
        // add new options
        .then(() => Promise.all(newOptions.map((option) => query('INSERT INTO options SET ?', [{
          id: uuidv4(),
          created_at: Date.now(),
          updated_at: Date.now(),
          poll_id: data.id,
          name: emojiStrip(option.name)
        }, option.id]))))
        .then(() => {
          // only allow admins to insert fake votes
          if (UNLOCKED[data.id] && UNLOCKED[data.id].admin) {
            let remainingQueries = QUERY_LIMIT;
            const promises = [];
            return Promise.all(currentOptions.map((option) => query('SELECT COUNT(*) FROM votes WHERE option_id = ?', [option.id])
              .then((votes) => {
                const voteCount = votes[0]['COUNT(*)'];
                // the new vote count is higher than the current count, votes need to be added to the db
                if (option.votes > voteCount) {
                  for (let i = 0; i < Math.min(option.votes - voteCount, remainingQueries); i++) {
                    promises.push(query('INSERT INTO votes SET ?', {
                      id: uuidv4(),
                      created_at: Date.now(),
                      option_id: option.id,
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
          io.to(data.id).emit('poll data', pollData);
          callback(true);
        });
    } else {
      callback(false);
    }
  });

  socket.on('delete poll', (data, callback) => {
    if (UNLOCKED[data.id] && UNLOCKED[data.id].socketId === socketId) {
      // delete the poll
      query('DELETE FROM polls WHERE id = ?', [data.id])
        .then(() => getPollData(data.id))
        .then((pollData) => {
          // announce
          io.to(data.id).emit('poll data', pollData);
          callback(true);
        });
    } else {
      callback(false);
    }
  });

  socket.on('add vote', (data) => {
    let pollId = null;
    query('SELECT poll_id FROM options WHERE id = ?', [data.id])
      .then((options) => {
        pollId = options[0].poll_id;
        return query('SELECT id FROM options WHERE poll_id = ?', [pollId])
      })
      // delete any existing votes from the same ip to prevent duplicates
      .then((options) => Promise.all(options.map((option) => query('DELETE FROM votes WHERE option_id = ? AND ip_address = ?', [option.id, clientIp]))))
      // add the new vote
      .then(() => query('INSERT INTO votes SET ?', {
        id: uuidv4(),
        created_at: Date.now(),
        option_id: data.id,
        ip_address: clientIp
      }))
      // announce
      .then(() => getPollData(pollId).then((pollData) => io.to(pollId).emit('poll data', pollData)));
  });

  socket.on('remove vote', (data) => {
    Promise.all([
      query('SELECT poll_id FROM options WHERE id = ?', [data.id]),
      query('DELETE FROM votes WHERE option_id = ? AND ip_address = ?', [data.id, clientIp])
    ]).then((values) => {
      const pollId = values[0][0].poll_id;
      getPollData(pollId).then((pollData) => io.to(pollId).emit('poll data', pollData));
    });
  });
});

app.get('/', (req, res) => res.render('pages/index'));
