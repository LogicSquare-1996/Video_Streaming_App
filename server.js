const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const { v4: uuidV4 } = require('uuid');
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI , {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Import Stream model
const Stream = require('./models/Stream');

// Middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store active rooms and their viewer counts
const rooms = new Map();

// Routes
app.get('/', (req, res) => {
  res.render('home');
});

app.get('/broadcast', (req, res) => {
  res.redirect(`/broadcast/${uuidV4()}`);
});

app.get('/broadcast/:room', async (req, res) => {
  const roomId = req.params.room;
  try {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { viewers: 0 });
      
      // Create new stream record in database
      const stream = new Stream({
        roomId: roomId,
        broadcaster: 'anonymous',
        title: 'Untitled Stream'
      });
      await stream.save();
    }
    res.render('broadcast', { roomId });
  } catch (err) {
    console.error('Error creating broadcast:', err);
    res.redirect('/?error=failed_to_create_broadcast');
  }
});

app.get('/join/:room', async (req, res) => {
  const roomId = req.params.room;
  try {
    const stream = await Stream.findOne({ roomId: roomId });
    if (!stream || !stream.isLive) {
      return res.render('error', { 
        message: 'Stream not found or has ended. Please check the room ID and try again.' 
      });
    }
    res.render('viewer', { roomId });
  } catch (err) {
    console.error('Error finding stream:', err);
    res.render('error', { 
      message: 'Unable to join the stream. Please try again later.' 
    });
  }
});

// Socket.io connection handling
io.on('connection', socket => {
  let currentRoom;
  let userType;

  socket.on('join-room', (roomId, type) => {
    currentRoom = roomId;
    userType = type;
    socket.join(roomId);

    if (type === 'viewer' && rooms.has(roomId)) {
      rooms.get(roomId).viewers++;
      io.to(roomId).emit('viewer-count', rooms.get(roomId).viewers);
    }
  });

  socket.on('viewer-join', (roomId) => {
    socket.to(roomId).emit('viewer-joined', socket.id);
  });

  socket.on('viewer-leave', (roomId) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).viewers = Math.max(0, rooms.get(roomId).viewers - 1);
      io.to(roomId).emit('viewer-count', rooms.get(roomId).viewers);
    }
  });

  socket.on('offer', ({ offer, to }) => {
    socket.to(to).emit('offer', { offer, from: socket.id });
  });

  socket.on('answer', ({ answer, to }) => {
    socket.to(to).emit('answer', { answer, from: socket.id });
  });

  socket.on('ice-candidate', ({ candidate, to }) => {
    socket.to(to).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('start-broadcasting', async (roomId) => {
    try {
      await Stream.findOneAndUpdate(
        { roomId: roomId },
        { isLive: true },
        { new: true }
      );
      socket.to(roomId).emit('broadcaster-ready');
    } catch (err) {
      console.error('Error updating stream status:', err);
      socket.emit('error', 'Failed to start broadcasting');
    }
  });

  socket.on('stop-broadcasting', async (roomId) => {
    try {
      await Stream.findOneAndUpdate(
        { roomId: roomId },
        { isLive: false },
        { new: true }
      );
      socket.to(roomId).emit('broadcaster-disconnected');
    } catch (err) {
      console.error('Error updating stream status:', err);
      socket.emit('error', 'Failed to stop broadcasting');
    }
  });

  socket.on('disconnect', async () => {
    if (currentRoom && rooms.has(currentRoom)) {
      if (userType === 'viewer') {
        rooms.get(currentRoom).viewers = Math.max(0, rooms.get(currentRoom).viewers - 1);
        io.to(currentRoom).emit('viewer-count', rooms.get(currentRoom).viewers);
      } else if (userType === 'broadcaster') {
        try {
          await Stream.findOneAndUpdate(
            { roomId: currentRoom },
            { isLive: false },
            { new: true }
          );
          socket.to(currentRoom).emit('broadcaster-disconnected');
        } catch (err) {
          console.error('Error updating stream status:', err);
        }
      }

      if (rooms.get(currentRoom).viewers <= 0) {
        rooms.delete(currentRoom);
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.render('error', { 
    message: 'Something went wrong. Please try again later.' 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { 
    message: 'Page not found. Please check the URL and try again.' 
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});