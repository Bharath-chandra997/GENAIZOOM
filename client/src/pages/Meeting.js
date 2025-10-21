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
    return (
      <img
        src={user.profilePicture}
        alt={`${user.username}'s avatar`}
        style={{ width: size, height: size, borderRadius: '50%' }}
        onError={(e) => {
          e.target.style.display = 'none'; // Hide broken image
          e.target.nextSibling.style.display = 'flex'; // Show fallback
        }}
      />
    );
  }

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
        fontSize: size * 0.4,
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
        position: 'relative',
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
          border: '2px solid white',
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

  const [aiParticipant] = useState({
    userId: 'ai-assistant',
    username: 'AI Assistant',
    isLocal: false,
    isHost: false,
    videoEnabled: true,
    audioEnabled: false,
    isScreenSharing: false,
    isAI: true,
    isHandRaised: false,
    stream: null,
    socketId: 'ai-assistant',
    color: '#3B82F6',
    profilePicture: null,
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
  const signalingStates = useRef(new Map());
  const pendingOffers = useRef(new Map());
  const pendingAnswers = useRef(new Map());

  const isMirroringBrowser = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream, []);

  const allParticipants = useMemo(() => [...participants], [participants]);
  const participantsWithAI = useMemo(() => [aiParticipant, ...participants], [aiParticipant, participants]);
  const realParticipantsCount = useMemo(() => participants.length, [participants]);
  const defaultMainParticipant = useMemo(() => {
    const screenSharer = allParticipants.find((p) => p.isScreenSharing);
    if (screenSharer) return screenSharer;
    const host = allParticipants.find((p) => p.isHost);
    if (host) return host;
    return allParticipants[0] || null;
  }, [allParticipants]);
  const isSomeoneScreenSharing = useMemo(() => allParticipants.some((p) => p.isScreenSharing), [allParticipants]);
  const displayParticipants = participantsWithAI;
  const totalGridPages = useMemo(() => Math.max(1, Math.ceil(displayParticipants.length / 4)), [displayParticipants.length]);

  const getUsernameById = useCallback(
    (userId) => {
      const participant = allParticipants.find((p) => p.userId === userId);
      return participant ? (participant.isLocal ? user.username : participant.username) : 'Another user';
    },
    [allParticipants, user.username]
  );

  const copyInviteLink = useCallback(() => {
    const inviteLink = `${window.location.origin}/join/${roomId}`;
    navigator.clipboard
      .writeText(inviteLink)
      .then(() => {
        toast.success('Invite link copied to clipboard!', {
          position: 'bottom-center',
          autoClose: 3000,
        });
      })
      .catch(() => {
        toast.error('Failed to copy invite link', {
          position: 'bottom-center',
          autoClose: 3000,
        });
      });
  }, [roomId]);

  const initializeAnnotationCanvas = useCallback(() => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      if (canvas) {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

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
          angle: Math.random() * Math.PI * 2,
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

        particles.slice(index + 1).forEach((otherParticle) => {
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
      ctx.fillText(
        aiBotInUse ? `In use by ${currentAIUser}` : 'Ready to help',
        canvas.width / 2,
        canvas.height / 2 + 15
      );

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

  useEffect(() => {
    if (isSharingScreen) {
      const cleanup = initializeAnnotationCanvas();
      return cleanup;
    }
  }, [isSharingScreen, initializeAnnotationCanvas]);

  const handleAIRequest = useCallback(
    async (imageFile, audioFile) => {
      if (aiBotInUse) {
        toast.error('AI Bot is currently in use by another user', {
          position: 'bottom-center',
        });
        return;
      }

      setAiBotInUse(true);
      setCurrentAIUser(user.username);
      setAiUploadedImage(imageFile);
      setAiUploadedAudio(audioFile);

      setTimeout(() => {
        const response = `Hello ${user.username}! I've processed your ${imageFile ? 'image' : ''}${
          imageFile && audioFile ? ' and ' : ''
        }${audioFile ? 'audio' : ''}. This is a simulated AI response.`;
        setAiResponse(response);

        socketRef.current?.emit('ai-response', {
          user: user.username,
          response,
          image: imageFile ? URL.createObjectURL(imageFile) : null,
          audio: audioFile ? URL.createObjectURL(imageFile) : null,
        });
      }, 3000);
    },
    [aiBotInUse, user.username]
  );

  const handleAIComplete = useCallback(() => {
    setAiBotInUse(false);
    setCurrentAIUser(null);
    setAiResponse('');
    setAiUploadedImage(null);
    setAiUploadedAudio(null);
    socketRef.current?.emit('ai-complete');
  }, []);

  const handleToolbarMouseMove = useCallback(
    (e) => {
      if (dragInfo.current.isDragging) {
        setToolbarPosition({
          x: e.clientX - dragInfo.current.offsetX,
          y: e.clientY - dragInfo.current.offsetY,
        });
      }
    },
    []
  );

  const handleToolbarMouseUp = useCallback(() => {
    dragInfo.current.isDragging = false;
    window.removeEventListener('mousemove', handleToolbarMouseMove);
    window.removeEventListener('mouseup', handleToolbarMouseUp);
  }, [handleToolbarMouseMove]);

  const handleMouseDown = useCallback(
    (e) => {
      const canvas = annotationCanvasRef.current;
      if (!canvas || !socketRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      drawingStateRef.current = { isDrawing: true, startX: x, startY: y };

      if (currentTool === 'pen' || currentTool === 'eraser') {
        const myColor = getColorForId(socketRef.current.id);
        const payload = { x: x / canvas.width, y: y / canvas.height, color: myColor, tool: currentTool, size: currentBrushSize };
        socketRef.current.emit('drawing-start', payload);
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = myColor;
        ctx.lineWidth = currentBrushSize;
        ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    },
    [currentTool, currentBrushSize]
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!drawingStateRef.current.isDrawing || !e.buttons || !socketRef.current) return;
      const canvas = annotationCanvasRef.current;
      if (!canvas) return;
      if (currentTool === 'pen' || currentTool === 'eraser') {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        socketRef.current.emit('drawing-move', { x: x / canvas.width, y: y / canvas.height });
        const ctx = canvas.getContext('2d');
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    },
    [currentTool]
  );

  const handleMouseUp = useCallback(
    (e) => {
      if (!drawingStateRef.current.isDrawing || !socketRef.current) return;
      const canvas = annotationCanvasRef.current;
      if (!canvas) return;
      if (currentTool === 'rectangle' || currentTool === 'circle') {
        const rect = canvas.getBoundingClientRect();
        const { startX, startY } = drawingStateRef.current;
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;
        const myColor = getColorForId(socketRef.current.id);
        const payload = {
          tool: currentTool,
          startX: startX / canvas.width,
          startY: startY / canvas.height,
          endX: endX / canvas.width,
          endY: endY / canvas.height,
          color: myColor,
          size: currentBrushSize,
        };
        socketRef.current.emit('draw-shape', payload);
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
    },
    [currentTool, currentBrushSize]
  );

  const getIceServers = useCallback(async () => {
    const now = Date.now();
    const cacheExpiry = 5 * 60 * 1000;

    if (iceServersCache.current && now - lastIceFetch.current < cacheExpiry) {
      return iceServersCache.current;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const { data } = await axios.get(`${SERVER_URL}/ice-servers`, {
        signal: controller.signal,
        timeout: 2000,
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

  const handleIceCandidate = useCallback(
    ({ from, candidate }) => {
      const pc = peerConnections.current.get(from);
      if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
          console.warn('Error adding ICE candidate:', err);
        });
      }
    },
    []
  );

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
        rtcpMuxPolicy: 'require',
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
      }, 8000);

      connectionTimeouts.current.set(remoteSocketId, connectionTimeout);

      pc.ontrack = (event) => {
        clearTimeout(connectionTimeout);
        connectionTimeouts.current.delete(remoteSocketId);
        setParticipants((prev) =>
          prev.map((p) => (p.userId === remoteSocketId ? { ...p, stream: event.streams[0] } : p))
        );
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit('ice-candidate', { to: remoteSocketId, candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('Peer connection state:', pc.connectionState, 'for user:', remoteSocketId);
        if (pc.connectionState === 'connected') {
          clearTimeout(connectionTimeout);
          connectionTimeouts.current.delete(remoteSocketId);
          console.log('Successfully connected to user:', remoteSocketId);
        } else if (pc.connectionState === 'disconnected') {
          console.log('Connection disconnected for user:', remoteSocketId);
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
        }
      };

      peerConnections.current.set(remoteSocketId, pc);
      return pc;
    },
    [getIceServers]
  );

  const handleToggleVideo = useCallback(
    ({ userId, enabled }) => {
      console.log('Toggle video for user:', userId, enabled);
      setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, videoEnabled: enabled } : p)));
    },
    []
  );

  const handleToggleAudio = useCallback(
    ({ userId, enabled }) => {
      console.log('Toggle audio for user:', userId, enabled);
      setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, audioEnabled: enabled } : p)));
    },
    []
  );

  const handleRaiseHand = useCallback(
    ({ userId }) => {
      console.log('User raised hand:', userId);
      setParticipants((prev) =>
        prev.map((p) => (p.userId === userId ? { ...p, isHandRaised: !p.isHandRaised } : p))
      );
    },
    []
  );

  const handlePinParticipant = useCallback(
    (arg) => {
      const userId = typeof arg === 'string' ? arg : arg.userId;
      if (!socketRef.current) {
        console.warn('Socket not connected, cannot pin participant');
        return;
      }
      socketRef.current.emit('pin-participant', { userId });
      setPinnedParticipantId(userId);
      console.log('Pin participant:', userId);
    },
    [socketRef]
  );

  const handleUnpinParticipant = useCallback(() => {
    if (!socketRef.current) {
      console.warn('Socket not connected, cannot unpin participant');
      return;
    }
    socketRef.current.emit('unpin-participant');
    setPinnedParticipantId(null);
    console.log('Unpin participant');
  }, [socketRef]);

  const handleSessionRestored = useCallback(
    (data) => {
      console.log('Session restored:', data);
      if (data.chatMessages) {
        setMessages(data.chatMessages);
      }
    },
    []
  );

  const setupSocketListeners = useCallback(
    (socket) => {
      const handleConnect = () => {
        console.log('✅ Socket connected:', socket.id);
        socket.emit(
          'join-room',
          {
            roomId,
            username: user.username,
            isReconnect: false,
          },
          (otherUsers, sessionData) => {
            console.log('Join room callback - other users:', otherUsers.length, 'sessionData:', !!sessionData);
            const isHost = otherUsers.length === 0;
            const remoteParticipants = otherUsers.map((u) => ({
              userId: u.userId,
              username: u.username,
              stream: null,
              isLocal: false,
              isHost: u.isHost || false,
              videoEnabled: true,
              audioEnabled: true,
              isScreenSharing: false,
              isHandRaised: false,
              socketId: u.userId,
              profilePicture: u.profilePicture,
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
              isHandRaised: false,
              socketId: socket.id,
              profilePicture: user.profilePicture,
            };
            setParticipants([localParticipant, ...remoteParticipants]);
            if (sessionData?.chatMessages) {
              setMessages(sessionData.chatMessages);
            }
            setIsLoading(false);
          }
        );
      };

      const handleUserJoined = async ({ userId, username, isHost, isReconnect, profilePicture }) => {
        console.log('User joined:', { userId, username, isHost, isReconnect });
        if (isReconnect) return;
        setParticipants((prev) => {
          if (prev.some((p) => p.userId === userId)) return prev;
          return [
            ...prev,
            {
              userId,
              username,
              stream: null,
              isLocal: false,
              isHost,
              videoEnabled: true,
              audioEnabled: true,
              isScreenSharing: false,
              isHandRaised: false,
              socketId: userId,
              profilePicture,
            },
          ];
        });
        try {
          const pc = await createPeerConnection(userId);
          const currentState = signalingStates.current.get(userId);
          if (currentState === 'new' || currentState === 'stable') {
            if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
            }
            signalingStates.current.set(userId, 'have-local-offer');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            pendingOffers.current.set(userId, offer);
            socket.emit('offer', { to: userId, offer, username: user.username });
            console.log('Offer sent to new user:', userId);
          }
        } catch (err) {
          console.error('Error in user-joined handler:', err);
          toast.error(`Failed to connect to user ${username}.`);
        }
      };

      const handleOffer = async ({ from, offer, username }) => {
        console.log('Offer received from:', { from, username });
        setParticipants((prev) => {
          if (prev.some((p) => p.userId === from)) return prev;
          return [
            ...prev,
            {
              userId: from,
              username,
              stream: null,
              isLocal: false,
              isHost: false,
              videoEnabled: true,
              audioEnabled: true,
              isScreenSharing: false,
              isHandRaised: false,
              socketId: from,
              profilePicture: null,
            },
          ];
        });
        try {
          const pc = await createPeerConnection(from);
          const currentState = signalingStates.current.get(from);
          if (currentState === 'new' || currentState === 'stable') {
            if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
            }
            signalingStates.current.set(from, 'have-remote-offer');
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            signalingStates.current.set(from, 'stable');
            socket.emit('answer', { to: from, answer });
            console.log('Answer sent to:', from);
          }
        } catch (err) {
          console.error('Error in offer handler:', err);
          toast.error(`Failed to process offer from ${username}.`);
        }
      };

      const handleAnswer = ({ from, answer }) => {
        console.log('Answer received from:', from);
        const pc = peerConnections.current.get(from);
        const currentState = signalingStates.current.get(from);
        if (pc && currentState === 'have-local-offer') {
          pc.setRemoteDescription(new RTCSessionDescription(answer))
            .then(() => {
              signalingStates.current.set(from, 'stable');
              pendingOffers.current.delete(from);
              console.log('Remote description set for:', from);
            })
            .catch((err) => {
              console.error('Error setting remote description:', err);
              signalingStates.current.set(from, 'stable');
              pendingOffers.current.delete(from);
            });
        }
      };

      const handleUserLeft = ({ userId, username }) => {
        console.log('User left:', { userId, username });
        const pc = peerConnections.current.get(userId);
        if (pc) {
          pc.getSenders().forEach((sender) => sender.track && sender.track.stop());
          pc.close();
          peerConnections.current.delete(userId);
        }
        setParticipants((prev) => {
          const updated = prev.filter((p) => p.userId !== userId);
          if (pinnedParticipantId === userId) setPinnedParticipantId(null);
          return updated;
        });

        const leftUser = participants.find((p) => p.userId === userId);
        const displayName = leftUser?.username || username || 'A user';

        toast.error(`${displayName} has left the meeting`, {
          position: 'bottom-center',
          autoClose: 3000,
          style: {
            background: '#ef4444',
            color: 'white',
          },
        });
      };

      const handleChatMessage = (payload) => {
        console.log('Chat message received:', payload);
        setMessages((prev) => [...prev, payload]);
      };

      const handleScreenShareStart = ({ userId }) => {
        console.log('Screen share started by:', userId);
        setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, isScreenSharing: true } : p)));
      };

      const handleScreenShareStop = ({ userId }) => {
        console.log('Screen share stopped by:', userId);
        setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, isScreenSharing: false } : p)));
      };

      const handleError = ({ message }) => {
        console.error('Server error:', message);
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
      socket.on('toggle-video', handleToggleVideo);
      socket.on('toggle-audio', handleToggleAudio);
      socket.on('raise-hand', handleRaiseHand);
      socket.on('pin-participant', handlePinParticipant);
      socket.on('unpin-participant', handleUnpinParticipant);
      socket.on('session-restored', handleSessionRestored);

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
        socket.off('toggle-video', handleToggleVideo);
        socket.off('toggle-audio', handleToggleAudio);
        socket.off('raise-hand', handleRaiseHand);
        socket.off('pin-participant', handlePinParticipant);
        socket.off('unpin-participant', handleUnpinParticipant);
        socket.off('session-restored', handleSessionRestored);
      };
    },
    [
      roomId,
      user.username,
      createPeerConnection,
      handleIceCandidate,
      handleToggleVideo,
      handleToggleAudio,
      handleRaiseHand,
      handlePinParticipant,
      handleUnpinParticipant,
      handleSessionRestored,
    ]
  );

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    let mounted = true;
    let socketCleanup = () => {};

    const initialize = async () => {
      if (!user) {
        if (mounted) {
          toast.error('Please log in to join the meeting.');
          navigate('/home');
        }
        return;
      }
      try {
        if (mounted) setIsLoading(true);

        const mediaConstraints = {
          video: {
            width: { ideal: 480, max: 640 },
            height: { ideal: 360, max: 480 },
            frameRate: { ideal: 15, max: 20 },
            facingMode: 'user',
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 44100,
          },
        };

        try {
          const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
          localStreamRef.current = stream;
          localCameraTrackRef.current = stream.getVideoTracks()[0];
          console.log('Optimized local stream initialized:', stream);
        } catch (error) {
          console.error('Media device error:', error);
          if (error.name === 'NotAllowedError') {
            toast.error('Camera or microphone access denied. Please check permissions.');
          } else if (error.name === 'NotFoundError') {
            toast.error('No camera or microphone found.');
          } else {
            toast.error('Failed to access camera or microphone.');
          }
          if (mounted) navigate('/home');
          return;
        }

        socketRef.current = io(SERVER_URL, {
          auth: { token: user.token },
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: 3,
          reconnectionDelay: 500,
          reconnectionDelayMax: 2000,
          timeout: 5000,
          forceNew: true,
        });

        socketCleanup = setupSocketListeners(socketRef.current);

        socketRef.current.on('connect_error', (error) => {
          console.error('Socket.IO connection error:', error);
          toast.error(`Connection failed: ${error.message}`);
        });

        if (mounted) setIsLoading(false);
      } catch (error) {
        console.error('Initialization error:', error);
        if (mounted) toast.error('Failed to initialize meeting.');
        if (mounted) navigate('/home');
      }
    };

    initialize();

    return () => {
      mounted = false;
      console.log('Cleaning up Meeting component');
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
      }
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();

      connectionTimeouts.current.forEach((timeout) => clearTimeout(timeout));
      connectionTimeouts.current.clear();

      signalingStates.current.clear();
      pendingOffers.current.clear();
      pendingAnswers.current.clear();

      if (aiAnimationRef.current) {
        cancelAnimationFrame(aiAnimationRef.current);
      }

      if (socketRef.current) {
        socketCleanup();
        socketRef.current.off('connect_error');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      isInitialized.current = false;
    };
  }, [user, navigate, roomId, setupSocketListeners]);

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
        if (sender) {
          sender.replaceTrack(newTrack).catch((err) => {
            console.error('Error replacing track:', err);
            toast.error('Failed to replace video track.');
          });
        }
      });

      socketRef.current?.emit('toggle-video', {
        userId: socketRef.current.id,
        enabled: !isScreenShare && isVideoEnabled,
      });
    },
    [isVideoEnabled]
  );

  const toggleAudio = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;

    audioTrack.enabled = !audioTrack.enabled;
    setIsAudioMuted(!audioTrack.enabled);
    socketRef.current?.emit('toggle-audio', {
      userId: socketRef.current.id,
      enabled: audioTrack.enabled,
    });
    console.log('Audio toggled:', audioTrack.enabled ? 'On' : 'Off');
  }, []);

  const toggleVideo = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;

    videoTrack.enabled = !videoTrack.enabled;
    setIsVideoEnabled(videoTrack.enabled);
    socketRef.current?.emit('toggle-video', {
      userId: socketRef.current.id,
      enabled: videoTrack.enabled,
    });
    console.log('Video toggled:', videoTrack.enabled ? 'On' : 'Off');
  }, []);

  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 15, max: 30 },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
        },
        audio: false,
      });

      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];

      screenTrack.onended = () => {
        stopScreenShare();
      };

      await replaceTrack(screenTrack, true);
      setIsSharingScreen(true);
      socketRef.current?.emit('screen-share-start', { userId: socketRef.current.id });
      console.log('Screen sharing started');
    } catch (err) {
      console.error('Error starting screen share:', err);
      if (err.name === 'NotAllowedError') {
        toast.error('Screen sharing permission denied.');
      } else {
        toast.error('Failed to start screen sharing.');
      }
    }
  }, [replaceTrack]);

  const stopScreenShare = useCallback(async () => {
    if (!screenStreamRef.current || !localStreamRef.current) return;

    screenStreamRef.current.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 480, max: 640 },
          height: { ideal: 360, max: 480 },
          frameRate: { ideal: 15, max: 20 },
          facingMode: 'user',
        },
      });
      const videoTrack = stream.getVideoTracks()[0];
      localCameraTrackRef.current = videoTrack;
      await replaceTrack(videoTrack);
      setIsSharingScreen(false);
      socketRef.current?.emit('screen-share-stop', { userId: socketRef.current.id });
      console.log('Screen sharing stopped');
    } catch (err) {
      console.error('Error stopping screen share:', err);
      if (err.name === 'NotAllowedError') {
        toast.error('Camera access denied after screen sharing.');
      } else {
        toast.error('Failed to restore camera after screen sharing.');
      }
    }
  }, [replaceTrack]);

  const handleLeaveMeeting = useCallback(() => {
    console.log('Leaving meeting');
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();
    socketRef.current?.disconnect();
    socketRef.current = null;
    navigate('/home');
  }, [navigate]);

  const toggleChat = useCallback(() => {
    setIsChatOpen((prev) => !prev);
    if (isParticipantsOpen) setIsParticipantsOpen(false);
    if (isAIPopupOpen) setIsAIPopupOpen(false);
  }, [isParticipantsOpen, isAIPopupOpen]);

  const toggleParticipants = useCallback(() => {
    setIsParticipantsOpen((prev) => !prev);
    if (isChatOpen) setIsChatOpen(false);
    if (isAIPopupOpen) setIsAIPopupOpen(false);
  }, [isChatOpen, isAIPopupOpen]);

  const toggleAIPopup = useCallback(() => {
    setIsAIPopupOpen((prev) => !prev);
    if (isChatOpen) setIsChatOpen(false);
    if (isParticipantsOpen) setIsParticipantsOpen(false);
  }, [isChatOpen, isParticipantsOpen]);

  const handleSendMessage = useCallback(
    (message) => {
      if (!message.trim()) return;
      const payload = {
        sender: user.username,
        content: message,
        timestamp: new Date().toISOString(),
        roomId,
      };
      socketRef.current?.emit('chat-message', payload);
      setMessages((prev) => [...prev, payload]);
    },
    [user.username, roomId]
  );

  const handleClearCanvas = useCallback(() => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socketRef.current?.emit('clear-canvas');
  }, []);

  const handleNextPage = useCallback(() => {
    setGridPage((prev) => Math.min(prev + 1, totalGridPages - 1));
  }, [totalGridPages]);

  const handlePrevPage = useCallback(() => {
    setGridPage((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleRaiseHandLocal = useCallback(() => {
    socketRef.current?.emit('raise-hand', { userId: socketRef.current.id });
    setParticipants((prev) =>
      prev.map((p) => (p.userId === socketRef.current.id ? { ...p, isHandRaised: !p.isHandRaised } : p))
    );
  }, []);

  const renderVideoFrame = useCallback(
    (participant) => {
      const isLocal = participant.isLocal;
      const isPinned = pinnedParticipantId === participant.userId;
      const isScreenShare = participant.isScreenSharing;
      const isAI = participant.isAI;

      return (
        <div
          key={participant.userId}
          className={`pro-video-frame ${isPinned ? 'pro-video-frame--pinned' : ''} ${
            isScreenShare ? 'pro-video-frame--screen-share' : ''
          } ${isAI ? 'pro-video-frame--ai' : ''} ${
            participant.videoEnabled && !isScreenShare ? 'pro-video-frame--active' : ''
          }`}
        >
          {isAI ? (
            <div className="pro-ai-visualization">
              <canvas ref={aiCanvasRef} style={{ width: '100%', height: '100%' }} />
              {(aiUploadedImage || aiResponse || aiUploadedAudio) && (
                <div className="pro-ai-content-display">
                  {aiUploadedImage && <img src={aiUploadedImage} alt="Uploaded content" />}
                  {aiUploadedAudio && <audio controls src={aiUploadedAudio} />}
                  {aiResponse && <div className="pro-ai-response-display">{aiResponse}</div>}
                </div>
              )}
              <div className="pro-ai-status">
                <span className="pro-ai-pulse" />
                {aiBotInUse ? `In use by ${currentAIUser}` : 'Ready to help'}
              </div>
            </div>
          ) : (
            <div className="pro-video-container">
              {participant.videoEnabled && participant.stream ? (
                <video
                  ref={(video) => {
                    if (video && participant.stream) {
                      video.srcObject = participant.stream;
                    }
                  }}
                  autoPlay
                  playsInline
                  muted={isLocal}
                  className={`pro-video-element ${isLocal && !isMirroringBrowser ? 'pro-video-element--mirrored' : ''}`}
                />
              ) : (
                <div className="pro-video-placeholder">
                  {participant.profilePicture ? (
                    <>
                      <img
                        src={participant.profilePicture}
                        alt={`${participant.username}'s avatar`}
                        style={{ display: 'block' }}
                      />
                      <div style={{ display: 'none' }}>{getUserAvatar(participant, 80)}</div>
                    </>
                  ) : (
                    getUserAvatar(participant, 80)
                  )}
                </div>
              )}
              {isScreenShare && (
                <canvas
                  ref={annotationCanvasRef}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: isSharingScreen ? 'auto' : 'none',
                  }}
                  onMouseDown={isSharingScreen ? handleMouseDown : undefined}
                  onMouseMove={isSharingScreen ? handleMouseMove : undefined}
                  onMouseUp={isSharingScreen ? handleMouseUp : undefined}
                />
              )}
            </div>
          )}
          <div className="pro-participant-info">
            <span className="pro-participant-name">{participant.username}</span>
            {participant.isHost && <span className="pro-participant-badge pro-participant-badge--host">Host</span>}
            {isLocal && <span className="pro-participant-badge pro-participant-badge--you">You</span>}
            {isAI && <span className="pro-participant-badge pro-participant-badge--ai">AI</span>}
          </div>
          <div className="pro-status-indicators">
            {!participant.audioEnabled && !isAI && (
              <span className="pro-status-icon pro-status-icon--muted">🎙️</span>
            )}
            {!participant.videoEnabled && !isScreenShare && !isAI && (
              <span className="pro-status-icon pro-status-icon--video-off">📹</span>
            )}
            {participant.isHandRaised && (
              <span className="pro-status-icon pro-status-icon--hand-raised">✋</span>
            )}
          </div>
        </div>
      );
    },
    [
      pinnedParticipantId,
      isSharingScreen,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      aiBotInUse,
      currentAIUser,
      aiResponse,
      aiUploadedImage,
      aiUploadedAudio,
      isMirroringBrowser,
    ]
  );

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="pro-meeting-page">
      <MeetingHeader roomId={roomId} participantsCount={realParticipantsCount} onCopyInviteLink={copyInviteLink} />
      <div className={`pro-mainarea-container ${isChatOpen ? 'with-chat-sidebar' : ''}`}>
        <div className="pro-meeting-body">
          <MeetingMainArea
            participants={displayParticipants}
            defaultMainParticipant={defaultMainParticipant}
            pinnedParticipantId={pinnedParticipantId}
            isSomeoneScreenSharing={isSomeoneScreenSharing}
            gridPage={gridPage}
            totalGridPages={totalGridPages}
            onPinParticipant={handlePinParticipant}
            onUnpinParticipant={handleUnpinParticipant}
            onNextPage={handleNextPage}
            onPrevPage={handlePrevPage}
            renderVideoFrame={renderVideoFrame}
          />
          {isChatOpen && (
            <div className="pro-chat-sidebar-overlay">
              <MeetingSidebar type="chat">
                <Chat messages={messages} onSendMessage={handleSendMessage} currentUser={user.username} />
              </MeetingSidebar>
            </div>
          )}
        </div>
      </div>
      {isParticipantsOpen && (
        <div className="pro-sidebar-overlay" onClick={toggleParticipants}>
          <MeetingSidebar type="participants">
            {displayParticipants.map((p) => (
              <div key={p.userId} className={`pro-participant-item ${p.isAI ? 'pro-participants-card--ai' : ''}`}>
                {p.isAI ? <AIAvatar size={32} /> : getUserAvatar(p, 32)}
                <span className="pro-participant-name">{p.username}</span>
                <div className="pro-participant-status">
                  {p.isHost && <span className="pro-participant-badge pro-participant-badge--host">Host</span>}
                  {p.isLocal && <span className="pro-participant-badge pro-participant-badge--you">You</span>}
                  {p.isAI && <span className="pro-participant-badge pro-participant-badge--ai">AI</span>}
                </div>
              </div>
            ))}
          </MeetingSidebar>
        </div>
      )}
      {isAIPopupOpen && (
        <div className="pro-sidebar-overlay" onClick={toggleAIPopup}>
          <AIPopup
            onAIRequest={handleAIRequest}
            onAIComplete={handleAIComplete}
            aiBotInUse={aiBotInUse}
            currentAIUser={currentAIUser}
            currentUser={user.username}
          />
        </div>
      )}
      <MeetingControls
        isAudioMuted={isAudioMuted}
        isVideoEnabled={isVideoEnabled}
        isSharingScreen={isSharingScreen}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onStartScreenShare={startScreenShare}
        onStopScreenShare={stopScreenShare}
        onLeaveMeeting={handleLeaveMeeting}
        onToggleChat={toggleChat}
        onToggleParticipants={toggleParticipants}
        onToggleAIPopup={toggleAIPopup}
        onRaiseHand={handleRaiseHandLocal}
        onClearCanvas={handleClearCanvas}
      />
    </div>
  );
};

export default Meeting;