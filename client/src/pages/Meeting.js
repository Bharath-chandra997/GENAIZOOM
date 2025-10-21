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

const getUserAvatar = (user, size = 40) => {
  if (user?.profilePicture) {
    return user.profilePicture;
  }
  
  const initials = user?.username?.charAt(0)?.toUpperCase() || 'U';
  const color = getColorForId(user?.socketId || user?.username);
  
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
      AI
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

  // FIXED: AI has socketId
  const [aiParticipant] = useState({
    socketId: 'ai-assistant',
    userId: 'ai-assistant',
    username: 'AI Assistant',
    isLocal: false,
    isHost: false,
    videoEnabled: true,
    audioEnabled: false,
    isScreenSharing: false,
    isAI: true,
    stream: null,
    profilePicture: null
  });

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
  const aiCanvasRef = useRef(null);
  const aiAnimationRef = useRef(null);
  const connectionTimeouts = useRef(new Map());
  const iceServersCache = useRef(null);
  const lastIceFetch = useRef(0);

  const isMirroringBrowser = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream, []);

  const allParticipants = useMemo(() => [...participants], [participants]);
  const participantsWithAI = useMemo(() => [aiParticipant, ...participants], [participants]);
  const realParticipantsCount = useMemo(() => participants.length, [participants]);

  const isSomeoneScreenSharing = useMemo(
    () => allParticipants.some(p => p.isScreenSharing),
    [allParticipants]
  );

  const displayParticipants = participantsWithAI;
  const totalGridPages = useMemo(() => Math.max(1, Math.ceil(displayParticipants.length / 4)), [displayParticipants.length]);

  const getUsernameById = useCallback((socketId) => {
    const participant = allParticipants.find(p => p.socketId === socketId);
    return participant ? (participant.isLocal ? user.username : participant.username) : 'Another user';
  }, [allParticipants, user.username]);

  const copyInviteLink = useCallback(() => {
    const inviteLink = `${window.location.origin}/join/${roomId}`;
    navigator.clipboard.writeText(inviteLink)
      .then(() => toast.success('Invite link copied!', { position: "bottom-center", autoClose: 3000 }))
      .catch(() => toast.error('Failed to copy invite link'));
  }, [roomId]);

  // AI Animation (unchanged)
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
      if (aiAnimationRef.current) cancelAnimationFrame(aiAnimationRef.current);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [aiBotInUse, currentAIUser]);

  useEffect(() => {
    const cleanup = initializeAiAnimation();
    return cleanup;
  }, [initializeAiAnimation]);

  const handleAIRequest = useCallback(async (imageFile, audioFile) => {
    if (aiBotInUse) {
      toast.error('AI Bot is currently in use by another user');
      return;
    }

    setAiBotInUse(true);
    setCurrentAIUser(user.username);
    setAiUploadedImage(imageFile);
    setAiUploadedAudio(audioFile);

    setTimeout(() => {
      const response = `Hello ${user.username}! I've processed your ${imageFile ? 'image' : ''}${imageFile && audioFile ? ' and ' : ''}${audioFile ? 'audio' : ''}. This is a simulated AI response.`;
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
      const { data } = await axios.get(`${SERVER_URL}/ice-servers`, { timeout: 5000 });
      iceServersCache.current = data;
      lastIceFetch.current = now;
      return data;
    } catch (error) {
      const fallback = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];
      iceServersCache.current = fallback;
      lastIceFetch.current = now;
      return fallback;
    }
  }, []);

  const handleIceCandidate = useCallback(({ from, candidate }) => {
    const pc = peerConnections.current.get(from);
    if (pc && pc.remoteDescription && candidate) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
    }
  }, []);

  // FIXED: ontrack now handles missing participant
  const createPeerConnection = useCallback(async (remoteSocketId) => {
    if (peerConnections.current.has(remoteSocketId)) {
      return peerConnections.current.get(remoteSocketId);
    }

    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    const timeout = setTimeout(() => {
      if (pc.connectionState === 'connecting') {
        pc.close();
        peerConnections.current.delete(remoteSocketId);
        connectionTimeouts.current.delete(remoteSocketId);
      }
    }, 15000);
    connectionTimeouts.current.set(remoteSocketId, timeout);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // FIXED: Ensure stream is attached even if participant not yet in state
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;

      clearTimeout(connectionTimeouts.current.get(remoteSocketId));
      connectionTimeouts.current.delete(remoteSocketId);

      setParticipants(prev => {
        const exists = prev.some(p => p.socketId === remoteSocketId);
        if (!exists) {
          return [...prev, {
            socketId: remoteSocketId,
            userId: remoteSocketId,
            username: 'Connecting...',
            stream,
            isLocal: false,
            isHost: false,
            videoEnabled: true,
            audioEnabled: true,
            isScreenSharing: false,
          }];
        }
        return prev.map(p => p.socketId === remoteSocketId ? { ...p, stream } : p);
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('ice-candidate', { to: remoteSocketId, candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearTimeout(connectionTimeouts.current.get(remoteSocketId));
        connectionTimeouts.current.delete(remoteSocketId);
        toast.success(`Connected to ${getUsernameById(remoteSocketId)}`);
      } else if (pc.connectionState === 'failed') {
        pc.close();
        peerConnections.current.delete(remoteSocketId);
        setParticipants(prev => prev.filter(p => p.socketId !== remoteSocketId));
        toast.error(`Failed to connect to ${getUsernameById(remoteSocketId)}`);
      }
    };

    peerConnections.current.set(remoteSocketId, pc);
    return pc;
  }, [getIceServers, getUsernameById]);

  const setupSocketListeners = useCallback((socket) => {
    const handleConnect = () => {
      socket.emit('join-room', {
        roomId,
        username: user.username,
        isReconnect: false
      }, (otherUsers) => {
        const isHost = otherUsers.length === 0;
        const localParticipant = {
          socketId: socket.id,
          userId: socket.id,
          username: `${user.username} (You)`,
          stream: localStreamRef.current,
          isLocal: true,
          isHost,
          videoEnabled: true,
          audioEnabled: true,
          isScreenSharing: false,
        };
        const remoteParticipants = otherUsers.map(u => ({
          socketId: u.userId,
          userId: u.userId,
          username: u.username,
          stream: null,
          isLocal: false,
          isHost: u.isHost || false,
          videoEnabled: true,
          audioEnabled: true,
          isScreenSharing: false,
        }));
        setParticipants([localParticipant, ...remoteParticipants]);
        setIsLoading(false);

        otherUsers.forEach(async (user) => {
          const pc = await createPeerConnection(user.userId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('offer', { to: user.userId, offer });
        });
      });
    };

    // FIXED: Use socketId
    const handleUserJoined = async ({ userId, username, isHost }) => {
      setParticipants(prev => {
        if (prev.some(p => p.socketId === userId)) return prev;
        return [...prev, {
          socketId: userId,
          userId: userId,
          username,
          stream: null,
          isLocal: false,
          isHost,
          videoEnabled: true,
          audioEnabled: true,
          isScreenSharing: false,
        }];
      });

      toast.info(`${username} joined the meeting`);

      try {
        const pc = await createPeerConnection(userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: userId, offer });
      } catch (err) {
        console.error('Error in user-joined:', err);
      }
    };

    const handleOffer = async ({ from, offer }) => {
      setParticipants(prev => {
        if (prev.some(p => p.socketId === from)) return prev;
        return [...prev, {
          socketId: from,
          userId: from,
          username: 'User',
          stream: null,
          isLocal: false,
          isHost: false,
          videoEnabled: true,
          audioEnabled: true,
          isScreenSharing: false,
        }];
      });

      const pc = await createPeerConnection(from);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { to: from, answer });
    };

    const handleAnswer = async ({ from, answer }) => {
      const pc = peerConnections.current.get(from);
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    };

    const handleUserLeft = ({ userId }) => {
      peerConnections.current.get(userId)?.close();
      peerConnections.current.delete(userId);
      setParticipants(prev => prev.filter(p => p.socketId !== userId));
      if (pinnedParticipantId === userId) setPinnedParticipantId(null);
      toast.error('A user left the meeting');
    };

    const handleChatMessage = (payload) => {
      setMessages(prev => [...prev, payload]);
    };

    const handleScreenShareStart = ({ userId }) => {
      setParticipants(prev => prev.map(p => p.socketId === userId ? { ...p, isScreenSharing: true } : p));
    };

    const handleScreenShareStop = ({ userId }) => {
      setParticipants(prev => prev.map(p => p.socketId === userId ? { ...p, isScreenSharing: false } : p));
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
    socket.on('pin-participant', ({ participantId }) => setPinnedParticipantId(participantId));
    socket.on('unpin-participant', () => setPinnedParticipantId(null));
    socket.on('ai-response', ({ user: aiUser, response, image, audio }) => {
      setAiBotInUse(true);
      setCurrentAIUser(aiUser);
      setAiResponse(response);
      if (image) setAiUploadedImage(image);
      if (audio) setAiUploadedAudio(audio);
    });
    socket.on('ai-complete', handleAIComplete);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('user-joined', handleUserJoined);
      // ... remove others
    };
  }, [createPeerConnection, roomId, user, getUsernameById, handleAIComplete]);

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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 480 }, height: { ideal: 360 } },
          audio: { echoCancellation: true, noiseSuppression: true }
        });
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];

        socketRef.current = io(SERVER_URL, {
          auth: { token: user.token },
          transports: ['websocket']
        });

        setupSocketListeners(socketRef.current);
      } catch (error) {
        toast.error('Failed to access camera/microphone');
        navigate('/home');
      }
    };
    initialize();
  }, [user, navigate, setupSocketListeners]);

  const replaceTrack = useCallback(async (newTrack, isScreenShare = false) => {
    const localStream = localStreamRef.current;
    if (!localStream) return;
    const oldTrack = localStream.getVideoTracks()[0];
    if (oldTrack) oldTrack.stop();
    localStream.removeTrack(oldTrack);
    localStream.addTrack(newTrack);
    peerConnections.current.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(newTrack);
    });
    setParticipants(prev => prev.map(p => p.isLocal ? { ...p, isScreenSharing } : p));
    socketRef.current?.emit(isScreenShare ? 'screen-share-start' : 'screen-share-stop', { userId: socketRef.current.id });
  }, []);

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
    } else {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newVideoTrack = newStream.getVideoTracks()[0];
      await replaceTrack(newVideoTrack);
      setIsVideoEnabled(true);
      setParticipants(prev => prev.map(p => p.isLocal ? { ...p, videoEnabled: true } : p));
    }
  };

  const handleScreenShare = async () => {
    if (isSharingScreen) {
      await replaceTrack(localCameraTrackRef.current);
      setIsSharingScreen(false);
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
    } else {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];
      await replaceTrack(screenTrack, true);
      setIsSharingScreen(true);
      screenTrack.onended = () => handleScreenShare();
    }
  };

  const handleSwipe = (direction) => {
    setGridPage(prev => Math.max(0, Math.min(prev + direction, totalGridPages - 1)));
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
    socketRef.current?.emit('leave-room');
    navigate('/home');
  };

  // FIXED: Use socketId for pinning
  const handlePinParticipant = (socketId) => {
    if (pinnedParticipantId === socketId) {
      setPinnedParticipantId(null);
      socketRef.current?.emit('unpin-participant');
    } else {
      setPinnedParticipantId(socketId);
      socketRef.current?.emit('pin-participant', { participantId: socketId });
    }
  };

  if (isLoading) return <div className="pro-meeting-page flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  return (
    <div className="pro-meeting-page">
      <MeetingHeader roomId={roomId} realParticipantsCount={realParticipantsCount} onCopyInvite={copyInviteLink} />
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
            handlePinParticipant={handlePinParticipant}
            isMirroringBrowser={isMirroringBrowser}
            socketRef={socketRef}
            handleExitRoom={handleExitRoom}
            aiCanvasRef={aiCanvasRef}
            setGridPage={setGridPage}
            aiBotavnoInUse={aiBotInUse}
            currentAIUser={currentAIUser}
            aiResponse={aiResponse}
            aiUploadedImage={aiUploadedImage}
            aiUploadedAudio={aiUploadedAudio}
            getUserAvatar={getUserAvatar}
            AIAvatar={AIAvatar}
          />
        </div>

        {/* Chat & Sidebars unchanged */}
        {isChatOpen && (
          <div className="pro-chat-sidebar-overlay" onClick={() => setIsChatOpen(false)}>
            <div className="pro-chat-sidebar" onClick={e => e.stopPropagation()}>
              <Chat
                messages={messages}
                onSendMessage={(message) => {
                  const payload = { socketId: socketRef.current.id, username: user.username, message, timestamp: Date.now() };
                  socketRef.current?.emit('send-chat-message', payload);
                  setMessages(prev => [...prev, payload]);
                }}
                currentUser={{ socketId: socketRef.current.id, username: user.username }}
                onClose={() => setIsChatOpen(false)}
              />
            </div>
          </div>
        )}

        {(isParticipantsOpen || isAIPopupOpen) && (
          <div className="pro-sidebar-overlay" onClick={() => { setIsParticipantsOpen(false); setIsAIPopupOpen(false); }}>
            {isParticipantsOpen && (
              <div className="pro-sidebar-popup" onClick={e => e.stopPropagation()}>
                <MeetingSidebar
                  isChatOpen={isChatOpen}
                  isParticipantsOpen={isParticipantsOpen}
                  messages={messages}
                  user={user}
                  onSendMessage={(p) => { socketRef.current?.emit('send-chat-message', p); setMessages(prev => [...prev, p]); }}
                  onCloseChat={() => setIsChatOpen(false)}
                  participants={allParticipants}
                  onCloseParticipants={() => setIsParticipantsOpen(false)}
                  roomId={roomId}
                  getUserAvatar={getUserAvatar}
                  AIAvatar={AIAvatar}
                />
              </div>
            )}
            {isAIPopupOpen && (
              <div className="pro-sidebar-popup" onClick={e => e.stopPropagation()}>
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

      <canvas ref={aiCanvasRef} style={{ position: 'absolute', top: -1000, left: -1000, width: 640, height: 480 }} />
    </div>
  );
};

export { getUserAvatar, AIAvatar };
export default Meeting;