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
const axios = require('axios');
require('dotenv').config();
const authRoutes = require('./routes/auth');
const meetingRoutes = require('./routes/meetings');
const feedbackRoutes = require('./routes/feedback');
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
if (!process.env.FASTAPI_KEY) {
  logError('FATAL ERROR: FASTAPI_KEY is not defined.');
  process.exit(1);
}

// FastAPI Server URL and Key
const API_URL = 'https://unesteemed-trochaically-wilhelmina.ngrok-free.dev/predict';
const API_KEY = process.env.FASTAPI_KEY; // Should be set to 'genaizoom' in .env

// App & Server Setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://genaizoom123.onrender.com', 'https://genaizoomserver-0yn4.onrender.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
  maxHttpBufferSize: 1e8,
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
    req.user = decoded;
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

// Optimized ICE Server Caching
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
    urls: 'turn:openrelay.metered.ca:443',
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

// Handle GET /predict to return clear error
app.get('/predict', (req, res) => {
  logError('GET request not allowed for /predict');
  res.status(405).json({ error: 'Method Not Allowed: Use POST for /predict' });
});

// FastAPI /predict Endpoint
app.post('/predict', authenticate, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), async (req, res) => {
  try {
    const imageFile = req.files?.image?.[0];
    const audioFile = req.files?.audio?.[0];

    if (!imageFile || !audioFile) {
      logError('Missing image or audio file in /predict');
      return res.status(400).json({ error: 'Both image and audio files are required' });
    }

    // Validate file types
    const validImageTypes = ['image/jpeg', 'image/png'];
    const validAudioTypes = ['audio/mpeg', 'audio/wav'];
    if (!validImageTypes.includes(imageFile.mimetype)) {
      return res.status(400).json({ error: 'Invalid image format. Only JPEG/PNG allowed.' });
    }
    if (!validAudioTypes.includes(audioFile.mimetype)) {
      return res.status(400).json({ error: 'Invalid audio format. Only MP3/WAV allowed.' });
    }

    // Prepare FormData for FastAPI
    const FormData = require('form-data');
    const form = new FormData();
    form.append('image', fs.createReadStream(imageFile.path), {
      filename: imageFile.originalname,
      contentType: imageFile.mimetype,
    });
    form.append('audio', fs.createReadStream(audioFile.path), {
      filename: audioFile.originalname,
      contentType: audioFile.mimetype,
    });

    info(`Calling FastAPI server for user ${req.user.username} with files: ${imageFile.originalname}, ${audioFile.originalname}`);
    const response = await axios.post(API_URL, form, {
      headers: {
        'x-api-key': API_KEY,
        ...form.getHeaders(),
      },
      timeout: 30000,
    });

    // Handle FastAPI response
    const prediction = response.data.prediction || response.data.result || response.data || 'No response from FastAPI server';

    if (!prediction || (typeof prediction === 'string' && prediction.trim() === '')) {
      logError('Empty or invalid prediction from FastAPI server', { response: response.data });
      return res.status(500).json({ error: 'No valid prediction received from FastAPI server' });
    }

    info(`FastAPI prediction: ${typeof prediction === 'string' ? prediction.substring(0, 100) : JSON.stringify(prediction).substring(0, 100)}...`);
    res.json({ prediction });

  } catch (error) {
    if (error.response) {
      logError(`FastAPI error: ${error.response.status} - ${JSON.stringify(error.response.data)}`, error);
      return res.status(500).json({ error: `Failed to process AI request: ${error.response.data.error || error.message}` });
    }
    logError('Error in /predict:', error);
    res.status(500).json({ error: `Failed to process AI request: ${error.message}` });
  } finally {
    // Clean up temporary files
    if (req.files?.image?.[0]) fs.unlinkSync(req.files.image[0].path);
    if (req.files?.audio?.[0]) fs.unlinkSync(req.files.audio[0].path);
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

// AI Lock Endpoint
app.post('/api/ai/lock/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username } = req.body;
    const userId = req.user.userId.toString();

    info(`AI Lock attempt for room ${roomId} by userId: ${userId}`);

    let session = await MeetingSession.findOne({ roomId });
    if (!session) {
      session = new MeetingSession({ roomId });
    }

    // Check if already locked by someone else
    if (session.aiState?.isLocked && session.aiState.lockedBy !== userId) {
      return res.status(409).json({ error: 'AI Bot is already in use by another user' });
    }

    // Set lock state
    session.aiState = {
      ...(session.aiState || {}),
      isLocked: true,
      lockedBy: userId,
      lockedByUsername: username || req.user.username,
      lockedAt: new Date(),
      isProcessing: true
    };
    await session.save();

    info(`AI locked for room ${roomId} by ${req.user.username || username}`);

    // Broadcast to room
    io.to(roomId).emit('ai-bot-locked', { userId, username: req.user.username || username, roomId });

    res.json({ success: true, message: 'AI bot locked' });
  } catch (error) {
    logError('Error locking AI:', error);
    res.status(500).json({ error: 'Failed to lock AI' });
  }
});

// AI Unlock Endpoint
app.post('/api/ai/unlock/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.userId.toString();

    info(`AI Unlock attempt for room ${roomId} by userId: ${userId}`);

    let session = await MeetingSession.findOne({ roomId });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify user is the locker
    if (session.aiState?.lockedBy !== userId) {
      return res.status(403).json({ error: 'Not authorized to unlock AI' });
    }

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

    // Broadcast to room
    io.to(roomId).emit('ai-bot-unlocked', { roomId });

    res.json({ success: true, message: 'AI bot unlocked' });
  } catch (error) {
    logError('Error unlocking AI:', error);
    res.status(500).json({ error: 'Failed to unlock AI' });
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
    fs.unlinkSync(req.file.path);
    res.json({ url: result.secure_url });
  } catch (error) {
    logError('Cloudinary image upload error', error);
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
  } catch (error) {
    logError('Cloudinary audio upload error', error);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Audio upload failed' });
  }
});

// Pre-fetch ICE servers at startup
fetchIceServers().then(() => info('Initial ICE servers fetched'));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/feedback', feedbackRoutes);

// Socket.IO Authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    info(`Socket auth error: No token for socket ${socket.id}`);
    return next(new Error('Authentication error: No token provided'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.userId) {
      info(`Socket auth error: No userId in token for socket ${socket.id}`);
      return next(new Error('Authentication error: Invalid token payload'));
    }
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

  // Scribble state per room (in-memory) with userColors, uploadLockedBy
  if (!global.__scribbleStateByRoom) global.__scribbleStateByRoom = new Map();
  const generateColorForUser = (socketId) => {
    // Generate a consistent color based on socketId hash
    let hash = 0;
    for (let i = 0; i < socketId.length; i++) {
      hash = socketId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 90%, 60%)`;
  };
  const getScribbleState = (roomId) => global.__scribbleStateByRoom.get(roomId) || { 
    image: null, 
    drawings: [], 
    userColors: {}, // socket.id -> color (for current session)
    userColorsByUserId: {}, // userId -> color (for persistence across reconnects)
    uploadLockedBy: null 
  };
  const setScribbleState = (roomId, state) => global.__scribbleStateByRoom.set(roomId, state);

  socket.on('join-room', async ({ roomId, username, isReconnect = false }, callback) => {
    if (!roomId) {
      socket.emit('error', { message: 'Invalid room ID' });
      info(`Join-room failed: Invalid room ID for ${username} (${socket.id})`);
      return;
    }
    
    if (!userId) {
      socket.emit('error', { message: 'Invalid user ID' });
      info(`Join-room failed: Invalid user ID for ${username} (${socket.id})`);
      return;
    }

    socket.join(roomId);
    socketToRoom[socket.id] = roomId;
    socketIdToUsername[socket.id] = username;
    
    // Assign or restore color for user in Scribble (consistent based on userId)
    // Use userId-based mapping for color consistency across reconnects and meeting persistence
    const scribbleState = getScribbleState(roomId);
    
    // Create a userId-based color map if it doesn't exist (for persistence)
    if (!scribbleState.userColorsByUserId) {
      scribbleState.userColorsByUserId = {};
      setScribbleState(roomId, scribbleState);
    }
    
    // Check if user already has a color assigned by userId
    let userColor = scribbleState.userColorsByUserId[userId];
    
    if (!userColor) {
      // Generate consistent color based on userId hash for persistence throughout meeting
      let hash = 0;
      for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
      }
      const hue = Math.abs(hash) % 360;
      userColor = `hsl(${hue}, 90%, 60%)`;
      scribbleState.userColorsByUserId[userId] = userColor;
      setScribbleState(roomId, scribbleState);
    }
    
    // Map socket.id to userId-based color (for current session)
    scribbleState.userColors[socket.id] = userColor;
    setScribbleState(roomId, scribbleState);
    
    // Broadcast updated colors to all clients in room
    io.to(roomId).emit('scribble:userColors', scribbleState.userColors);
    
    try {
      let session = await MeetingSession.findOne({ roomId });
      if (!session) {
        session = new MeetingSession({ roomId });
        session.activeParticipants = [];
      }

      const participantIndex = session.activeParticipants.findIndex(p => p.userId && p.userId.toString() === userId.toString());
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
      socket.emit('error', { message: 'Failed to update meeting session' });
      return;
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

  // Scribble events (per-room lock)
  socket.on('scribble:request-state', ({ roomId }) => {
    if (!roomId) return;
    const state = getScribbleState(roomId);
    // Send image first
    if (state.image) {
      socket.emit('scribble:image', state.image);
    }
    // Send all persisted strokes (drawings array)
    if (state.drawings && Array.isArray(state.drawings) && state.drawings.length > 0) {
      // Send all strokes at once for initial sync
      socket.emit('scribble:drawings', state.drawings);
    }
    socket.emit('scribble:lock', { locked: !!state.uploadLockedBy, by: state.uploadLockedBy || null });
    socket.emit('scribble:userColors', state.userColors);
    socket.emit('scribble:canUpload', { canUpload: !state.uploadLockedBy || state.uploadLockedBy === socket.id });
  });

  socket.on('scribble:image', ({ roomId, img }) => {
    if (!roomId) return;
    const state = getScribbleState(roomId);
    if (state.uploadLockedBy && state.uploadLockedBy !== socket.id) {
      socket.emit('scribble:canUpload', { canUpload: false, message: 'Image locked by another user' });
      return; // ignore if locked by someone else
    }
    const next = { 
      ...state,
      image: img || null, 
      drawings: img ? [] : state.drawings, // Only clear drawings if new image is being uploaded
      uploadLockedBy: img ? socket.id : null // Lock only when confirming image
    };
    setScribbleState(roomId, next);
    if (img) {
      io.to(roomId).emit('scribble:image', img);
      // Only clear drawings if new image confirmed
      io.to(roomId).emit('scribble:drawings', []);
      io.to(roomId).emit('scribble:lock', { locked: true, by: socket.id });
    } else {
      // Just unlock without clearing
      io.to(roomId).emit('scribble:image', null);
      io.to(roomId).emit('scribble:lock', { locked: false, by: null });
    }
  });

  socket.on('scribble:drawings', ({ roomId, data }) => {
    if (!roomId) return;
    const state = getScribbleState(roomId);
    const next = { 
      ...state,
      drawings: Array.isArray(data) ? data : []
    };
    setScribbleState(roomId, next);
    socket.to(roomId).emit('scribble:drawings', next.drawings);
  });

  // Individual stroke handler for real-time updates
  socket.on('scribble:stroke', ({ roomId, stroke }) => {
    if (!roomId || !stroke) return;
    const state = getScribbleState(roomId);
    if (!state.drawings) state.drawings = [];
    // Check if stroke already exists (prevent duplicates from updates)
    const existingIndex = state.drawings.findIndex(s => s.id === stroke.id);
    if (existingIndex >= 0) {
      // Update existing stroke (for incremental updates during drawing)
      state.drawings[existingIndex] = stroke;
    } else {
      // Append new stroke
      state.drawings.push(stroke);
    }
    setScribbleState(roomId, state);
    // Broadcast to all other clients instantly for real-time collaboration
    socket.to(roomId).emit('scribble:stroke', stroke);
  });

  socket.on('scribble:removeImage', ({ roomId }) => {
    if (!roomId) return;
    const state = getScribbleState(roomId);
    const roomHost = roomHosts.get(roomId);
    // Only locker or host can remove
    if (state.uploadLockedBy && state.uploadLockedBy !== socket.id && roomHost !== socket.id) {
      return;
    }
    const next = { 
      ...state,
      image: null, 
      drawings: [], 
      uploadLockedBy: null 
    };
    setScribbleState(roomId, next);
    io.to(roomId).emit('scribble:removeImage');
    io.to(roomId).emit('scribble:drawings', []); // Clear all clients
    io.to(roomId).emit('scribble:lock', { locked: false, by: null });
  });
  
  // Color change handler
  socket.on('scribble:userColorChange', ({ roomId, id, color }) => {
    if (!roomId || !id || !color) return;
    const state = getScribbleState(roomId);
    // Update both socket.id mapping and userId mapping for persistence
    if (state.userColors[socket.id]) {
      state.userColors[socket.id] = color;
      // Also update userId mapping if socket.id corresponds to a userId
      const socketObj = io.sockets.sockets.get(socket.id);
      if (socketObj && socketObj.user && socketObj.user.userId) {
        if (!state.userColorsByUserId) state.userColorsByUserId = {};
        state.userColorsByUserId[socketObj.user.userId] = color;
      }
      setScribbleState(roomId, state);
      io.to(roomId).emit('scribble:userColors', state.userColors);
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
              'aiState.isLocked': true,
              'aiState.lockedBy': userId,
              'aiState.lockedByUsername': username,
              'aiState.lockedAt': new Date(),
              'aiState.isProcessing': true
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
              'aiState.isLocked': false,
              'aiState.lockedBy': null,
              'aiState.lockedByUsername': null,
              'aiState.lockedAt': null,
              'aiState.isProcessing': false
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

  socket.on('shared-media-display', async ({ imageUrl, audioUrl, username }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting shared-media-display from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      
      try {
        await MeetingSession.findOneAndUpdate(
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

  socket.on('shared-media-removal', async ({ username }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting shared-media-removal from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      
      try {
        await MeetingSession.findOneAndUpdate(
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

  socket.on('shared-ai-result', async ({ response, username }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      info(`Broadcasting shared-ai-result from ${socketIdToUsername[socket.id]} in room ${roomId}`);
      
      try {
        await MeetingSession.findOneAndUpdate(
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
    
    // Clean up user color on disconnect
    if (roomId) {
      const scribbleState = getScribbleState(roomId);
      if (scribbleState.userColors[socket.id]) {
        delete scribbleState.userColors[socket.id];
        // If this user locked the upload, release the lock
        if (scribbleState.uploadLockedBy === socket.id) {
          scribbleState.uploadLockedBy = null;
          io.to(roomId).emit('scribble:lock', { locked: false, by: null });
        }
        setScribbleState(roomId, scribbleState);
        io.to(roomId).emit('scribble:userColors', scribbleState.userColors);
      }
    }
    
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
        }
      } catch (err) {
        logError('Error updating participant status on disconnect:', err);
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
        }
      } catch (err) {
        logError('Error updating participant status on leave-room:', err);
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