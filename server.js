// third party libraries
const express = require('express');
const uuidv4 = require('uuid/v4');
const mysql = require('mysql');
const emojiStrip = require('emoji-strip');
const passwordHash = require('password-hash');

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
  public tinyint(1) NOT NULL, \
  allow_editing tinyint(1) NOT NULL, \
  edit_password varchar(255) NOT NULL, \
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
    ip: clientIp
  });

  socket.on('disconnect', () => {
    console.log('client disconnected', {
      id: socketId,
      clientIp
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
          }).then(() => query('SELECT topic, public, allow_editing FROM polls WHERE id = ?', [id]).then((polls) => {
            const poll = polls[0];
            resolve({
              topic: poll ? poll.topic : 'Poll not found.',
              public: poll ? !!poll.public : false,
              allow_editing: poll ? !!poll.allow_editing : false,
              options: poll ? options : []
            });
          }));
        });
      });
    });
  };

  socket.on('get public polls', (data, callback) => {
    query('SELECT id, topic FROM polls WHERE public = 1 ORDER BY updated_at DESC').then((polls) => {
      callback(true, polls);
    });
  });

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
      }).then(() => data.options.forEach((option) => query('INSERT INTO options SET ?', {
        id: uuidv4(),
        created_at: Date.now(),
        updated_at: Date.now(),
        poll_id: id,
        name: emojiStrip(option.name)
      }))).then(() => callback(true, {
        id
      }));
    } else {
      callback(false);
    }
  });

  socket.on('join poll', (data) => {
    getPollData(data.id).then((pollData) => socket.join(data.id, () => socket.emit('poll data', pollData)));
  });

  socket.on('leave poll', (data) => {
    socket.leave(data.id);
  });

  socket.on('unlock poll', (data, callback) => {
    query('SELECT allow_editing, edit_password FROM polls WHERE id = ?', [data.id]).then((polls) => {
      const poll = polls[0];
      if (poll) {
        if (data.password === process.env.MASTER_PASS) {
          UNLOCKED[data.id] = {
            socketId,
            admin: true
          };
          getPollData(data.id).then((pollData) => callback(true, Object.assign(pollData, {
            admin: true
          })));
        } else if ((poll.allow_editing && passwordHash.verify(data.password, poll.edit_password)) || data.password === process.env.MASTER_PASS) {
          UNLOCKED[data.id] = {
            socketId,
            admin: false
          };
          getPollData(data.id).then((pollData) => callback(true, pollData));
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
    const promises = [];
    // match client-side validation
    if (UNLOCKED[data.id].socketId === socketId && data.topic && data.options.length >= 2) {
      const dbData = {
        updated_at: Date.now(),
        topic: emojiStrip(data.topic),
        public: data.public
      };
      if (UNLOCKED[data.id].admin) {
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
      .then(() => query('DELETE FROM options WHERE id IN (?)', [data.removed_options]))
      .then(() => currentOptions.forEach((option) => promises.push(query('UPDATE options SET ? WHERE id = ?', [{
        updated_at: Date.now(),
        name: emojiStrip(option.name)
      }, option.id]))))
      .then(() => newOptions.forEach((option) => promises.push(query('INSERT INTO options SET ?', [{
        id: uuidv4(),
        created_at: Date.now(),
        updated_at: Date.now(),
        poll_id: data.id,
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

  socket.on('delete poll', (data, callback) => {
    if (UNLOCKED[data.id].socketId === socketId) {
      query('DELETE FROM polls WHERE id = ?', [data.id])
        .then(() => getPollData(data.id))
        .then((pollData) => {
          io.to(data.id).emit('poll data', pollData);
          callback(true);
        });
    } else {
      callback(false);
    }
  });

  socket.on('add vote', (data) => {
    Promise.all([
      query('SELECT poll_id FROM options WHERE id = ?', [data.id]),
      query('INSERT INTO votes SET ?', {
        id: uuidv4(),
        created_at: Date.now(),
        option_id: data.id,
        ip_address: clientIp
      })
    ]).then((values) => {
      const pollId = values[0][0].poll_id;
      getPollData(pollId).then((pollData) => io.to(pollId).emit('poll data', pollData));
    });
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
