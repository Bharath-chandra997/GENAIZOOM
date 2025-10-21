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
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const meetingRoutes = require('./routes/meetings');
const { info, logError } = require('./utils/logger');
const User = require('./models/User');
const Meeting = require('./models/Meeting');
const MeetingSession = require('./models/MeetingSession');

// ==================== ENVIRONMENT VALIDATION ====================

if (!process.env.JWT_SECRET) {
  logError('FATAL ERROR: JWT_SECRET is not defined.');
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  logError('FATAL ERROR: MONGO_URI is not defined.');
  process.exit(1);
}
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  logError('FATAL ERROR: Google OAuth credentials not defined.');
  process.exit(1);
}
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  logError('FATAL ERROR: Cloudinary credentials not defined.');
  process.exit(1);
}

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  info('WARNING: Twilio credentials not found. Using fallback STUN/TURN servers.');
}

// ==================== APP & SERVER SETUP ====================

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'https://genaizoom123.onrender.com',
      'https://genaizoomserver-0yn4.onrender.com',
      'http://localhost:3000'
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Multer: Secure temp storage
const upload = multer({
  dest: 'tmp/',
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/', 'audio/', 'video/'].some(type => file.mimetype.startsWith(type));
    cb(null, allowed);
  }
});

// Ensure tmp directory
if (!fs.existsSync('tmp')) fs.mkdirSync('tmp', { recursive: true });

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ==================== MIDDLEWARE ====================

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin: [
    'https://genaizoom123.onrender.com',
    'https://genaizoomserver-0yn4.onrender.com',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT'],
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(passport.initialize());

// JWT Auth
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    logError('JWT verification failed', err);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==================== DATABASE ====================

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
})
  .then(() => info('MongoDB Connected'))
  .catch(err => {
    logError('MongoDB Connection Failed', err);
    process.exit(1);
  });

// ==================== GOOGLE OAUTH ====================

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
            profilePicture: profile.photos?.[0]?.value || null,
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

// ==================== ICE SERVERS (FIXED & OPTIMIZED) ====================

const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

let cachedIceServers = null;
let iceServersExpiry = null;
let isFetchingIceServers = false;

// CORRECTED: Use staticauth.openrelay.metered.ca
const fastFallbackIceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:staticauth.openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayprojectsecret',
  },
  {
    urls: 'turns:staticauth.openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayprojectsecret',
  },
  {
    urls: 'turn:staticauth.openrelay.metered.ca:80?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayprojectsecret',
  },
];

const fetchIceServers = async () => {
  if (isFetchingIceServers) return cachedIceServers || fastFallbackIceServers;

  try {
    isFetchingIceServers = true;
    let iceServers = [...fastFallbackIceServers];

    if (twilioClient) {
      try {
        const token = await Promise.race([
          twilioClient.tokens.create(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
        iceServers = [...token.iceServers, ...fastFallbackIceServers];
        info('Twilio ICE servers fetched');
      } catch (e) {
        info('Twilio ICE fetch failed, using fallback');
      }
    }

    cachedIceServers = iceServers;
    iceServersExpiry = Date.now() + 12 * 60 * 60 * 1000;
    info(`ICE servers cached: ${iceServers.length} servers`);
    return iceServers;
  } catch (error) {
    logError('ICE fetch error', error);
    return fastFallbackIceServers;
  } finally {
    isFetchingIceServers = false;
  }
};

// ICE Endpoint: Immediate response + background refresh
app.get('/ice-servers', async (req, res) => {
  try {
    if (cachedIceServers && iceServersExpiry && Date.now() < iceServersExpiry) {
      return res.json(cachedIceServers);
    }
    res.json(fastFallbackIceServers);
    if (!isFetchingIceServers) fetchIceServers().catch(() => {});
  } catch (error) {
    logError('ICE endpoint error', error);
    res.json(fastFallbackIceServers);
  }
});

// Pre-fetch
fetchIceServers().then(() => info('Initial ICE servers loaded'));

// ==================== MEETING SESSION ENDPOINTS ====================

const sessionEndpoint = (method, path, handler) => {
  app[method](path, authenticate, async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      logError(`Session endpoint ${path} error:`, error);
      res.status(500).json({ error: 'Server error' });
    }
  });
};

sessionEndpoint('get', '/api/meeting-session/:roomId', async (req, res) => {
  const { roomId } = req.params;
  const session = await MeetingSession.findOne({ roomId });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

sessionEndpoint('post', '/api/meeting-session/:roomId/participant', async (req, res) => {
  const { roomId } = req.params;
  const { userId, username, socketId } = req.body;
  let session = await MeetingSession.findOne({ roomId }) || new MeetingSession({ roomId });
  session.addParticipant(userId, username, socketId);
  await session.save();
  res.json(session);
});

sessionEndpoint('post', '/api/meeting-session/:roomId/upload', async (req, res) => {
  const { roomId } = req.params;
  const data = req.body;
  let session = await MeetingSession.findOne({ roomId }) || new MeetingSession({ roomId });
  session.addUploadedFile(data);
  await session.save();
  res.json(session);
});

sessionEndpoint('post', '/api/meeting-session/:roomId/ai-state', async (req, res) => {
  const { roomId } = req.params;
  const aiStateData = req.body;
  let session = await MeetingSession.findOne({ roomId }) || new MeetingSession({ roomId });
  session.updateAIState(aiStateData);
  await session.save();
  res.json(session);
});

sessionEndpoint('post', '/api/meeting-session/:roomId/chat', async (req, res) => {
  const { roomId } = req.params;
  const messageData = req.body;
  let session = await MeetingSession.findOne({ roomId }) || new MeetingSession({ roomId });
  session.addChatMessage(messageData);
  await session.save();
  res.json(session);
});

// ==================== FILE UPLOADS ====================

app.post('/upload/image', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  try {
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'image',
      folder: 'genaizoom/images',
      transformation: [{ width: 1200, crop: 'limit' }, { quality: 'auto:good' }]
    });
    fs.unlink(req.file.path, () => {});
    res.json({ url: result.secure_url });
  } catch (err) {
    logError('Image upload failed', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.post('/upload/audio', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  try {
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'video',
      folder: 'genaizoom/audio',
    });
    fs.unlink(req.file.path, () => {});
    res.json({ url: result.secure_url });
  } catch (err) {
    logError('Audio upload failed', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ==================== ROUTES ====================

app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ==================== SOCKET.IO ====================

const socketToRoom = {};
const socketIdToUsername = {};
const roomHosts = new Map();
const disconnectTimeouts = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = { userId: decoded.userId, username: decoded.username, email: decoded.email };
    info(`Socket auth: ${socket.id} to ${decoded.username}`);
    next();
  } catch (error) {
    logError('Socket auth failed', error);
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const { username, userId } = socket.user;
  info(`Connected: ${username} (${socket.id})`);

  const cleanupDisconnect = () => {
    const roomId = socketToRoom[socket.id];
    if (!roomId) return;

    // Mark inactive
    MeetingSession.updateOne(
      { roomId, 'activeParticipants.socketId': socket.id },
      { $set: { 'activeParticipants.$.isActive': false, 'activeParticipants.$.lastSeen': new Date() } }
    ).catch(() => {});

    // Delayed removal
    const timeout = setTimeout(async () => {
      const session = await MeetingSession.findOne({ roomId });
      const participant = session?.activeParticipants.find(p => p.socketId === socket.id);
      if (participant && !participant.isActive && (Date.now() - participant.lastSeen > 30000)) {
        io.to(roomId).emit('user-left', { userId: socket.id });
        if (session.activeParticipants.filter(p => p.isActive).length === 0) {
          await MeetingSession.deleteOne({ roomId });
        }
      }
    }, 30000);

    disconnectTimeouts.set(socket.id, timeout);
  };

  socket.on('join-room', async ({ roomId, username, isReconnect = false }, callback) => {
    if (!roomId) return socket.emit('error', { message: 'Invalid room ID' });

    socket.join(roomId);
    socketToRoom[socket.id] = roomId;
    socketIdToUsername[socket.id] = username;

    // Clear any pending disconnect
    clearTimeout(disconnectTimeouts.get(socket.id));
    disconnectTimeouts.delete(socket.id);

    // Update session
    await MeetingSession.findOneAndUpdate(
      { roomId },
      {
        $set: {
          'activeParticipants.$[elem].socketId': socket.id,
          'activeParticipants.$[elem].lastSeen': new Date(),
          'activeParticipants.$[elem].isActive': true
        }
      },
      { arrayFilters: [{ 'elem.userId': userId }], upsert: true }
    );

    const room = io.sockets.adapter.rooms.get(roomId) || new Set();
    const isFirst = room.size === 1;
    if (isFirst) roomHosts.set(roomId, socket.id);

    const otherUsers = Array.from(room)
      .filter(id => id !== socket.id)
      .map(id => ({
        userId: id,
        username: socketIdToUsername[id],
        isHost: roomHosts.get(roomId) === id,
      }));

    let sessionData = null;
    try {
      const session = await MeetingSession.findOne({ roomId });
      if (session) {
        sessionData = {
          uploadedFiles: session.uploadedFiles,
          aiState: session.aiState,
          sharedMedia: session.sharedMedia,
          chatMessages: session.chatMessages.slice(-50),
        };
      }
    } catch (err) {
      logError('Session fetch error', err);
    }

    info(`${username} ${isReconnect ? 'reconnected' : 'joined'} ${roomId}`);
    if (sessionData) socket.emit('session-restored', sessionData);
    callback?.(otherUsers, sessionData);
    socket.to(roomId).emit('user-joined', { userId: socket.id, username, isHost: isFirst, isReconnect });
  });

  // WebRTC Signaling
  ['offer', 'answer', 'ice-candidate'].forEach(event => {
    socket.on(event, (payload) => {
      if (!payload?.to) return;
      io.to(payload.to).emit(event, { from: socket.id, ...payload });
    });
  });

  // Broadcast events
  const broadcastEvents = [
    'send-chat-message', 'pin-participant', 'unpin-participant',
    'screen-share-start', 'screen-share-stop', 'ai-image-uploaded',
    'ai-audio-uploaded', 'ai-start-processing', 'ai-finish-processing',
    'ai-bot-locked', 'ai-bot-unlocked', 'ai-audio-play', 'ai-audio-pause',
    'upload-notification', 'shared-media-display', 'shared-media-removal',
    'ai-processing-notification', 'shared-ai-result', 'media-display', 'media-remove'
  ];

  broadcastEvents.forEach(event => {
    socket.on(event, async (data) => {
      const roomId = socketToRoom[socket.id];
      if (!roomId) return;

      // Persist where needed
      if (['send-chat-message', 'ai-image-uploaded', 'ai-audio-uploaded', 'shared-media-display', 'shared-ai-result'].includes(event)) {
        try {
          const update = {};
          if (event === 'send-chat-message') update.$push = { chatMessages: data };
          if (event === 'ai-image-uploaded') update.$push = { uploadedFiles: { type: 'image', ...data } };
          if (event === 'ai-audio-uploaded') update.$push = { uploadedFiles: { type: 'audio', ...data } };
          if (event === 'shared-media-display') update.$set = { sharedMedia: { ...data, isDisplayed: true, displayedAt: new Date() } };
          if (event === 'shared-ai-result') update.$set = { 'aiState.output': data.response, 'aiState.completedAt': new Date() };

          if (Object.keys(update).length > 0) {
            await MeetingSession.updateOne({ roomId }, update, { upsert: true });
          }
        } catch (err) {
          logError(`Persist ${event} failed`, err);
        }
      }

      socket.to(roomId).emit(event, { ...data, from: socket.id });
    });
  });

  // Drawing
  ['drawing-start', 'drawing-move', 'drawing-end', 'clear-canvas', 'draw-shape'].forEach(event => {
    socket.on(event, (data) => {
      const roomId = socketToRoom[socket.id];
      if (roomId) socket.to(roomId).emit(event, { ...data, from: socket.id });
    });
  });

  socket.on('leave-room', async () => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      await MeetingSession.updateOne(
        { roomId, 'activeParticipants.socketId': socket.id },
        { $set: { 'activeParticipants.$.isActive': false, 'activeParticipants.$.lastSeen': new Date() } }
      );
      socket.leave(roomId);
      socket.to(roomId).emit('user-left', { userId: socket.id });

      const room = io.sockets.adapter.rooms.get(roomId);
      if (!room || room.size === 0) {
        await MeetingSession.deleteOne({ roomId });
      }
    }
    delete socketToRoom[socket.id];
    delete socketIdToUsername[socket.id];
  });

  socket.on('disconnect', cleanupDisconnect);
});

// ==================== ERROR & START ====================

app.use((err, req, res, next) => {
  logError('Unhandled error', err);
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  info(`Server running on port ${PORT}`);
  info(`Mode: ${process.env.NODE_ENV || 'development'}`);
});