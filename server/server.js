const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();
const authRoutes = require('./routes/auth');
const meetingRoutes = require('./routes/meetings');
const { info, logError } = require('./utils/logger');
const User = require('./models/User');
const Meeting = require('./models/Meeting');
const MeetingSession = require('./models/MeetingSession');

// Environment Variable Checks
if (!process.env.JWT_SECRET) {
  logError('FATAL ERROR: JWT_SECRET is not defined.');
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  logError('FATAL ERROR: MONGO_URI is not defined.');
  process.exit(1);
}
if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  info('WARNING: Twilio credentials not found. Using fallback STUN/TURN servers.');
}
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  logError('FATAL ERROR: Google OAuth credentials not defined.');
  process.exit(1);
}
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  logError('FATAL ERROR: Cloudinary credentials not defined.');
  process.exit(1);
}

// App & Server Setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://genaizoom123.onrender.com', 'https://genaizoomserver-0yn4.onrender.com'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: 1e8, // 100MB buffer as fallback
});

// Multer Setup for Temporary File Storage
const upload = multer({ dest: 'tmp/' }); // Temporary storage before Cloudinary upload

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['https://genaizoom123.onrender.com', 'https://genaizoomserver-0yn4.onrender.com'],
  methods: ['GET', 'POST', 'PUT'],
  credentials: true,
}));
app.use(express.json());
app.use(passport.initialize());

// JWT Authentication Middleware for Uploads
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    logError('JWT auth error', err);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Database Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => info('MongoDB Connected')).catch(err => logError('MongoDB Connection Error', err));

// Passport (Authentication)
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `https://genaizoomserver-0yn4.onrender.com/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
          user.lastLogin = new Date();
          await user.save();
        } else {
          user = new User({
            googleId: profile.id,
            email,
            username: profile.displayName,
          });
          await user.save();
        }
        const token = jwt.sign(
          { userId: user._id, username: user.username, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        );
        return done(null, { user, token });
      } catch (error) {
        logError('Google OAuth error', error);
        return done(error, null);
      }
    }
  )
);

// Twilio ICE Server Caching
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
let cachedIceServers = null;
let iceServersExpiry = null;
const fetchIceServers = async () => {
  try {
    let iceServers = [];
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const token = await twilioClient.tokens.create();
      iceServers = [...token.iceServers];
      info('Fetched Twilio ICE servers');
    } else {
      info('No Twilio credentials, using fallback servers');
    }
    iceServers = [
      ...iceServers,
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayprojectsecret',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayprojectsecret',
      },
      {
        urls: 'turns:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayprojectsecret',
      },
    ];
    cachedIceServers = iceServers;
    iceServersExpiry = Date.now() + 24 * 60 * 60 * 1000;
    info('Cached ICE servers:', iceServers.map(s => s.urls));
    return iceServers;
  } catch (error) {
    logError('Twilio ICE server error', error);
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayprojectsecret',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayprojectsecret',
      },
      {
        urls: 'turns:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayprojectsecret',
      },
    ];
  }
};

// ICE Servers Endpoint
app.get('/ice-servers', async (req, res) => {
  try {
    if (cachedIceServers && iceServersExpiry && Date.now() < iceServersExpiry) {
      info('Serving cached ICE servers');
      res.json(cachedIceServers);
    } else {
      const iceServers = await fetchIceServers();
      res.json(iceServers);
    }
  } catch (error) {
    logError('ICE servers endpoint error', error);
    res.status(500).json({ error: 'Failed to fetch ICE servers' });
  }
});

// Meeting Session Endpoints
app.get('/api/meeting-session/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;
    const session = await MeetingSession.findOne({ roomId });
    if (!session) {
      return res.status(404).json({ error: 'Meeting session not found' });
    }
    res.json(session);
  } catch (error) {
    logError('Error fetching meeting session:', error);
    res.status(500).json({ error: 'Failed to fetch meeting session' });
  }
});

app.post('/api/meeting-session/:roomId/participant', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, username, socketId } = req.body;
    
    let session = await MeetingSession.findOne({ roomId });
    if (!session) {
      session = new MeetingSession({ roomId });
    }
    
    session.addParticipant(userId, username, socketId);
    await session.save();
    
    res.json(session);
  } catch (error) {
    logError('Error updating meeting session participant:', error);
    res.status(500).json({ error: 'Failed to update meeting session' });
  }
});

app.post('/api/meeting-session/:roomId/upload', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { type, url, uploadedBy, uploadedByUsername, filename, size } = req.body;
    
    let session = await MeetingSession.findOne({ roomId });
    if (!session) {
      session = new MeetingSession({ roomId });
    }
    
    session.addUploadedFile({ type, url, uploadedBy, uploadedByUsername, filename, size });
    await session.save();
    
    res.json(session);
  } catch (error) {
    logError('Error updating meeting session upload:', error);
    res.status(500).json({ error: 'Failed to update meeting session' });
  }
});

app.post('/api/meeting-session/:roomId/ai-state', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;
    const aiStateData = req.body;
    
    let session = await MeetingSession.findOne({ roomId });
    if (!session) {
      session = new MeetingSession({ roomId });
    }
    
    session.updateAIState(aiStateData);
    await session.save();
    
    res.json(session);
  } catch (error) {
    logError('Error updating meeting session AI state:', error);
    res.status(500).json({ error: 'Failed to update meeting session' });
  }
});

app.post('/api/meeting-session/:roomId/chat', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;
    const messageData = req.body;
    
    let session = await MeetingSession.findOne({ roomId });
    if (!session) {
      session = new MeetingSession({ roomId });
    }
    
    session.addChatMessage(messageData);
    await session.save();
    
    res.json(session);
  } catch (error) {
    logError('Error updating meeting session chat:', error);
    res.status(500).json({ error: 'Failed to update meeting session' });
  }
});

// File Upload Endpoints with Cloudinary
app.post('/upload/image', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'image',
      folder: 'genaizoom/images',
    });
    res.json({ url: result.secure_url });
  } catch (err) {
    logError('Cloudinary image upload error', err);
    res.status(500).json({ error: 'Image upload failed' });
  }
});

app.post('/upload/audio', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'video', // Cloudinary uses 'video' for audio
      folder: 'genaizoom/audio',
    });
    res.json({ url: result.secure_url });
  } catch (err) {
    logError('Cloudinary audio upload error', err);
    res.status(500).json({ error: 'Audio upload failed' });
  }
});

// Pre-fetch ICE servers at startup
fetchIceServers().then(() => info('Initial ICE servers fetched'));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);

// Socket.IO Authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    info(`Socket auth error: No token for socket ${socket.id}`);
    return next(new Error('Authentication error: No token provided'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = { userId: decoded.userId, username: decoded.username, email: decoded.email };
    info(`Socket authenticated: ${socket.id} for user ${decoded.username}`);
    next();
  } catch (error) {
    logError(`Socket auth error: Invalid token for socket ${socket.id}`, error);
    next(new Error('Authentication error: Invalid token'));
  }
});

// Socket.IO Logic
const socketToRoom = {};
const socketIdToUsername = {};
const roomHosts = new Map();
io.on('connection', (socket) => {
  const { username, userId } = socket.user;
  info(`Socket connected: ${socket.id} for user ${username} (${userId})`);

  socket.on('join-room', async ({ roomId, username, isReconnect = false }, callback) => {
    if (!roomId) {
      socket.emit('error', { message: 'Invalid room ID' });
      info(`Join-room failed: Invalid room ID for ${username} (${socket.id})`);
      return;
    }
    
    socket.join(roomId);
    socketToRoom[socket.id] = roomId;
    socketIdToUsername[socket.id] = username;
    
    // Update meeting session
    try {
      await MeetingSession.findOneAndUpdate(
        { roomId },
        { 
          $set: { 
            [`activeParticipants.$[elem].socketId`]: socket.id,
            [`activeParticipants.$[elem].lastSeen`]: new Date(),
            [`activeParticipants.$[elem].isActive`]: true
          }
        },
        { 
          arrayFilters: [{ 'elem.userId': userId }],
          upsert: true,
          new: true
        }
      );
    } catch (err) {
      logError('Error updating meeting session:', err);
    }
    
    const room = io.sockets.adapter.rooms.get(roomId);
    const isFirst = room.size === 1;
    if (isFirst) {
      roomHosts.set(roomId, socket.id);
    }
    
    // Get other users from the room
    const otherUsers = [];
    room.forEach((id) => {
      if (id !== socket.id) {
        otherUsers.push({
          userId: id,
          username: socketIdToUsername[id],
          isHost: roomHosts.get(roomId) === id,
        });
      }
    });
    
    // If this is a reconnection, get the existing session data
    let sessionData = null;
    if (isReconnect) {
      try {
        const session = await MeetingSession.findOne({ roomId });
        if (session) {
          sessionData = {
            uploadedFiles: session.uploadedFiles,
            aiState: session.aiState,
            chatMessages: session.chatMessages.slice(-50), // Last 50 messages
          };
        }
      } catch (err) {
        logError('Error fetching session data for reconnection:', err);
      }
    }
    
    info(`User ${username} (${socket.id}) ${isReconnect ? 'reconnected to' : 'joined'} room ${roomId} with ${otherUsers.length} other users`);
    
    // Send session data if reconnecting
    if (isReconnect && sessionData) {
      socket.emit('session-restored', sessionData);
    }
    
    callback(otherUsers, sessionData);
    socket.to(roomId).emit('user-joined', { userId: socket.id, username, isHost: isFirst, isReconnect });
    
    if (otherUsers.length > 0) {
      try {
        Meeting.updateOne(
          { roomId },
          { $addToSet: { participants: socket.user.userId } }
        );
      } catch (err) {
        logError('Error adding participant to meeting', err);
      }
    }
  });

  socket.on('offer', (payload) => {
    if (!payload.to || !payload.offer) {
      socket.emit('error', { message: 'Invalid offer payload' });
      info(`Invalid offer from ${socketIdToUsername[socket.id]}: missing to or offer`);
      return;
    }
    info(`Relaying offer from ${socketIdToUsername[socket.id]} to ${socketIdToUsername[payload.to] || payload.to}`);
    io.to(payload.to).emit('offer', {
      from: socket.id,
      offer: payload.offer,
      username: socketIdToUsername[socket.id],
      isHost: roomHosts.get(socketToRoom[socket.id]) === socket.id,
    });
  });

  socket.on('answer', (payload) => {
    if (!payload.to || !payload.answer) {
      socket.emit('error', { message: 'Invalid answer payload' });
      info(`Invalid answer from ${socketIdToUsername[socket.id]}: missing to or answer`);
      return;
    }
    info(`Relaying answer from ${socketIdToUsername[socket.id]} to ${socketIdToUsername[payload.to] || payload.to}`);
    io.to(payload.to).emit('answer', { from: socket.id, answer: payload.answer });
  });

  socket.on('ice-candidate', (payload) => {
    if (!payload.to || !payload.candidate) {
      socket.emit('error', { message: 'Invalid ICE candidate payload' });
      info(`Invalid ICE candidate from ${socketIdToUsername[socket.id]}: missing to or candidate`);
      return;
    }
    info(`Relaying ICE candidate from ${socketIdToUsername[socket.id]} to ${socketIdToUsername[payload.to] || payload.to}`);
    io.to(payload.to).emit('ice-candidate', { from: socket.id, candidate: payload.candidate });
  });

  socket.on('send-chat-message', async (payload) => {
    const roomId = socketToRoom[socket.id];
    if (!roomId) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }
    if (!payload.message) {
      socket.emit('error', { message: 'Invalid message payload' });
      return;
    }
    
    // Persist chat message to meeting session
    try {
      await MeetingSession.findOneAndUpdate(
        { roomId },
        { 
          $push: { 
            chatMessages: {
              message: payload.message,
              username: payload.username,
              timestamp: payload.timestamp,
              userId: socket.user.userId
            }
          }
        },
        { upsert: true }
      );
    } catch (err) {
      logError('Error persisting chat message to session:', err);
    }
    
    info(`Broadcasting chat message from ${socketIdToUsername[socket.id]} in room ${roomId}`);
    socket.to(roomId).emit('chat-message', payload);
  });

  socket.on('pin-participant', ({ userId }) => {
    const roomId = socketToRoom[socket.id];
    if (!roomId) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }
    info(`Broadcasting pin-participant ${userId} from ${socketIdToUsername[socket.id]} in room ${roomId}`);
    socket.to(roomId).emit('pin-participant', { userId });
  });

  socket.on('unpin-participant', () => {
    const roomId = socketToRoom[socket.id];
    if (!roomId) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }
    info(`Broadcasting unpin-participant from ${socketIdToUsername[socket.id]} in room ${roomId}`);
    socket.to(roomId).emit('unpin-participant');
  });

  socket.on('screen-share-start', () => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting screen-share-start from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      socket.to(roomId).emit('screen-share-start', { userId: socket.id });
    }
  });

  socket.on('screen-share-stop', () => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting screen-share-stop from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      socket.to(roomId).emit('screen-share-stop', { userId: socket.id });
    }
  });

  socket.on('ai-image-uploaded', async ({ url, userId, username, filename, size }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting ai-image-uploaded from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      
      // Persist to meeting session
      try {
        await MeetingSession.findOneAndUpdate(
          { roomId },
          { 
            $push: { 
              uploadedFiles: {
                type: 'image',
                url,
                uploadedBy: userId,
                uploadedByUsername: username,
                filename,
                size
              }
            }
          },
          { upsert: true }
        );
      } catch (err) {
        logError('Error persisting image upload to session:', err);
      }
      
      socket.to(roomId).emit('ai-image-uploaded', { url, userId, username });
    }
  });

  socket.on('ai-audio-uploaded', async ({ url, userId, username, filename, size }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting ai-audio-uploaded from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      
      // Persist to meeting session
      try {
        await MeetingSession.findOneAndUpdate(
          { roomId },
          { 
            $push: { 
              uploadedFiles: {
                type: 'audio',
                url,
                uploadedBy: userId,
                uploadedByUsername: username,
                filename,
                size
              }
            }
          },
          { upsert: true }
        );
      } catch (err) {
        logError('Error persisting audio upload to session:', err);
      }
      
      socket.to(roomId).emit('ai-audio-uploaded', { url, userId, username });
    }
  });

  socket.on('ai-start-processing', async ({ userId, username }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting ai-start-processing from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      
      // Persist AI state to meeting session
      try {
        await MeetingSession.findOneAndUpdate(
          { roomId },
          { 
            $set: { 
              'aiState.isProcessing': true,
              'aiState.currentUploader': userId,
              'aiState.uploaderUsername': username,
              'aiState.startedAt': new Date(),
              'aiState.output': '' // Clear previous output
            }
          },
          { upsert: true }
        );
      } catch (err) {
        logError('Error persisting AI start state to session:', err);
      }
      
      socket.to(roomId).emit('ai-start-processing', { userId, username });
    }
  });

  socket.on('ai-finish-processing', async ({ response }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting ai-finish-processing from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      
      // Persist AI completion state to meeting session
      try {
        await MeetingSession.findOneAndUpdate(
          { roomId },
          { 
            $set: { 
              'aiState.isProcessing': false,
              'aiState.output': JSON.stringify(response),
              'aiState.completedAt': new Date(),
              'aiState.currentUploader': null,
              'aiState.uploaderUsername': null
            }
          },
          { upsert: true }
        );
      } catch (err) {
        logError('Error persisting AI finish state to session:', err);
      }
      
      socket.to(roomId).emit('ai-finish-processing', { response });
    }
  });

  socket.on('ai-bot-locked', async ({ userId, username, roomId }) => {
    if (roomId) {
      info(`Broadcasting ai-bot-locked from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      
      // Persist bot locked state to meeting session
      try {
        await MeetingSession.findOneAndUpdate(
          { roomId },
          { 
            $set: { 
              'aiState.isProcessing': false,
              'aiState.currentUploader': userId,
              'aiState.uploaderUsername': username,
              'aiState.startedAt': new Date()
            }
          },
          { upsert: true }
        );
      } catch (err) {
        logError('Error persisting AI bot locked state to session:', err);
      }
      
      socket.to(roomId).emit('ai-bot-locked', { userId, username });
    }
  });

  socket.on('ai-bot-unlocked', async ({ roomId }) => {
    if (roomId) {
      info(`Broadcasting ai-bot-unlocked from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      
      // Persist bot unlocked state to meeting session
      try {
        await MeetingSession.findOneAndUpdate(
          { roomId },
          { 
            $set: { 
              'aiState.currentUploader': null,
              'aiState.uploaderUsername': null
            }
          },
          { upsert: true }
        );
      } catch (err) {
        logError('Error persisting AI bot unlocked state to session:', err);
      }
      
      socket.to(roomId).emit('ai-bot-unlocked');
    }
  });

  socket.on('ai-audio-play', () => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting ai-audio-play from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      socket.to(roomId).emit('ai-audio-play');
    }
  });

  socket.on('ai-audio-pause', () => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting ai-audio-pause from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      socket.to(roomId).emit('ai-audio-pause');
    }
  });

  const drawingEvents = ['drawing-start', 'drawing-move', 'drawing-end', 'clear-canvas', 'draw-shape'];
  drawingEvents.forEach((event) => {
    socket.on(event, (data) => {
      const roomId = socketToRoom[socket.id];
      if (!roomId) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }
      const payload = { ...data, from: socket.id };
      info(`Broadcasting ${event} from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      socket.to(roomId).emit(event, payload);
    });
  });

  const handleDisconnect = async () => {
    const disconnectedUser = socketIdToUsername[socket.id] || 'A user';
    const roomId = socketToRoom[socket.id];
    info(`${disconnectedUser} (${socket.id}) disconnected from room ${roomId || 'none'}`);
    
    if (roomId) {
      // Don't immediately remove the user - they might be reconnecting
      // Just mark them as inactive in the session
      try {
        await MeetingSession.findOneAndUpdate(
          { roomId },
          { 
            $set: { 
              [`activeParticipants.$[elem].isActive`]: false,
              [`activeParticipants.$[elem].lastSeen`]: new Date()
            }
          },
          { 
            arrayFilters: [{ 'elem.socketId': socket.id }]
          }
        );
      } catch (err) {
        logError('Error updating participant status on disconnect:', err);
      }
      
      // Only emit user-left if they're not reconnecting within a reasonable time
      // We'll use a timeout to handle this
      setTimeout(async () => {
        try {
          const session = await MeetingSession.findOne({ roomId });
          if (session) {
            const participant = session.activeParticipants.find(p => p.socketId === socket.id);
            if (participant && !participant.isActive) {
              // Check if they've been inactive for more than 30 seconds
              const now = new Date();
              if (now - participant.lastSeen > 30000) {
                socket.to(roomId).emit('user-left', socket.id);
                
                // Clean up the session if no active participants
                const activeParticipants = session.activeParticipants.filter(p => p.isActive);
                if (activeParticipants.length === 0) {
                  try {
                    Meeting.updateOne({ roomId, endTime: { $exists: false } }, { endTime: new Date() });
                  } catch (err) {
                    logError('Error ending meeting', err);
                  }
                }
              }
            }
          }
        } catch (err) {
          logError('Error checking participant status after disconnect timeout:', err);
        }
      }, 30000); // 30 second timeout
    }
    
    delete socketToRoom[socket.id];
    delete socketIdToUsername[socket.id];
  };

  socket.on('leave-room', handleDisconnect);
  socket.on('disconnect', handleDisconnect);
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  logError(`Server error: ${err.message}`, err);
  res.status(500).json({ error: 'Internal server error' });
});

// Server Start
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  info(`Server running on port ${PORT}`);
});