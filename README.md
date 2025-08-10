# Video Conference - Complete Zoom Clone Application

A professional video conferencing web application built with the MERN stack, WebRTC, and Socket.IO. Features HD video/audio streaming, real-time chat, screen sharing, and participant management with enterprise-level security.

## 🚀 Features

### Core Video Conferencing
- **HD Video & Audio**: Up to 720p video quality with crystal-clear audio
- **Real-time Communication**: WebRTC-powered peer-to-peer connections
- **Smart Participant Limit**: Maximum 10 participants for optimal performance
- **Connection Speed Optimization**: Intelligent bandwidth management and quality adjustment

### Meeting Features
- **Room Management**: Create and join meetings with unique room IDs
- **Screen Sharing**: Share your screen with all participants
- **Live Chat**: Real-time messaging during meetings
- **Participant Controls**: Host can mute/remove participants
- **Audio/Video Toggle**: Easy mute/unmute and camera on/off

### User Management
- **Secure Authentication**: JWT-based login with bcrypt password hashing
- **User Profiles**: Customizable user profiles and settings
- **Meeting History**: View past meetings and rejoin active ones
- **Meeting Scheduling**: Schedule meetings for future dates

### Security & Performance
- **End-to-End Encryption**: WebRTC DTLS-SRTP encrypted media streams
- **Rate Limiting**: Protection against brute force attacks
- **Input Sanitization**: XSS protection for all user inputs
- **Connection Optimization**: Smart ICE candidate selection and bandwidth monitoring

## 🛠 Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database (local installation)
- **Socket.IO** - Real-time communication
- **PeerJS** - WebRTC peer management
- **JWT** - Authentication tokens
- **bcrypt** - Password hashing

### Frontend
- **React** - User interface framework
- **Tailwind CSS** - Utility-first CSS framework (via CDN)
- **Socket.IO Client** - Real-time client communication
- **WebRTC Adapter** - Cross-browser WebRTC support
- **React Router** - Client-side routing
- **Axios** - HTTP client

### Infrastructure
- **MongoDB Community** - Local database
- **Coturn** - TURN server for NAT traversal (optional)
- **PeerJS Server** - WebRTC signaling server

## 📋 Prerequisites

Before running this application, ensure you have the following installed:

1. **Node.js** (v16 or higher)
   ```bash
   # Check version
   node --version
   npm --version
   ```

2. **MongoDB Community Edition**
   - [Download MongoDB](https://www.mongodb.com/try/download/community)
   - Follow installation guide for your OS
   - Start MongoDB service:
     ```bash
     # Windows (as service)
     net start MongoDB
     
     # macOS (with Homebrew)
     brew services start mongodb-community
     
     # Linux (systemd)
     sudo systemctl start mongod
     ```

3. **Git** (for cloning the repository)

## 🚀 Installation & Setup

### 1. Clone Repository
```bash
git clone <repository-url>
cd zoom-clone
```

### 2. Install Dependencies
```bash
# Install root dependencies
npm install

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Return to root directory
cd ..
```

### 3. Environment Configuration
Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

Update the `.env` file with your configurations:
```env
# Server Configuration
NODE_ENV=development
PORT=5000
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# Database Configuration
MONGO_URI=mongodb://localhost:27017/zoom_clone

# PeerJS Configuration
PEERJS_HOST=localhost
PEERJS_PORT=5001

# TURN Server Configuration (Optional)
TURN_SERVER_URL=turn:localhost:3478
TURN_USERNAME=testuser
TURN_PASSWORD=testpass

# Client URL for CORS
CLIENT_URL=http://localhost:3000
```

### 4. Start MongoDB
Ensure MongoDB is running on your system:
```bash
# Check if MongoDB is running
mongo --eval "db.adminCommand('ismaster')"

# If not running, start MongoDB service
# Windows: net start MongoDB
# macOS: brew services start mongodb-community
# Linux: sudo systemctl start mongod
```

### 5. Run the Application

#### Development Mode (Recommended)
```bash
# From root directory - runs both server and client concurrently
npm run dev
```

#### Manual Mode
```bash
# Terminal 1 - Start the server
npm run server

# Terminal 2 - Start the client
npm run client
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:5000
- **PeerJS Server**: http://localhost:5001

## 🔧 Optional: TURN Server Setup (Coturn)

For better connectivity in restricted networks, set up a local TURN server:

### Install Coturn (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install coturn
```

### Configure Coturn
Edit `/etc/turnserver.conf`:
```conf
listening-port=3478
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=your-secret-key
realm=localhost
total-quota=100
bps-capacity=0
stale-nonce
no-loopback-peers
no-multicast-peers
```

### Start Coturn
```bash
sudo systemctl enable coturn
sudo systemctl start coturn
```

### Verify TURN Server
```bash
# Check if TURN server is running
sudo netstat -tuln | grep 3478
```

## 🧪 Testing

### Unit Tests
```bash
cd server
npm test
```

### Load Testing
Test with multiple participants:
1. Open multiple browser tabs/windows
2. Create a meeting in one tab
3. Join the same meeting from other tabs
4. Test various features (video, audio, chat, screen share)

### Performance Testing
```bash
# Monitor server performance
cd server
node --inspect server.js

# Open Chrome DevTools for performance profiling
# chrome://inspect
```

## 📱 Usage Guide

### Creating a Meeting
1. **Sign Up/Login**: Create an account or log in
2. **Create Meeting**: Click "Create Meeting Room" on the home page
3. **Share Room ID**: Copy and share the room ID with participants
4. **Start Conference**: Begin your video conference immediately

### Joining a Meeting
1. **Get Room ID**: Obtain the meeting ID from the host
2. **Join Meeting**: Enter the room ID on the join page
3. **Grant Permissions**: Allow camera and microphone access
4. **Join Conference**: Start participating in the meeting

### Meeting Controls
- **🎤 Audio**: Click to mute/unmute microphone
- **📹 Video**: Click to turn camera on/off
- **🖥️ Screen Share**: Click to share/stop sharing your screen
- **💬 Chat**: Click to open/close the chat panel
- **👥 Participants**: Click to view participant list
- **📞 Leave**: Click to exit the meeting

### Host Controls
As a meeting host, you can:
- Mute other participants
- Remove participants from the meeting
- Manage meeting settings

## ⚡ Performance Optimization

### Connection Speed Management
The application automatically:
- Queues user connections (500ms delay) to prevent bandwidth spikes
- Selects fastest ICE candidates (prefers local/UDP over relay)
- Monitors network speed and adjusts video quality accordingly
- Limits video resolution to 720p (downgrades to 480p for slow connections)

### Participant Limit
- Maximum 10 participants per meeting room
- Enforced at server level to ensure optimal performance
- Real-time participant count updates

### Bandwidth Optimization
- Automatic quality adjustment based on network conditions
- Efficient WebRTC peer connection management
- Compressed signaling data for faster communication

## 🔒 Security Features

### Authentication & Authorization
- JWT tokens with secure expiration
- bcrypt password hashing (12 salt rounds)
- Protected routes requiring authentication
- Rate limiting on sensitive endpoints

### Data Protection
- Input sanitization to prevent XSS attacks
- CORS configuration for secure cross-origin requests
- Secure HTTP headers via Helmet.js
- No persistent storage of meeting content

### WebRTC Security
- DTLS-SRTP encryption for all media streams
- Secure peer-to-peer connections
- Local TURN server support for NAT traversal

## 🐛 Troubleshooting

### Common Issues

#### MongoDB Connection Error
```bash
# Check MongoDB status
mongo --eval "db.runCommand({connectionStatus : 1})"

# Restart MongoDB service
# Windows: net restart MongoDB
# macOS: brew services restart mongodb-community
# Linux: sudo systemctl restart mongod
```

#### Port Already in Use
```bash
# Find process using port 5000
lsof -ti:5000

# Kill the process
kill -9 <PID>

# Or use different port in .env file
PORT=5001
```

#### Camera/Microphone Access Denied
1. Check browser permissions in address bar
2. Allow camera/microphone access
3. Restart the browser if needed
4. Try different browser (Chrome recommended)

#### WebRTC Connection Issues
1. Check firewall settings
2. Ensure TURN server is configured correctly
3. Test on local network first
4. Check browser console for WebRTC errors

#### High CPU Usage
1. Limit number of participants (max 10)
2. Reduce video quality in poor network conditions
3. Close unnecessary browser tabs
4. Update to latest browser version

### Debug Mode
Enable debug logging:
```bash
# Server debug mode
cd server
DEBUG=* npm start

# Client development mode
cd client
REACT_APP_DEBUG=true npm start
```

### Error Logs
Check application logs:
```bash
# Server logs
tail -f server/logs/error.log

# Browser console
# Open Developer Tools (F12) -> Console tab
```

## 🔄 Updates & Maintenance

### Keeping Dependencies Updated
```bash
# Check for updates
npm outdated

# Update dependencies
npm update

# Update server dependencies
cd server && npm update

# Update client dependencies  
cd client && npm update
```

### Database Maintenance
```bash
# Connect to MongoDB
mongo

# Switch to application database
use zoom_clone

# View collections
show collections

# Clean up old meetings (optional)
db.meetings.deleteMany({
  isActive: false,
  createdAt: {
    $lt: new Date(Date.now() - 30*24*60*60*1000) // 30 days ago
  }
})
```

## 📚 API Documentation

### Authentication Endpoints
```http
POST /api/auth/register
POST /api/auth/login  
GET  /api/auth/me
PUT  /api/auth/profile
```

### Meeting Endpoints
```http
POST /api/meetings
GET  /api/meetings/:roomId
POST /api/meetings/:roomId/join
POST /api/meetings/:roomId/leave
POST /api/meetings/schedule
GET  /api/meetings/user/history
```

### Health Check
```http
GET /api/health
```

## 🤝 Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Development Guidelines
- Follow existing code style
- Add comments for complex functionality
- Update documentation for new features
- Test thoroughly before submitting

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter any issues or have questions:

1. **Check the troubleshooting section** above
2. **Search existing issues** on GitHub
3. **Create a new issue** with detailed information
4. **Join our community** for discussions and help

### System Requirements
- **Node.js**: v16+ 
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 500MB for application + MongoDB data
- **Network**: Broadband internet connection
- **Browser**: Chrome/Firefox/Safari/Edge (latest versions)

---

**Built with ❤️ using modern web technologies for seamless video communication.**