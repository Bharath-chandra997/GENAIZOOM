import React from 'react';
import { toast } from 'react-toastify';

const Participants = ({ 
    participants = [], 
    pendingRequests = [], 
    currentUser, 
    meetingInfo, 
    onClose, 
    onAcceptJoin, 
    onRejectJoin, 
    onPinParticipant, 
    roomId 
}) => {
  return (
    <div className="h-full flex flex-col bg-gray-800">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-white">Participants ({participants.length})</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors duration-200 p-1"
          title="Close participants"
        >
          <span className="text-lg">✕</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {pendingRequests.length > 0 && meetingInfo?.isHost && (
          <div className="p-4 border-b border-gray-700">
            <h4 className="text-md font-semibold text-white mb-2">Pending Join Requests</h4>
            {/* ... rest of the pending requests logic ... */}
          </div>
        )}

        <div className="p-4 space-y-2">
          {participants.map((participant) => (
            <div
              key={participant.userId || participant.peerId}
              className="flex items-center justify-between p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors duration-200"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                  {participant.username?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div>
                  <span className="text-white font-medium">{participant.username || 'Participant'}</span>
                  {participant.isLocal && (
                    <span className="bg-primary-500 text-white px-2 py-1 rounded text-xs ml-2">You</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={() => {
            const meetingUrl = `${window.location.origin}/join/${roomId}`;
            navigator.clipboard.writeText(meetingUrl);
            toast.success('Invite link copied to clipboard');
          }}
          className="w-full bg-primary-600 text-white py-2 px-3 rounded text-sm hover:bg-primary-700 transition-colors"
        >
          Copy Invite Link
        </button>
      </div>
    </div>
  );
};

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
require('dotenv').config();
const twilio = require('twilio');
const authRoutes = require('./routes/auth');
const meetingRoutes = require('./routes/meetings');
const { info, logError } = require('./utils/logger');
const User = require('./models/User');
const Meeting = require('./models/Meeting');

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
  info('WARNING: Twilio credentials not found in .env. WebRTC connections may be less reliable.');
}
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  logError('FATAL ERROR: Google OAuth credentials not defined.');
  process.exit(1);
}

// App & Server Setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://genaizoom123.onrender.com'],
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(helmet());
app.use(cors({ origin: ['https://genaizoom123.onrender.com'] }));
app.use(express.json());
app.use(passport.initialize());

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
        const token = jwt.sign({ userId: user._id, username: user.username, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        return done(null, { user, token });
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);

// Twilio ICE Server Route
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
app.get('/ice-servers', async (req, res) => {
  try {
    const token = await twilioClient.tokens.create();
    const iceServers = [
      ...token.iceServers,
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'pass' }, // Replace with your TURN server
    ];
    res.json(iceServers);
  } catch (error) {
    logError('Twilio ICE server error', error);
    res.status(500).json([
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'pass' },
    ]);
  }
});

// Socket.IO Authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    info(`Socket auth error: No token for socket ${socket.id}`);
    return next(new Error('Authentication error'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = { userId: decoded.userId, username: decoded.username, email: decoded.email };
    next();
  } catch (error) {
    info(`Socket auth error: Invalid token for socket ${socket.id}`);
    next(new Error('Authentication error'));
  }
});

// Socket.IO Logic
const socketToRoom = {};
const socketIdToUsername = {};

io.on('connection', (socket) => {
  const { username } = socket.user;
  info(`Socket connected: ${socket.id} for user ${username}`);

  socket.on('join-room', ({ roomId }, callback) => {
    if (!roomId) {
      socket.emit('error', { message: 'Invalid room ID' });
      return;
    }
    socket.join(roomId);
    socketToRoom[socket.id] = roomId;
    socketIdToUsername[socket.id] = username;

    const usersInRoom = [];
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room) {
      room.forEach((id) => {
        if (id !== socket.id) {
          usersInRoom.push({ userId: id, username: socketIdToUsername[id] });
        }
      });
    }

    info(`User ${username} (${socket.id}) joined room ${roomId}`);
    callback(usersInRoom);
    socket.to(roomId).emit('user-joined', { userId: socket.id, username });
  });

  socket.on('offer', (payload) => {
    if (!payload.to || !payload.offer) return;
    info(`Relaying offer from ${socketIdToUsername[socket.id]} to ${socketIdToUsername[payload.to] || payload.to}`);
    io.to(payload.to).emit('offer', {
      from: socket.id,
      offer: payload.offer,
      username: socketIdToUsername[socket.id],
    });
  });

  socket.on('answer', (payload) => {
    if (!payload.to || !payload.answer) return;
    info(`Relaying answer from ${socketIdToUsername[socket.id]} to ${socketIdToUsername[payload.to] || payload.to}`);
    io.to(payload.to).emit('answer', {
      from: socket.id,
      answer: payload.answer,
    });
  });

  socket.on('ice-candidate', (payload) => {
    if (!payload.to || !payload.candidate) return;
    info(`Relaying ICE candidate from ${socketIdToUsername[socket.id]} to ${socketIdToUsername[payload.to] || payload.to}`);
    io.to(payload.to).emit('ice-candidate', {
      from: socket.id,
      candidate: payload.candidate,
    });
  });

  socket.on('send-chat-message', (payload) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      socket.to(roomId).emit('chat-message', payload);
    }
  });

  const drawingEvents = ['drawing-start', 'drawing-move', 'drawing-end', 'clear-canvas', 'draw-shape'];
  drawingEvents.forEach((event) => {
    socket.on(event, (data) => {
      const roomId = socketToRoom[socket.id];
      if (roomId) {
        const payload = { ...data, from: socket.id };
        socket.to(roomId).emit(event, payload);
      }
    });
  });

  const handleDisconnect = () => {
    const disconnectedUser = socketIdToUsername[socket.id] || 'A user';
    info(`${disconnectedUser} (${socket.id}) disconnected.`);
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      socket.to(roomId).emit('user-left', socket.id);
    }
    delete socketToRoom[socket.id];
    delete socketIdToUsername[socket.id];
  };

  socket.on('leave-room', handleDisconnect);
  socket.on('disconnect', handleDisconnect);
});

// Server Start
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  info(`Server running on port ${PORT}`);
});

export default Participants;