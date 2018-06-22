// third party libraries
const express = require('express');
const uuidv4 = require('uuid/v4');
const mysql = require('mysql');
const md5 = require('md5');
const emojiStrip = require('emoji-strip');

// globals
const PORT = process.env.PORT || 8080;

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

[
  'CREATE TABLE IF NOT EXISTS options ( \
  id varchar(36) NOT NULL, \
  created_at bigint(13) NOT NULL, \
  updated_at bigint(13) NOT NULL, \
  poll_id varchar(36) NOT NULL, \
  name varchar(255) NOT NULL, \
  PRIMARY KEY (id), \
  UNIQUE KEY id_UNIQUE (id) \
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',

  'CREATE TABLE IF NOT EXISTS polls ( \
  id varchar(36) NOT NULL, \
  created_at bigint(13) NOT NULL, \
  updated_at bigint(13) NOT NULL, \
  ip_address varchar(45) NOT NULL, \
  topic mediumtext NOT NULL, \
  allow_editing tinyint(1) NOT NULL, \
  edit_password varchar(32) NOT NULL, \
  PRIMARY KEY (id), \
  UNIQUE KEY id_UNIQUE (id) \
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',

  'CREATE TABLE IF NOT EXISTS votes ( \
  id varchar(36) NOT NULL, \
  created_at bigint(13) NOT NULL, \
  option_id varchar(36) NOT NULL, \
  ip_address varchar(45) NOT NULL, \
  PRIMARY KEY (id), \
  UNIQUE KEY id_UNIQUE (id) \
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
].forEach((sql) => {
  query(sql);
});

http.listen(PORT, () => console.log('listening on port', PORT));

const UNLOCKED = {};

io.on('connection', (socket) => {
  const clientIp = socket.client.request.headers['cf-connecting-ip'] || socket.request.connection.remoteAddress;
  const socketId = socket.id;
  console.log('client connected', {
    id: socketId,
    clientIp
  });

  socket.on('disconnect', () => {
    console.log('client disconnected', {
      id: socketId,
      clientIp
    });

    // revoke edit permissions from any polls,
    // for extra peace of mind
    Object.keys(UNLOCKED).forEach((id) => {
      if (UNLOCKED[id] === socketId) {
        UNLOCKED[id] = null;
      }
    });
  });

  const getPollData = (id) => {
    return new Promise((resolve, reject) => {
      query('SELECT id, name FROM options WHERE poll_id = ?', [id]).then((results) => {
        const promises = [];
        const options = [];

        results.forEach((option) => {
          const promise = query('SELECT COUNT(*) FROM votes WHERE option_id = ?', [option.id]);
          promises.push(promise);
        });

        Promise.all(promises).then((values) => {
          const getSelected = [];
          values.forEach((value, index) => {
            const { id } = results[index];
            options.push({
              id,
              name: results[index].name,
              votes: value[0]['COUNT(*)']
            });
          });

          query('SELECT option_id FROM votes WHERE ip_address = ?', [clientIp]).then((votes) => {
            votes.forEach((vote) => {
              const option = options.find((option) => option.id === vote.option_id);
              if (option) {
                option.selected = true;
              }
            });
          }).then(() => query('SELECT topic FROM polls WHERE id = ?', [id]).then((polls) => {
            resolve({
              topic: polls[0] ? polls[0].topic : 'Poll not found.',
              options
            });
          }));
        });
      });
    });
  };

  socket.on('create poll', (data, callback) => {
    const pollId = uuidv4();
    // match client-side validation
    if (data.topic && data.options.length >= 2 && (data.edit_password || !data.allow_editing)) {
      query('INSERT INTO polls SET ?', {
        id: pollId,
        created_at: Date.now(),
        updated_at: Date.now(),
        ip_address: clientIp,
        topic: emojiStrip(data.topic),
        allow_editing: data.allow_editing || false,
        edit_password: md5(data.edit_password || uuidv4())
      }).then(() => data.options.forEach((option) => query('INSERT INTO options SET ?', {
        id: uuidv4(),
        created_at: Date.now(),
        updated_at: Date.now(),
        poll_id: pollId,
        name: emojiStrip(option.name)
      }))).then(() => callback(true, pollId));
    } else {
      callback(false);
    }
  });

  socket.on('view poll', (id) => {
    getPollData(id).then((pollData) => socket.join(id, () => socket.emit('poll data', pollData)));
  });

  socket.on('edit poll', (id, callback) => {
    getPollData(id).then(callback);
  });

  socket.on('unlock poll', (data, callback) => {
    query('SELECT allow_editing, edit_password FROM polls WHERE id = ?', [data.id]).then((polls) => {
      if ((polls[0] && polls[0].allow_editing && polls[0].edit_password === md5(data.password)) || data.password === process.env.MASTER_PASS) {
        UNLOCKED[data.id] = socketId;
        callback(true);
      } else {
        callback(false);
      }
    });
  });

  socket.on('save poll', (data, callback) => {
    const promises = [];
    // match client-side validation
    if (UNLOCKED[data.id] === socketId && data.topic && data.options.length >= 2) {
      query('UPDATE polls SET ? WHERE id = ?', [{
        updated_at: Date.now(),
        topic: emojiStrip(data.topic)
      }, data.id])
        .then(() => data.options.forEach((option) => promises.push(query('UPDATE options SET ? WHERE id = ?', [{
          updated_at: Date.now(),
          name: emojiStrip(option.name)
        }, option.id]))))
        .then(() => Promise.all(promises))
        .then(() => getPollData(data.id))
        .then((pollData) => {
          io.to(data.id).emit('poll data', pollData);
          callback(true);
        });
    } else {
      callback(false);
    }
  });

  socket.on('add vote', (optionId) => {
    Promise.all([
      query('SELECT poll_id FROM options WHERE id = ?', [optionId]),
      query('INSERT INTO votes SET ?', {
        id: uuidv4(),
        created_at: Date.now(),
        option_id: optionId,
        ip_address: clientIp
      })
    ]).then((values) => {
      const pollId = values[0][0].poll_id;
      getPollData(pollId).then((pollData) => io.to(pollId).emit('poll data', pollData));
    });
  });

  socket.on('remove vote', (optionId) => {
    Promise.all([
      query('SELECT poll_id FROM options WHERE id = ?', [optionId]),
      query('DELETE FROM votes WHERE option_id = ? AND ip_address = ?', [optionId, clientIp])
    ]).then((values) => {
      const pollId = values[0][0].poll_id;
      getPollData(pollId).then((pollData) => io.to(pollId).emit('poll data', pollData));
    });
  });
});

app.get('/', (req, res) => res.render('pages/index'));
