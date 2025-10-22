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
const redis = require('redis'); // Added for distributed locking
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

// Redis Client Setup
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379', // Set REDIS_URL in Render
});
redisClient.on('error', (err) => logError('Redis Client Error', err));
redisClient.connect().then(() => info('Connected to Redis')).catch(err => logError('Redis Connection Error', err));

// App & Server Setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://genaizoom123.onrender.com', 'https://genaizoomserver-0yn4.onrender.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
  maxHttpBufferSize: 1e8, // 100MB buffer as fallback
});

// Multer Setup for Temporary File Storage
const upload = multer({ dest: 'tmp/' });

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
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));
app.use(express.json());
app.use(passport.initialize());

// JWT Authentication Middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach decoded user to req
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
        const profilePicture = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null;
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
          user.lastLogin = new Date();
          if (profilePicture && !user.profilePicture) {
            user.profilePicture = profilePicture;
          }
          await user.save();
        } else {
          user = new User({
            googleId: profile.id,
            email,
            username: profile.displayName,
            profilePicture,
          });
          await user.save();
        }
        const token = jwt.sign(
          { 
            userId: user._id.toString(),
            username: user.username, 
            email: user.email,
            profilePicture: user.profilePicture 
          },
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

// Optimized ICE Server Caching with Fast Fallback
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN 
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) 
  : null;

let cachedIceServers = null;
let iceServersExpiry = null;
let isFetchingIceServers = false;

const fastFallbackIceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayprojectsecret',
  },
  {
    urls: 'turns:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayprojectsecret',
  },
];

const fetchIceServers = async () => {
  if (isFetchingIceServers) {
    return cachedIceServers || fastFallbackIceServers;
  }

  try {
    isFetchingIceServers = true;
    let iceServers = [...fastFallbackIceServers];

    if (twilioClient) {
      try {
        const tokenPromise = twilioClient.tokens.create();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Twilio timeout')), 3000)
        );
        
        const token = await Promise.race([tokenPromise, timeoutPromise]);
        iceServers = [...token.iceServers, ...fastFallbackIceServers];
        info('Fetched Twilio ICE servers');
      } catch (error) {
        info('Twilio ICE servers timeout/error, using fallback');
      }
    }

    cachedIceServers = iceServers;
    iceServersExpiry = Date.now() + 12 * 60 * 60 * 1000;
    info('Cached optimized ICE servers:', iceServers.map(s => s.urls));
    return iceServers;
  } catch (error) {
    logError('ICE server fetch error', error);
    return fastFallbackIceServers;
  } finally {
    isFetchingIceServers = false;
  }
};

app.get('/ice-servers', async (req, res) => {
  try {
    if (cachedIceServers && iceServersExpiry && Date.now() < iceServersExpiry) {
      res.json(cachedIceServers);
      return;
    }

    res.json(fastFallbackIceServers);
    
    if (!isFetchingIceServers) {
      fetchIceServers().catch(err => logError('Background ICE server refresh failed', err));
    }
  } catch (error) {
    logError('ICE servers endpoint error', error);
    res.json(fastFallbackIceServers);
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

// AI Lock Endpoint with Redis
const LOCK_TIMEOUT = 300000; // 5 minutes
const AI_LOCK_KEY = (roomId) => `ai-lock:${roomId}`;

app.post('/api/ai/lock/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.userId.toString();
    const username = req.body.username || req.user.username;
    info(`AI Lock attempt for room ${roomId} by userId: ${userId} (username: ${username})`);

    let session = await MeetingSession.findOne({ roomId });
    if (!session) {
      session = new MeetingSession({ roomId });
      await session.save();
    }

    // Check Redis lock
    const lockAcquired = await redisClient.set(AI_LOCK_KEY(roomId), userId, {
      NX: true, // Only set if not exists
      PX: LOCK_TIMEOUT // Expire after 5 minutes
    });

    if (!lockAcquired) {
      info(`AI already locked for room ${roomId}`);
      return res.status(409).json({ error: 'AI Bot is already in use by another user' });
    }

    // Check MongoDB session lock
    if (session.aiState?.isLocked && session.aiState.lockedBy !== userId) {
      await redisClient.del(AI_LOCK_KEY(roomId)); // Release Redis lock to stay consistent
      info(`MongoDB lock mismatch for room ${roomId}: lockedBy=${session.aiState.lockedBy}, userId=${userId}`);
      return res.status(409).json({ error: 'AI Bot is already in use by another user' });
    }

    // Set lock state
    session.aiState = {
      ...(session.aiState || {}),
      isLocked: true,
      lockedBy: userId,
      lockedByUsername: username,
      lockedAt: new Date(),
      isProcessing: true
    };
    await session.save();

    info(`AI locked for room ${roomId} by ${username}`);
    io.to(roomId).emit('ai-bot-locked', { userId, username, roomId });

    res.json({ success: true, message: 'AI bot locked' });
  } catch (error) {
    logError('Error locking AI:', error);
    await redisClient.del(AI_LOCK_KEY(req.params.roomId)); // Release on error
    res.status(500).json({ error: 'Failed to lock AI' });
  }
});

// AI Unlock Endpoint with Redis
app.post('/api/ai/unlock/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.userId.toString();
    info(`AI Unlock attempt for room ${roomId} by userId: ${userId}`);

    let session = await MeetingSession.findOne({ roomId });
    if (!session) {
      info(`Session not found for room ${roomId}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check if AI is locked
    if (!session.aiState?.isLocked) {
      info(`AI not locked for room ${roomId}`);
      return res.status(400).json({ error: 'AI is not locked' });
    }

    // Verify user is the locker
    if (session.aiState.lockedBy !== userId) {
      info(`Lock mismatch for room ${roomId}: lockedBy=${session.aiState.lockedBy}, userId=${userId}`);
      return res.status(403).json({ error: 'Not authorized to unlock AI - lock mismatch' });
    }

    // Verify Redis lock
    const lockValue = await redisClient.get(AI_LOCK_KEY(roomId));
    if (lockValue !== userId) {
      info(`Redis lock mismatch for room ${roomId}: lockValue=${lockValue}, userId=${userId}`);
      return res.status(403).json({ error: 'Not authorized to unlock AI - Redis lock mismatch' });
    }

    // Release Redis lock
    await redisClient.del(AI_LOCK_KEY(roomId));

    // Clear lock state
    session.aiState = {
      ...(session.aiState || {}),
      isLocked: false,
      lockedBy: null,
      lockedByUsername: null,
      lockedAt: null,
      isProcessing: false
    };
    await session.save();

    info(`AI unlocked for room ${roomId} by ${userId}`);
    io.to(roomId).emit('ai-bot-unlocked', { roomId });

    res.json({ success: true, message: 'AI bot unlocked' });
  } catch (error) {
    logError('Error unlocking AI:', error);
    res.status(500).json({ error: 'Failed to unlock AI' });
  }
});

// Auto-release Expired Locks
setInterval(async () => {
  try {
    const keys = await redisClient.keys('ai-lock:*');
    for (const key of keys) {
      const roomId = key.split(':')[1];
      const lockValue = await redisClient.get(key);
      if (lockValue) {
        // If lock exists, TTL is handled by Redis PX (5 minutes)
        // Optionally, check MongoDB consistency
        const session = await MeetingSession.findOne({ roomId });
        if (session && session.aiState?.isLocked && session.aiState.lockedBy === lockValue) {
          const lockTime = new Date(session.aiState.lockedAt).getTime();
          if (Date.now() - lockTime > LOCK_TIMEOUT) {
            info(`Auto-releasing expired lock for room ${roomId}`);
            session.aiState = {
              ...(session.aiState || {}),
              isLocked: false,
              lockedBy: null,
              lockedByUsername: null,
              lockedAt: null,
              isProcessing: false
            };
            await session.save();
            await redisClient.del(key);
            io.to(roomId).emit('ai-bot-unlocked', { roomId });
          }
        }
      }
    }
  } catch (error) {
    logError('Error in lock cleanup:', error);
  }
}, 60000); // Run every minute

// File Upload Endpoints with Cloudinary
app.post('/upload/image', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'image',
      folder: 'genaizoom/images',
    });
    fs.unlinkSync(req.file.path);
    res.json({ url: result.secure_url });
  } catch (err) {
    logError('Cloudinary image upload error', err);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Image upload failed' });
  }
});

app.post('/upload/audio', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'video',
      folder: 'genaizoom/audio',
    });
    fs.unlinkSync(req.file.path);
    res.json({ url: result.secure_url });
  } catch (err) {
    logError('Cloudinary audio upload error', err);
    if (req.file) fs.unlinkSync(req.file.path);
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
    socket.user = { 
      userId: decoded.userId.toString(),
      username: decoded.username, 
      email: decoded.email,
      profilePicture: decoded.profilePicture 
    };
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
  const { username, userId, profilePicture } = socket.user;
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
    
    try {
      let session = await MeetingSession.findOne({ roomId });
      if (!session) {
        session = new MeetingSession({ roomId });
        session.activeParticipants = [];
      }

      const participantIndex = session.activeParticipants.findIndex(p => p.userId.toString() === userId.toString());
      if (participantIndex === -1) {
        session.activeParticipants.push({
          userId,
          username,
          socketId: socket.id,
          lastSeen: new Date(),
          isActive: true
        });
      } else {
        session.activeParticipants[participantIndex] = {
          ...session.activeParticipants[participantIndex],
          socketId: socket.id,
          lastSeen: new Date(),
          isActive: true
        };
      }

      await session.save();
      info(`Updated participant ${username} in session for room ${roomId}`);
    } catch (err) {
      logError('Error updating meeting session:', err);
    }
    
    const room = io.sockets.adapter.rooms.get(roomId);
    const isFirst = room.size === 1;
    if (isFirst) {
      roomHosts.set(roomId, socket.id);
    }
    
    const otherUsers = [];
    room.forEach((id) => {
      if (id !== socket.id) {
        const remoteSocket = io.sockets.sockets.get(id);
        const remoteUser = remoteSocket ? remoteSocket.user : { username: socketIdToUsername[id], profilePicture: null };
        otherUsers.push({
          userId: id,
          username: remoteUser.username || socketIdToUsername[id],
          profilePicture: remoteUser.profilePicture,
          isHost: roomHosts.get(roomId) === id,
        });
      }
    });
    
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
      logError('Error fetching session data:', err);
    }
    
    info(`User ${username} (${socket.id}) ${isReconnect ? 'reconnected to' : 'joined'} room ${roomId} with ${otherUsers.length} other users`);
    
    if (sessionData) {
      socket.emit('session-restored', sessionData);
    }
    
    callback(otherUsers, sessionData);
    if (!isReconnect) {
      socket.to(roomId).emit('user-joined', { 
        userId: socket.id, 
        username, 
        profilePicture,
        isHost: isFirst, 
        isReconnect: false 
      });
    }
    
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

  socket.on('toggle-video', ({ enabled }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting toggle-video ${enabled ? 'on' : 'off'} from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      socket.to(roomId).emit('toggle-video', { userId: socket.id, enabled });
    }
  });

  socket.on('toggle-audio', ({ enabled }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting toggle-audio ${enabled ? 'on' : 'off'} from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      socket.to(roomId).emit('toggle-audio', { userId: socket.id, enabled });
    }
  });

  socket.on('ai-image-uploaded', async ({ url, userId, username, filename, size }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting ai-image-uploaded from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      
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
      
      try {
        await MeetingSession.findOneAndUpdate(
          { roomId },
          { 
            $set: { 
              'aiState.isProcessing': true,
              'aiState.currentUploader': userId,
              'aiState.uploaderUsername': username,
              'aiState.startedAt': new Date(),
              'aiState.output': ''
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
      
      try {
        await MeetingSession.findOneAndUpdate(
          { roomId },
          { 
            $set: { 
              'aiState.isProcessing': false,
              'aiState.output': typeof response === 'string' ? response : JSON.stringify(response),
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

  socket.on('upload-notification', ({ username }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting upload-notification from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      socket.to(roomId).emit('upload-notification', { username });
    }
  });

  socket.on('shared-media-display', ({ imageUrl, audioUrl, username }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting shared-media-display from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      
      try {
        MeetingSession.findOneAndUpdate(
          { roomId },
          { 
            $set: { 
              'sharedMedia.imageUrl': imageUrl,
              'sharedMedia.audioUrl': audioUrl,
              'sharedMedia.uploaderUsername': username,
              'sharedMedia.isDisplayed': true,
              'sharedMedia.displayedAt': new Date()
            }
          },
          { upsert: true }
        );
      } catch (err) {
        logError('Error persisting shared media display to session:', err);
      }
      
      socket.to(roomId).emit('shared-media-display', { imageUrl, audioUrl, username });
    }
  });

  socket.on('shared-media-removal', ({ username }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting shared-media-removal from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      
      try {
        MeetingSession.findOneAndUpdate(
          { roomId },
          { 
            $set: { 
              'sharedMedia.imageUrl': null,
              'sharedMedia.audioUrl': null,
              'sharedMedia.uploaderUsername': null,
              'sharedMedia.isDisplayed': false,
              'sharedMedia.removedAt': new Date()
            }
          },
          { upsert: true }
        );
      } catch (err) {
        logError('Error clearing shared media from session:', err);
      }
      
      socket.to(roomId).emit('shared-media-removal', { username });
    }
  });

  socket.on('ai-processing-notification', ({ username }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting ai-processing-notification from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      socket.to(roomId).emit('ai-processing-notification', { username });
    }
  });

  socket.on('shared-ai-result', ({ response, username }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting shared-ai-result from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      
      try {
        MeetingSession.findOneAndUpdate(
          { roomId },
          { 
            $set: { 
              'aiState.output': typeof response === 'string' ? response : JSON.stringify(response),
              'aiState.completedAt': new Date(),
              'aiState.resultUsername': username
            }
          },
          { upsert: true }
        );
      } catch (err) {
        logError('Error persisting shared AI result to session:', err);
      }
      
      socket.to(roomId).emit('shared-ai-result', { response, username });
    }
  });

  socket.on('media-display', () => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting media-display from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      socket.to(roomId).emit('media-display', { userId: socket.id, username: socketIdToUsername[socket.id] });
    }
  });

  socket.on('media-remove', () => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting media-remove from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      socket.to(roomId).emit('media-remove', { userId: socket.id, username: socketIdToUsername[socket.id] });
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
      try {
        let session = await MeetingSession.findOne({ roomId });
        if (session) {
          const participantIndex = session.activeParticipants.findIndex(p => p.socketId === socket.id);
          if (participantIndex !== -1) {
            session.activeParticipants[participantIndex].isActive = false;
            session.activeParticipants[participantIndex].lastSeen = new Date();
            await session.save();
          }

          // Release AI lock if user was the locker
          if (session.aiState?.isLocked && session.aiState.lockedBy === socket.user.userId.toString()) {
            const lockValue = await redisClient.get(AI_LOCK_KEY(roomId));
            if (lockValue === socket.user.userId.toString()) {
              info(`Releasing AI lock for room ${roomId} due to user ${disconnectedUser} disconnect`);
              await redisClient.del(AI_LOCK_KEY(roomId));
              session.aiState = {
                ...(session.aiState || {}),
                isLocked: false,
                lockedBy: null,
                lockedByUsername: null,
                lockedAt: null,
                isProcessing: false
              };
              await session.save();
              io.to(roomId).emit('ai-bot-unlocked', { roomId });
            }
          }
        }
      } catch (err) {
        logError('Error updating participant or AI lock on disconnect:', err);
      }
      
      setTimeout(async () => {
        try {
          const session = await MeetingSession.findOne({ roomId });
          if (session) {
            const participant = session.activeParticipants.find(p => p.socketId === socket.id);
            if (participant && !participant.isActive) {
              const now = new Date();
              if (now - participant.lastSeen > 30000) {
                const username = socketIdToUsername[socket.id] || 'Unknown User';
                socket.to(roomId).emit('user-left', { userId: socket.id, username });
                
                const activeParticipants = session.activeParticipants.filter(p => p.isActive);
                if (activeParticipants.length === 0) {
                  try {
                    Meeting.updateOne({ roomId, endTime: { $exists: false } }, { endTime: new Date() });
                    await MeetingSession.deleteOne({ roomId });
                    info(`Room ${roomId} is empty. Deleted MeetingSession.`);
                  } catch (err) {
                    logError('Error ending meeting or deleting session', err);
                  }
                }
              }
            }
          }
        } catch (err) {
          logError('Error checking participant status after disconnect timeout:', err);
        }
      }, 30000);
    }
    
    delete socketToRoom[socket.id];
    delete socketIdToUsername[socket.id];
  };

  socket.on('leave-room', async () => {
    const disconnectedUser = socketIdToUsername[socket.id] || 'A user';
    const roomId = socketToRoom[socket.id];
    const username = socketIdToUsername[socket.id] || 'Unknown User';
    info(`${disconnectedUser} (${socket.id}) requested to leave room ${roomId || 'none'}`);

    if (roomId) {
      try {
        let session = await MeetingSession.findOne({ roomId });
        if (session) {
          const participantIndex = session.activeParticipants.findIndex(p => p.socketId === socket.id);
          if (participantIndex !== -1) {
            session.activeParticipants[participantIndex].isActive = false;
            session.activeParticipants[participantIndex].lastSeen = new Date();
            await session.save();
          }

          // Release AI lock if user was the locker
          if (session.aiState?.isLocked && session.aiState.lockedBy === socket.user.userId.toString()) {
            const lockValue = await redisClient.get(AI_LOCK_KEY(roomId));
            if (lockValue === socket.user.userId.toString()) {
              info(`Releasing AI lock for room ${roomId} due to user ${disconnectedUser} leaving`);
              await redisClient.del(AI_LOCK_KEY(roomId));
              session.aiState = {
                ...(session.aiState || {}),
                isLocked: false,
                lockedBy: null,
                lockedByUsername: null,
                lockedAt: null,
                isProcessing: false
              };
              await session.save();
              io.to(roomId).emit('ai-bot-unlocked', { roomId });
            }
          }
        }
      } catch (err) {
        logError('Error updating participant or AI lock on leave-room:', err);
      }

      socket.leave(roomId);
      socket.to(roomId).emit('user-left', { userId: socket.id, username });

      const room = io.sockets.adapter.rooms.get(roomId);
      const roomSize = room ? room.size : 0;
      if (roomSize === 0) {
        try {
          info(`Room ${roomId} is now empty. Deleting MeetingSession...`);
          await MeetingSession.deleteOne({ roomId });
        } catch (err) {
          logError('Error deleting MeetingSession on empty room (leave-room):', err);
        }
      }
    }

    delete socketToRoom[socket.id];
    delete socketIdToUsername[socket.id];
  });
  socket.on('disconnect', handleDisconnect);
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  logError(`Server error: ${err.message}`, err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 Handler with Logging
app.use((req, res) => {
  logError(`404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Route not found' });
});

// Server Start
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  info(`Server running on port ${PORT}`);
});