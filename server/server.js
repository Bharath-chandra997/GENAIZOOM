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
const fs = require('fs'); // For temp file cleanup
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
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
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
            userId: user._id.toString(), // FIXED: Ensure string
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

// [ICE Servers and Meeting Session Endpoints unchanged - omitted for brevity]

// AI Lock Endpoint - FIXED: Trust token userId, no body mismatch check
app.post('/api/ai/lock/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username } = req.body;
    const userId = req.user.userId.toString(); // From token, ensure string

    info(`Lock attempt for room ${roomId} by userId ${userId} (token) vs body ${req.body.userId}`); // Debug log

    let session = await MeetingSession.findOne({ roomId });
    if (!session) {
      session = new MeetingSession({ roomId });
      await session.save();
    }

    // Check if already locked by someone else
    if (session.aiState?.isLocked && session.aiState.lockedBy !== userId) {
      return res.status(409).json({ error: 'AI Bot is already in use by another user' });
    }

    // Set lock state (merge with existing aiState)
    session.aiState = {
      ...(session.aiState || {}),
      isLocked: true,
      lockedBy: userId,
      lockedByUsername: username || req.user.username,
      lockedAt: new Date(),
      isProcessing: true
    };
    await session.save();

    info(`AI locked for room ${roomId} by ${req.user.username}`);

    // Broadcast to room
    io.to(roomId).emit('ai-bot-locked', { userId, username: req.user.username, roomId });

    res.json({ success: true, message: 'AI bot locked' });
  } catch (error) {
    logError('Error locking AI:', error);
    res.status(500).json({ error: 'Failed to lock AI' });
  }
});

// AI Unlock Endpoint - FIXED: Similar trust token userId
app.post('/api/ai/unlock/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.userId.toString(); // From token

    info(`Unlock attempt for room ${roomId} by userId ${userId}`); // Debug log

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

// [File Uploads, API Routes, Socket.IO Logic unchanged - use original code for these sections]

// Server Start
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  info(`Server running on port ${PORT}`);
});