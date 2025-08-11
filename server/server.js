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
         res.json(token.iceServers);
       } catch (error) {
         logError("Twilio ICE server error", error);
         res.status(500).json([{ urls: 'stun:stun.l.google.com:19302' }]);
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
         socket.join(roomId);
         socketToRoom[socket.id] = roomId;
         socketIdToUsername[socket.id] = username;

         const usersInRoom = [];
         const room = io.sockets.adapter.rooms.get(roomId);
         if (room) {
           room.forEach(id => {
             if (id !== socket.id) {
               usersInRoom.push({ userId: id, username: socketIdToUsername[id] });
             }
           });
         }

         info(`User ${username} (${socket.id}) joined room ${roomId}`);
         if (callback) callback(usersInRoom);
         socket.to(roomId).emit('user-joined', { userId: socket.id, username });
       });

       socket.on('offer', (payload) => {
         info(`Relaying offer from ${socketIdToUsername[socket.id]} to ${socketIdToUsername[payload.to] || payload.to}`);
         io.to(payload.to).emit('offer', {
           from: socket.id,
           offer: payload.offer,
           username: socketIdToUsername[socket.id]
         });
       });

       socket.on('answer', (payload) => {
         info(`Relaying answer from ${socketIdToUsername[socket.id]} to ${socketIdToUsername[payload.to] || payload.to}`);
         io.to(payload.to).emit('answer', {
           from: socket.id,
           answer: payload.answer
         });
       });

       socket.on('ice-candidate', (payload) => {
         info(`Relaying ICE candidate from ${socketIdToUsername[socket.id]} to ${socketIdToUsername[payload.to] || payload.to}`);
         io.to(payload.to).emit('ice-candidate', {
           from: socket.id,
           candidate: payload.candidate
         });
       });

       socket.on('send-chat-message', (payload) => {
         const roomId = socketToRoom[socket.id];
         if (roomId) {
           socket.to(roomId).emit('chat-message', payload);
         }
       });

       const drawingEvents = ['drawing-start', 'drawing-move', 'drawing-end', 'clear-canvas', 'draw-shape'];
       drawingEvents.forEach(event => {
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