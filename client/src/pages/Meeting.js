import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import io from 'socket.io-client';
import axios from 'axios';
import MeetingHeader from './MeetingHeader';
import MeetingMainArea from './MeetingMainArea';
import MeetingSidebar from './MeetingSidebar';
import MeetingControls from './MeetingControls';
import AIPopup from './AIPopup';
import Chat from '../components/Chat';
import LoadingSpinner from '../components/LoadingSpinner';
import './Meeting.css';

const SERVER_URL = 'https://genaizoomserver-0yn4.onrender.com';

const getColorForId = (id) => {
  if (!id) return '#FFFFFF';
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 90%, 60%)`;
};

// Function to get user avatar from Google Auth
const getUserAvatar = (user, size = 40) => {
  if (user?.profilePicture) {
    return user.profilePicture;
  }
  
  // Fallback to initials with colored background
  const initials = user?.username?.charAt(0)?.toUpperCase() || 'U';
  const color = getColorForId(user?.userId || user?.username);
  
  return (
    <div 
      className="user-avatar"
      style={{
        backgroundColor: color,
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: 'bold',
        fontSize: size * 0.4
      }}
    >
      {initials}
    </div>
  );
};

// AI Avatar component
const AIAvatar = ({ size = 40 }) => {
  return (
    <div 
      className="ai-avatar"
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: 'bold',
        fontSize: size * 0.35,
        border: '2px solid #10b981',
        position: 'relative'
      }}
    >
      🤖
      <div 
        style={{
          position: 'absolute',
          bottom: -2,
          right: -2,
          width: 12,
          height: 12,
          backgroundColor: '#10b981',
          borderRadius: '50%',
          border: '2px solid white'
        }}
      />
    </div>
  );
};

const Meeting = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State for meeting
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isAIPopupOpen, setIsAIPopupOpen] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [pinnedParticipantId, setPinnedParticipantId] = useState(null);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 20, y: 20 });
  const [currentTool] = useState('pen');
  const [currentBrushSize] = useState(5);
  const [gridPage, setGridPage] = useState(0);
  const [aiBotInUse, setAiBotInUse] = useState(false);
  const [currentAIUser, setCurrentAIUser] = useState(null);
  const [aiResponse, setAiResponse] = useState('');
  const [aiUploadedImage, setAiUploadedImage] = useState(null);
  const [aiUploadedAudio, setAiUploadedAudio] = useState(null);

  // AI Participant state
  const [aiParticipant] = useState({
    userId: 'ai-assistant',
    username: 'AI Assistant',
    isLocal: false,
    isHost: false,
    videoEnabled: true,
    audioEnabled: false,
    isScreenSharing: false,
    isAI: true,
    stream: null,
    socketId: 'ai-assistant',
    color: '#3B82F6',
    profilePicture: null
  });

  // Refs
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const localCameraTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnections = useRef(new Map());
  const dragInfo = useRef({ isDragging: false });
  const annotationCanvasRef = useRef(null);
  const remoteDrawingStates = useRef(new Map());
  const drawingStateRef = useRef({ isDrawing: false, startX: 0, startY: 0 });
  const isInitialized = useRef(false);

  // AI Refs
  const aiCanvasRef = useRef(null);
  const aiAnimationRef = useRef(null);

  // Connection optimization refs
  const connectionTimeouts = useRef(new Map());
  const iceServersCache = useRef(null);
  const lastIceFetch = useRef(0);

  // Signaling state management
  const signalingStates = useRef(new Map());
  const pendingOffers = useRef(new Map());
  const pendingAnswers = useRef(new Map());

  // Detect if browser mirrors front camera tracks
  const isMirroringBrowser = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream, []);

  // All participants including AI (but we'll separate them for display)
  const allParticipants = useMemo(() => {
    return [...participants];
  }, [participants]);

  const participantsWithAI = useMemo(() => {
    return [aiParticipant, ...participants];
  }, [aiParticipant, participants]);

  // Real participants count (excluding AI)
  const realParticipantsCount = useMemo(() => participants.length, [participants]);

  // Derived State
  const defaultMainParticipant = useMemo(() => {
    const screenSharer = allParticipants.find(p => p.isScreenSharing);
    if (screenSharer) return screenSharer;
    const host = allParticipants.find(p => p.isHost);
    if (host) return host;
    return allParticipants[0] || null;
  }, [allParticipants]);

  const isSomeoneScreenSharing = useMemo(() =>
    allParticipants.some(p => p.isScreenSharing),
    [allParticipants]
  );

  const displayParticipants = participantsWithAI;
  const totalGridPages = useMemo(() => Math.max(1, Math.ceil(displayParticipants.length / 4)), [displayParticipants.length]);

  const getUsernameById = useCallback((userId) => {
    const participant = allParticipants.find(p => p.userId === userId);
    return participant ? (participant.isLocal ? user.username : participant.username) : 'Another user';
  }, [allParticipants, user.username]);

  // Copy invite link to clipboard
  const copyInviteLink = useCallback(() => {
    const inviteLink = `${window.location.origin}/join/${roomId}`;
    navigator.clipboard.writeText(inviteLink)
      .then(() => {
        toast.success('Invite link copied to clipboard!', {
          position: "bottom-center",
          autoClose: 3000,
        });
      })
      .catch(() => {
        toast.error('Failed to copy invite link', {
          position: "bottom-center",
          autoClose: 3000,
        });
      });
  }, [roomId]);

  // AI Animation
  const initializeAiAnimation = useCallback(() => {
    const canvas = aiCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];
    let time = 0;

    const createParticles = () => {
      particles = [];
      for (let i = 0; i < 30; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2 + 1,
          speed: Math.random() * 1 + 0.5,
          color: `hsl(${200 + Math.random() * 60}, 70%, 60%)`,
          angle: Math.random() * Math.PI * 2
        });
      }
    };

    const animate = () => {
      if (!canvas) return;
      
      ctx.fillStyle = 'rgba(15, 23, 42, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      time += 0.02;

      particles.forEach((particle, index) => {
        particle.x += Math.cos(particle.angle + time) * particle.speed;
        particle.y += Math.sin(particle.angle + time) * particle.speed;

        if (particle.x < 0) particle.x = canvas.width;
        if (particle.x > canvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = canvas.height;
        if (particle.y > canvas.height) particle.y = 0;

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.fill();

        particles.slice(index + 1).forEach(otherParticle => {
          const dx = particle.x - otherParticle.x;
          const dy = particle.y - otherParticle.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 80) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(100, 200, 255, ${0.2 * (1 - distance / 80)})`;
            ctx.lineWidth = 0.3;
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(otherParticle.x, otherParticle.y);
            ctx.stroke();
          }
        });
      });

      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = 'rgba(96, 165, 250, 0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AI Assistant', canvas.width / 2, canvas.height / 2 - 10);

      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = aiBotInUse ? 'rgba(239, 68, 68, 0.7)' : 'rgba(96, 165, 250, 0.7)';
      ctx.fillText(aiBotInUse ? 'In use by ' + currentAIUser : 'Ready to help', canvas.width / 2, canvas.height / 2 + 15);

      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, 25 + Math.sin(time * 2) * 3, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(96, 165, 250, ${0.5 + Math.sin(time) * 0.3})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      aiAnimationRef.current = requestAnimationFrame(animate);
    };

    const resizeCanvas = () => {
      if (canvas) {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        createParticles();
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    animate();

    return () => {
      if (aiAnimationRef.current) {
        cancelAnimationFrame(aiAnimationRef.current);
      }
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [aiBotInUse, currentAIUser]);

  useEffect(() => {
    const cleanup = initializeAiAnimation();
    return cleanup;
  }, [initializeAiAnimation]);

  // AI Bot functions
  const handleAIRequest = useCallback(async (imageFile, audioFile) => {
    if (aiBotInUse) {
      toast.error('AI Bot is currently in use by another user', {
        position: "bottom-center"
      });
      return;
    }

    setAiBotInUse(true);
    setCurrentAIUser(user.username);
    setAiUploadedImage(imageFile);
    setAiUploadedAudio(audioFile);

    setTimeout(() => {
      const response = `Hello ${user.username}! I've processed your ${imageFile ? 'image' : ''}${imageFile && audioFile ? ' and ' : ''}${audioFile ? 'audio' : ''}. This is a simulated AI response. In a real implementation, this would connect to an AI service.`;
      setAiResponse(response);
      
      socketRef.current?.emit('ai-response', {
        user: user.username,
        response: response,
        image: imageFile ? URL.createObjectURL(imageFile) : null,
        audio: audioFile ? URL.createObjectURL(audioFile) : null
      });
    }, 3000);
  }, [aiBotInUse, user.username]);

  const handleAIComplete = useCallback(() => {
    setAiBotInUse(false);
    setCurrentAIUser(null);
    setAiResponse('');
    setAiUploadedImage(null);
    setAiUploadedAudio(null);
    socketRef.current?.emit('ai-complete');
  }, []);

  const handleToolbarMouseMove = useCallback((e) => {
    if (dragInfo.current.isDragging) {
      setToolbarPosition({
        x: e.clientX - dragInfo.current.offsetX,
        y: e.clientY - dragInfo.current.offsetY,
      });
    }
  }, []);

  const handleToolbarMouseUp = useCallback(() => {
    dragInfo.current.isDragging = false;
    window.removeEventListener('mousemove', handleToolbarMouseMove);
    window.removeEventListener('mouseup', handleToolbarMouseUp);
  }, [handleToolbarMouseMove]);

  const handleMouseDown = useCallback((e) => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawingStateRef.current = { isDrawing: true, startX: x, startY: y };

    if (currentTool === 'pen' || currentTool === 'eraser') {
      const myColor = getColorForId(socketRef.current?.id);
      const payload = { x: x / canvas.width, y: y / canvas.height, color: myColor, tool: currentTool, size: currentBrushSize };
      socketRef.current?.emit('drawing-start', payload);
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = myColor;
      ctx.lineWidth = currentBrushSize;
      ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }, [currentTool, currentBrushSize]);

  const handleMouseMove = useCallback((e) => {
    if (!drawingStateRef.current.isDrawing || !e.buttons) return;
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    if (currentTool === 'pen' || currentTool === 'eraser') {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      socketRef.current?.emit('drawing-move', { x: x / canvas.width, y: y / canvas.height });
      const ctx = canvas.getContext('2d');
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }, [currentTool]);

  const handleMouseUp = useCallback((e) => {
    if (!drawingStateRef.current.isDrawing) return;
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    if (currentTool === 'rectangle' || currentTool === 'circle') {
      const rect = canvas.getBoundingClientRect();
      const { startX, startY } = drawingStateRef.current;
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;
      const myColor = getColorForId(socketRef.current?.id);
      const payload = {
        tool: currentTool,
        startX: startX / canvas.width,
        startY: startY / canvas.height,
        endX: endX / canvas.width,
        endY: endY / canvas.height,
        color: myColor,
        size: currentBrushSize,
      };
      socketRef.current?.emit('draw-shape', payload);
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = myColor;
      ctx.lineWidth = currentBrushSize;
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      if (currentTool === 'rectangle') ctx.rect(startX, startY, endX - startX, endY - startY);
      else if (currentTool === 'circle') {
        const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
      }
      ctx.stroke();
    }
    drawingStateRef.current = { isDrawing: false, startX: 0, startY: 0 };
  }, [currentTool, currentBrushSize]);

  const getIceServers = useCallback(async () => {
    const now = Date.now();
    const cacheExpiry = 5 * 60 * 1000;

    if (iceServersCache.current && (now - lastIceFetch.current) < cacheExpiry) {
      return iceServersCache.current;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const { data } = await axios.get(`${SERVER_URL}/ice-servers`, {
        signal: controller.signal,
        timeout: 5000
      });

      clearTimeout(timeoutId);
      console.log('ICE Servers fetched:', data.length, 'servers');

      iceServersCache.current = data;
      lastIceFetch.current = now;

      return data;
    } catch (error) {
      console.warn('ICE servers fetch failed, using fallback:', error.message);
      const fallbackServers = [
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

      iceServersCache.current = fallbackServers;
      lastIceFetch.current = now;

      return fallbackServers;
    }
  }, []);

  const handleIceCandidate = useCallback(({ from, candidate }) => {
    const pc = peerConnections.current.get(from);
    if (pc && pc.remoteDescription && candidate) {
      pc.addIceCandidate(new RTCIceCandidate(candidate))
        .catch(err => {
          console.warn('Error adding ICE candidate:', err);
        });
    }
  }, []);

  const createPeerConnection = useCallback(
    async (remoteSocketId) => {
      if (peerConnections.current.has(remoteSocketId)) {
        console.log('Connection already exists for user:', remoteSocketId);
        return peerConnections.current.get(remoteSocketId);
      }

      const iceServers = await getIceServers();
      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });

      signalingStates.current.set(remoteSocketId, 'new');

      const connectionTimeout = setTimeout(() => {
        if (pc.connectionState === 'connecting') {
          console.warn('Connection timeout for user:', remoteSocketId);
          pc.close();
          peerConnections.current.delete(remoteSocketId);
          connectionTimeouts.current.delete(remoteSocketId);
          signalingStates.current.delete(remoteSocketId);
        }
      }, 15000);

      connectionTimeouts.current.set(remoteSocketId, connectionTimeout);

      // Add local tracks to the connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          if (track.kind === 'audio' || track.kind === 'video') {
            pc.addTrack(track, localStreamRef.current);
          }
        });
      }

      pc.ontrack = (event) => {
        console.log('Received remote track from:', remoteSocketId);
        clearTimeout(connectionTimeout);
        connectionTimeouts.current.delete(remoteSocketId);
        
        const stream = event.streams[0];
        if (stream) {
          setParticipants(prev =>
            prev.map(p =>
              p.userId === remoteSocketId ? { ...p, stream: stream } : p
            )
          );
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit('ice-candidate', { 
            to: remoteSocketId, 
            candidate: event.candidate 
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('Peer connection state:', pc.connectionState, 'for user:', remoteSocketId);
        if (pc.connectionState === 'connected') {
          clearTimeout(connectionTimeout);
          connectionTimeouts.current.delete(remoteSocketId);
          console.log('Successfully connected to user:', remoteSocketId);
          toast.success(`Connected to ${getUsernameById(remoteSocketId)}`);
        } else if (pc.connectionState === 'disconnected') {
          console.log('Connection disconnected for user:', remoteSocketId);
          toast.warning(`Connection lost with ${getUsernameById(remoteSocketId)}`);
        } else if (pc.connectionState === 'failed') {
          console.error('Connection failed for user:', remoteSocketId);
          clearTimeout(connectionTimeout);
          connectionTimeouts.current.delete(remoteSocketId);
          signalingStates.current.delete(remoteSocketId);
          pendingOffers.current.delete(remoteSocketId);
          pendingAnswers.current.delete(remoteSocketId);
          pc.close();
          peerConnections.current.delete(remoteSocketId);
          setParticipants((prev) => prev.filter((p) => p.userId !== remoteSocketId));
          toast.error(`Failed to connect to ${getUsernameById(remoteSocketId)}`);
        }
      };

      peerConnections.current.set(remoteSocketId, pc);
      return pc;
    },
    [getIceServers, getUsernameById]
  );

  const setupSocketListeners = useCallback((socket) => {
    const handleConnect = () => {
      console.log('Socket connected:', socket.id);
      socket.emit('join-room', {
        roomId,
        username: user.username,
        isReconnect: false
      }, (otherUsers, sessionData) => {
        console.log('Room joined successfully. Other users:', otherUsers);
        const isHost = otherUsers.length === 0;
        const remoteParticipants = otherUsers.map(u => ({
          userId: u.userId,
          username: u.username,
          stream: null,
          isLocal: false,
          isHost: u.isHost || false,
          videoEnabled: true,
          audioEnabled: true,
          isScreenSharing: false,
          socketId: u.userId
        }));
        const localParticipant = {
          userId: socket.id,
          username: `${user.username} (You)`,
          stream: localStreamRef.current,
          isLocal: true,
          isHost,
          videoEnabled: true,
          audioEnabled: true,
          isScreenSharing: false,
          socketId: socket.id
        };
        setParticipants([localParticipant, ...remoteParticipants]);
        setIsLoading(false);
        
        // Create peer connections for existing users
        otherUsers.forEach(async (user) => {
          try {
            const pc = await createPeerConnection(user.userId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { to: user.userId, offer, username: user.username });
          } catch (err) {
            console.error('Error creating offer for existing user:', err);
          }
        });
      });
    };

    const handleUserJoined = async ({ userId, username, isHost, isReconnect }) => {
      console.log('User joined:', userId, username);
      if (isReconnect) return;
      
      setParticipants((prev) => {
        if (prev.some(p => p.userId === userId)) return prev;
        return [...prev, {
          userId,
          username,
          stream: null,
          isLocal: false,
          isHost,
          videoEnabled: true,
          audioEnabled: true,
          isScreenSharing: false,
          socketId: userId
        }];
      });
      
      toast.info(`${username} joined the meeting`);
      
      try {
        const pc = await createPeerConnection(userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: userId, offer, username: user.username });
      } catch (err) {
        console.error('Error in user-joined handler:', err);
        toast.error(`Failed to connect to user ${username}.`);
      }
    };

    const handleOffer = async ({ from, offer, username }) => {
      console.log('Received offer from:', from);
      setParticipants((prev) => {
        if (prev.some(p => p.userId === from)) return prev;
        return [...prev, {
          userId: from,
          username,
          stream: null,
          isLocal: false,
          isHost: false,
          videoEnabled: true,
          audioEnabled: true,
          isScreenSharing: false,
          socketId: from
        }];
      });
      
      try {
        const pc = await createPeerConnection(from);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { to: from, answer });
      } catch (err) {
        console.error('Error in offer handler:', err);
        toast.error(`Failed to process offer from ${username}.`);
      }
    };

    const handleAnswer = async ({ from, answer }) => {
      console.log('Received answer from:', from);
      const pc = peerConnections.current.get(from);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('Error setting remote description:', err);
        }
      }
    };

    const handleUserLeft = ({ userId, username }) => {
      console.log('User left:', userId);
      const pc = peerConnections.current.get(userId);
      if (pc) {
        pc.getSenders().forEach(sender => sender.track && sender.track.stop());
        pc.close();
        peerConnections.current.delete(userId);
      }
      
      const leftUser = participants.find(p => p.userId === userId);
      const displayName = leftUser?.username || username || 'A user';
      
      setParticipants((prev) => {
        const updated = prev.filter((p) => p.userId !== userId);
        if (pinnedParticipantId === userId) setPinnedParticipantId(null);
        return updated;
      });
      
      toast.error(`${displayName} has left the meeting`, {
        position: "bottom-center",
        autoClose: 3000,
        style: {
          background: '#ef4444',
          color: 'white',
        }
      });
    };

    const handleChatMessage = (payload) => {
      console.log('Chat message received:', payload);
      setMessages(prev => [...prev, payload]);
    };

    const handleScreenShareStart = ({ userId }) => {
      setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: true } : p));
    };

    const handleScreenShareStop = ({ userId }) => {
      setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: false } : p));
    };

    const handleError = ({ message }) => {
      console.error('Socket error:', message);
      toast.error(message);
    };

    const handleDrawingStart = ({ from, x, y, color, tool, size }) => {
      remoteDrawingStates.current.set(from, { color, tool, size });
      const canvas = annotationCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
      ctx.moveTo(x * canvas.width, y * canvas.height);
    };

    const handleDrawingMove = ({ from, x, y }) => {
      const state = remoteDrawingStates.current.get(from);
      const canvas = annotationCanvasRef.current;
      if (!canvas || !state) return;
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = state.color;
      ctx.lineWidth = state.size;
      ctx.globalCompositeOperation = state.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.lineCap = 'round';
      ctx.lineTo(x * canvas.width, y * canvas.height);
      ctx.stroke();
    };

    const handleDrawShape = ({ from, tool, startX, startY, endX, endY, color, size }) => {
      const canvas = annotationCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.globalCompositeOperation = 'source-over';
      const sX = startX * canvas.width;
      const sY = startY * canvas.height;
      const eX = endX * canvas.width;
      const eY = endY * canvas.height;
      ctx.beginPath();
      if (tool === 'rectangle') ctx.rect(sX, sY, eX - sX, eY - sY);
      else if (tool === 'circle') {
        const radius = Math.sqrt(Math.pow(eX - sX, 2) + Math.pow(eY - sY, 2));
        ctx.arc(sX, sY, radius, 0, 2 * Math.PI);
      }
      ctx.stroke();
    };

    const handleClearCanvas = () => {
      const canvas = annotationCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const handleAIResponse = ({ user: aiUser, response, image, audio }) => {
      setAiBotInUse(true);
      setCurrentAIUser(aiUser);
      setAiResponse(response);
      if (image) setAiUploadedImage(image);
      if (audio) setAiUploadedAudio(audio);
    };

    const handleAIComplete = () => {
      setAiBotInUse(false);
      setCurrentAIUser(null);
      setAiResponse('');
      setAiUploadedImage(null);
      setAiUploadedAudio(null);
    };

    socket.on('connect', handleConnect);
    socket.on('user-joined', handleUserJoined);
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('user-left', handleUserLeft);
    socket.on('chat-message', handleChatMessage);
    socket.on('screen-share-start', handleScreenShareStart);
    socket.on('screen-share-stop', handleScreenShareStop);
    socket.on('error', handleError);
    socket.on('drawing-start', handleDrawingStart);
    socket.on('drawing-move', handleDrawingMove);
    socket.on('draw-shape', handleDrawShape);
    socket.on('clear-canvas', handleClearCanvas);
    socket.on('ai-response', handleAIResponse);
    socket.on('ai-complete', handleAIComplete);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('user-joined', handleUserJoined);
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('user-left', handleUserLeft);
      socket.off('chat-message', handleChatMessage);
      socket.off('screen-share-start', handleScreenShareStart);
      socket.off('screen-share-stop', handleScreenShareStop);
      socket.off('error', handleError);
      socket.off('drawing-start', handleDrawingStart);
      socket.off('drawing-move', handleDrawingMove);
      socket.off('draw-shape', handleDrawShape);
      socket.off('clear-canvas', handleClearCanvas);
      socket.off('ai-response', handleAIResponse);
      socket.off('ai-complete', handleAIComplete);
    };
  }, [createPeerConnection, roomId, user, getUsernameById, handleIceCandidate, participants, pinnedParticipantId]);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const initialize = async () => {
      if (!user) {
        toast.error('Please log in to join the meeting.');
        navigate('/home');
        return;
      }
      try {
        setIsLoading(true);

        const mediaConstraints = {
          video: {
            width: { ideal: 480, max: 640 },
            height: { ideal: 360, max: 480 },
            frameRate: { ideal: 15, max: 20 },
            facingMode: 'user'
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 44100
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];
        console.log('Optimized local stream initialized:', stream);

        socketRef.current = io(SERVER_URL, {
          auth: { token: user.token },
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 10000,
        });

        const cleanupSocketListeners = setupSocketListeners(socketRef.current);
        return () => {
          console.log('Cleaning up Meeting component');
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
          }
          if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop());
            screenStreamRef.current = null;
          }
          peerConnections.current.forEach(pc => pc.close());
          peerConnections.current.clear();

          connectionTimeouts.current.forEach(timeout => clearTimeout(timeout));
          connectionTimeouts.current.clear();

          signalingStates.current.clear();
          pendingOffers.current.clear();
          pendingAnswers.current.clear();

          if (aiAnimationRef.current) {
            cancelAnimationFrame(aiAnimationRef.current);
          }

          if (socketRef.current) {
            cleanupSocketListeners();
            socketRef.current.disconnect();
            socketRef.current = null;
          }
          isInitialized.current = false;
        };
      } catch (error) {
        console.error('Initialization error:', error);
        toast.error('Failed to access camera or microphone. Check permissions.');
        navigate('/home');
      } finally {
        setIsLoading(false);
      }
    };
    initialize();
  }, [roomId, user, navigate, setupSocketListeners]);

  const replaceTrack = useCallback(
    async (newTrack, isScreenShare = false) => {
      const localStream = localStreamRef.current;
      if (!localStream) return;

      const oldTrack = localStream.getVideoTracks()[0];
      if (oldTrack) oldTrack.stop();

      localStream.removeTrack(oldTrack);
      localStream.addTrack(newTrack);
      peerConnections.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(newTrack);
      });
      setParticipants((prev) => prev.map((p) => p.isLocal ? { ...p, isScreenSharing: isScreenShare } : p));
      socketRef.current?.emit(isScreenShare ? 'screen-share-start' : 'screen-share-stop', { userId: socketRef.current.id });
    },
    []
  );

  const toggleAudio = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioMuted(!audioTrack.enabled);
      setParticipants(prev => prev.map(p => p.isLocal ? { ...p, audioEnabled: audioTrack.enabled } : p));
    }
  };

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack.enabled) {
      videoTrack.enabled = false;
      setIsVideoEnabled(false);
      setParticipants(prev => prev.map(p => p.isLocal ? { ...p, videoEnabled: false } : p));
      socketRef.current?.emit('toggle-video', { enabled: false, roomId });
    } else {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 480, max: 640 },
            height: { ideal: 360, max: 480 },
            frameRate: { ideal: 15, max: 20 }
          }
        });
        const newVideoTrack = newStream.getVideoTracks()[0];
        await replaceTrack(newVideoTrack, false);
        localCameraTrackRef.current = newVideoTrack;
        setIsVideoEnabled(true);
        setParticipants(prev => prev.map(p => p.isLocal ? { ...p, videoEnabled: true } : p));
        socketRef.current?.emit('toggle-video', { enabled: true, roomId });
      } catch (err) {
        console.error('Error enabling video:', err);
        toast.error('Failed to start video.');
      }
    }
  };

  const handleScreenShare = async () => {
    if (isSharingScreen) {
      await replaceTrack(localCameraTrackRef.current, false);
      setIsSharingScreen(false);
      screenStreamRef.current?.getTracks().forEach(track => track.stop());
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        await replaceTrack(screenTrack, true);
        setIsSharingScreen(true);
        screenTrack.onended = async () => {
          await replaceTrack(localCameraTrackRef.current, false);
          setIsSharingScreen(false);
        };
      } catch (err) {
        console.error('Screen share error:', err);
        toast.error('Screen sharing failed.');
      }
    }
  };

  const handleSwipe = (direction) => {
    setGridPage((prev) => Math.max(0, Math.min(prev + direction, totalGridPages - 1)));
  };

  const handleToolbarMouseDown = (e) => {
    const toolbar = e.currentTarget.parentElement;
    const rect = toolbar.getBoundingClientRect();
    dragInfo.current = {
      isDragging: true,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    window.addEventListener('mousemove', handleToolbarMouseMove);
    window.addEventListener('mouseup', handleToolbarMouseUp);
  };

  const handleExitRoom = () => {
    try {
      socketRef.current?.emit('leave-room', { userId: socketRef.current?.id, username: user.username });
    } catch (e) {
      console.warn('Error emitting leave-room:', e);
    }
    navigate('/home');
  };

  if (isLoading) return <div className="pro-meeting-page flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  return (
    <div className="pro-meeting-page">
      <MeetingHeader 
        roomId={roomId} 
        participants={allParticipants}
        realParticipantsCount={realParticipantsCount}
        onCopyInvite={copyInviteLink}
      />
      <div className="pro-meeting-body">
        <div className={`pro-mainarea-container ${isChatOpen ? 'with-chat-sidebar' : ''}`}>
          <MeetingMainArea
            participants={displayParticipants}
            realParticipants={allParticipants}
            isSomeoneScreenSharing={isSomeoneScreenSharing}
            toolbarPosition={toolbarPosition}
            currentTool={currentTool}
            currentBrushSize={currentBrushSize}
            handleToolbarMouseDown={handleToolbarMouseDown}
            handleMouseDown={handleMouseDown}
            handleMouseMove={handleMouseMove}
            handleMouseUp={handleMouseUp}
            handleSwipe={handleSwipe}
            gridPage={gridPage}
            totalGridPages={totalGridPages}
            pinnedParticipantId={pinnedParticipantId}
            isMirroringBrowser={isMirroringBrowser}
            socketRef={socketRef}
            handleExitRoom={handleExitRoom}
            aiCanvasRef={aiCanvasRef}
            setGridPage={setGridPage}
            aiBotInUse={aiBotInUse}
            currentAIUser={currentAIUser}
            aiResponse={aiResponse}
            aiUploadedImage={aiUploadedImage}
            aiUploadedAudio={aiUploadedAudio}
            getUserAvatar={getUserAvatar}
            AIAvatar={AIAvatar}
          />
        </div>
        
        {/* Chat Sidebar - Fixed on the right */}
        {isChatOpen && (
          <div className="pro-chat-sidebar-overlay" onClick={() => setIsChatOpen(false)}>
            <div className="pro-chat-sidebar" onClick={(e) => e.stopPropagation()}>
              <Chat
                messages={messages}
                onSendMessage={(message) => {
                  const payload = {
                    userId: socketRef.current?.id,
                    username: user.username,
                    message: message,
                    timestamp: Date.now(),
                    isSystemMessage: false
                  };
                  console.log('Sending chat message:', payload);
                  socketRef.current?.emit('send-chat-message', payload);
                  setMessages(prev => [...prev, payload]);
                }}
                currentUser={{
                  userId: socketRef.current?.id,
                  username: user.username
                }}
                onClose={() => setIsChatOpen(false)}
              />
            </div>
          </div>
        )}
        
        {/* Popup Sidebars for Participants and AI */}
        {(isParticipantsOpen || isAIPopupOpen) && (
          <div className="pro-sidebar-overlay" onClick={() => {
            if (isParticipantsOpen) setIsParticipantsOpen(false);
            if (isAIPopupOpen) setIsAIPopupOpen(false);
          }}>
            {isParticipantsOpen && (
              <div className="pro-sidebar-popup" onClick={(e) => e.stopPropagation()}>
                <MeetingSidebar
                  isChatOpen={isChatOpen}
                  isParticipantsOpen={isParticipantsOpen}
                  messages={messages}
                  user={user}
                  onSendMessage={(payload) => {
                    socketRef.current?.emit('send-chat-message', payload);
                    setMessages((prev) => [...prev, payload]);
                  }}
                  onCloseChat={() => setIsChatOpen(false)}
                  participants={allParticipants}
                  aiParticipant={aiParticipant}
                  onCloseParticipants={() => setIsParticipantsOpen(false)}
                  roomId={roomId}
                  getUserAvatar={getUserAvatar}
                  AIAvatar={AIAvatar}
                />
              </div>
            )}

            {isAIPopupOpen && (
              <div className="pro-sidebar-popup" onClick={(e) => e.stopPropagation()}>
                <AIPopup
                  onClose={() => setIsAIPopupOpen(false)}
                  onAIRequest={handleAIRequest}
                  onAIComplete={handleAIComplete}
                  aiBotInUse={aiBotInUse}
                  currentAIUser={currentAIUser}
                  aiResponse={aiResponse}
                  aiUploadedImage={aiUploadedImage}
                  aiUploadedAudio={aiUploadedAudio}
                  user={user}
                />
              </div>
            )}
          </div>
        )}
      </div>
      
      <MeetingControls
        isAudioMuted={isAudioMuted}
        toggleAudio={toggleAudio}
        isVideoEnabled={isVideoEnabled}
        toggleVideo={toggleVideo}
        isSharingScreen={isSharingScreen}
        handleScreenShare={handleScreenShare}
        isChatOpen={isChatOpen}
        setIsChatOpen={setIsChatOpen}
        isParticipantsOpen={isParticipantsOpen}
        setIsParticipantsOpen={setIsParticipantsOpen}
        isAIPopupOpen={isAIPopupOpen}
        setIsAIPopupOpen={setIsAIPopupOpen}
        handleExitRoom={handleExitRoom}
        onCopyInvite={copyInviteLink}
      />
      
      {/* Hidden canvas for AI animation */}
      <canvas
        ref={aiCanvasRef}
        style={{
          position: 'absolute',
          top: -1000,
          left: -1000,
          width: 640,
          height: 480
        }}
      />
    </div>
  );
};

export { getUserAvatar, AIAvatar };
export default Meeting;