const express = require('express');
const fs = require('fs');
const SpotifyWebApi = require('spotify-web-api-node');
const _ = require('lodash');

const AuthConfig = require('../config/auth');

const Bot = require('./models/Bot');
const QueueItem = require('./models/QueueItem');
const QueueManager = require('./models/QueueManager');

const spotifyApi = new SpotifyWebApi({
  clientId: AuthConfig.CLIENT_ID,
  clientSecret: AuthConfig.CLIENT_SECRET
});

const Router = express.Router;

let accessToken = null;

// fetches a new token
const fetchNewToken = callback => {
  console.log('Fetching new token');
  spotifyApi
    .clientCredentialsGrant()
    .then(data => {
      accessToken = data.body['access_token'];
      const expires_in = data.body['expires_in'];
      spotifyApi.setAccessToken(accessToken);
      callback && callback(accessToken);
      setTimeout(() => {
        fetchNewToken();
      }, (expires_in - 10 * 60) * 1000); // refresh it in expires_in - 10 min
    })
    .catch(e => {
      console.error('fetchNewToken > Error fetching new token', e);
    });
};

// returns a new token or the cached one if still valid
const getToken = callback => {
  if (accessToken !== null) {
    callback && callback(accessToken);
  } else {
    fetchNewToken(callback);
  }
};

const botUser = new Bot({
  getToken: getToken,
  spotifyApi: spotifyApi
});

let users = [
  {
    user: botUser.toJSON()
  }
];

let allQueueManagers = {};

const exportedApi = io => {
  let api = Router();

  // TODO: preface all of these with the roomId
  api.get('/', (req, res) => {
    res.json({ version });
  });

  api.get('/me', async (req, res) => {
    await getToken();
    try {
      const resApi = spotifyApi.getMe();
      res.json(resApi.body);
    } catch (e) {
      console.log('error', e);
      res.status(500);
    }
  });

  api.get('/users', (req, res) => {
    res.json(users.map(u => u.user));
  });

  api.get('/:roomId/now-playing', (req, res) => {
    if (req.params.roomId) {
      const queueManager = allQueueManagers[req.params.roomId];
      return res.json(queueManager.getPlayingContext());
    }
    res.json({});
  });

  api.get('/:roomId/queue', (req, res) => {
    console.log('fetching queue');
    if (req.params.roomId) {
      const queueManager = allQueueManagers[req.params.roomId];
      return res.json(queueManager.getQueue());
    }
    res.json([]);
  });

  // web socket interface!
  io.on('connection', socket => {
    socket.on('queue track', trackId => {
      console.log('queueing track ' + trackId);
      getToken(() => {
        spotifyApi
          .getTrack(trackId)
          .then(resApi => {
            const queueManager = allQueueManagers[socket.roomId];
            queueManager.addItem(
              new QueueItem({
                user: socket.user,
                track: resApi.body
              }).toJSON()
            );
          })
          .catch(e => {
            console.log('error', e);
          });
      });
    });

    socket.on('vote up', id => {
      // todo: check that user is owner
      const queueManager = allQueueManagers[socket.roomId];
      queueManager.voteUpId(socket.user, id);
    });

    socket.on('remove track', id => {
      // todo: check that user is owner
      const queueManager = allQueueManagers[socket.roomId];
      queueManager.removeId(socket.user, id);
    });

    socket.on('user login', user => {
      users.push({
        user: user,
        socket: socket.id
      });
      socket.user = user;

      socket.emit('update users', users.map(u => u.user));
      socket.broadcast.emit('update users', users.map(u => u.user));
    });

    socket.on('joinRoom', id => {
      console.log('Joining room with id', id);
      socket.join(id);
      socket.roomId = id;
      socket.emit('joinedRoomSuccess', id);

      if (!_.get(allQueueManagers, id, null)) {
        console.log('Creating a queueManager for this room');
        const queueManager = new QueueManager({
          onPlay: () => {
            const { track, user } = queueManager.getPlayingContext();
            io.to(id).emit('play track', track, user);
          },
          onQueueChanged: () => {
            io.to(id).emit('update queue', queueManager.getQueue());
          },
          onQueueEnded: async () => {
            io.to(id).emit('update queue', queueManager.getQueue());

            const botRecommendation = await botUser.generateRecommendation(
              queueManager.playedHistory,
              getToken,
              spotifyApi
            );
            if (botRecommendation !== null) {
              queueManager.addItem(
                new QueueItem({
                  track: botRecommendation,
                  user: botUser
                }).toJSON()
              );
            }
          }
        });
        allQueueManagers[id] = queueManager;
        return;
      }

      const queueManager = allQueueManagers[id];
      const playingContext = queueManager.getPlayingContext();
      if (playingContext.track != null) {
        socket.emit(
          'play track',
          playingContext.track,
          playingContext.user,
          Date.now() - playingContext.startTimestamp
        );
      }
    });

    socket.on('disconnect', () => {
      console.log('disconnect ' + socket.id);
      let index = -1;
      users.forEach((user, i) => {
        if (user.socket === socket.id) {
          index = i;
        }
      });
      if (index !== -1) {
        users.splice(index, 1);
        socket.emit('update users', users.map(u => u.user));
        socket.broadcast.emit('update users', users.map(u => u.user));
      }
    });
  });

  return api;
};

module.exports = exportedApi;
