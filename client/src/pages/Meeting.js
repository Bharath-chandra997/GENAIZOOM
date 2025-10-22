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
const VQA_API_URL = 'https://genaizoom123.onrender.com/predict';

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
    profilePicture: null,
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
    const screenSharer = allParticipants.find(p => p.isScreenSharing);
    if (screenSharer) return screenSharer;
    const host = allParticipants.find(p => p.isHost);
    if (host) return host;
    return allParticipants[0] || null;
  }, [allParticipants]);
  const isSomeoneScreenSharing = useMemo(() => allParticipants.some(p => p.isScreenSharing), [allParticipants]);
  const displayParticipants = participantsWithAI;
  const totalGridPages = useMemo(() => Math.max(1, Math.ceil(displayParticipants.length / 4)), [displayParticipants.length]);

  const getUsernameById = useCallback((userId) => {
    const participant = allParticipants.find(p => p.userId === userId);
    return participant ? (participant.isLocal ? user.username : participant.username) : 'Another user';
  }, [allParticipants, user.username]);

  const copyInviteLink = useCallback(() => {
    const inviteLink = `${window.location.origin}/join/${roomId}`;
    navigator.clipboard.writeText(inviteLink)
      .then(() => toast.success('Invite link copied to clipboard!', { position: 'bottom-center', autoClose: 3000 }))
      .catch(() => toast.error('Failed to copy invite link', { position: 'bottom-center', autoClose: 3000 }));
  }, [roomId]);

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

  const handleAIRequest = useCallback(
    async (imageFile, audioFile) => {
      if (aiBotInUse) {
        toast.error('AI Bot is currently in use by another user', { position: 'bottom-center' });
        return;
      }

      // Validate files
      const validImageTypes = ['image/jpeg', 'image/png'];
      const validAudioTypes = ['audio/mpeg', 'audio/wav'];
      const maxFileSize = 100 * 1024 * 1024; // 100MB

      if (imageFile && (!validImageTypes.includes(imageFile.type) || imageFile.size > maxFileSize)) {
        toast.error('Invalid image file. Must be JPEG/PNG and less than 100MB.', { position: 'bottom-center' });
        return;
      }
      if (audioFile && (!validAudioTypes.includes(audioFile.type) || audioFile.size > maxFileSize)) {
        toast.error('Invalid audio file. Must be MP3/WAV and less than 100MB.', { position: 'bottom-center' });
        return;
      }
      if (!imageFile) {
        toast.error('Image file is required.', { position: 'bottom-center' });
        return;
      }
      if (!audioFile) {
        toast.error('Audio file is required.', { position: 'bottom-center' });
        return;
      }

      setAiBotInUse(true);
      setCurrentAIUser(user.username);
      socketRef.current?.emit('ai-start-processing', { userId: user.userId, username: user.username, roomId });

      let imageUrl = null;
      let audioUrl = null;

      try {
        // Upload files to Node.js server
        if (imageFile) {
          const imageFormData = new FormData();
          imageFormData.append('file', imageFile);
          console.log('Uploading image:', { filename: imageFile.name, size: imageFile.size, type: imageFile.type });
          const imageResponse = await axios.post(`${SERVER_URL}/upload/image`, imageFormData, {
            headers: {
              Authorization: `Bearer ${user.token}`,
              'Content-Type': 'multipart/form-data',
            },
          });
          imageUrl = imageResponse.data.url;
          socketRef.current?.emit('ai-image-uploaded', {
            url: imageUrl,
            userId: user.userId,
            username: user.username,
            filename: imageFile.name,
            size: imageFile.size,
          });
          setAiUploadedImage(imageUrl);
        }

        if (audioFile) {
          const audioFormData = new FormData();
          audioFormData.append('file', audioFile);
          console.log('Uploading audio:', { filename: audioFile.name, size: audioFile.size, type: audioFile.type });
          const audioResponse = await axios.post(`${SERVER_URL}/upload/audio`, audioFormData, {
            headers: {
              Authorization: `Bearer ${user.token}`,
              'Content-Type': 'multipart/form-data',
            },
          });
          audioUrl = audioResponse.data.url;
          socketRef.current?.emit('ai-audio-uploaded', {
            url: audioUrl,
            userId: user.userId,
            username: user.username,
            filename: audioFile.name,
            size: audioFile.size,
          });
          setAiUploadedAudio(audioUrl);
        }

        // Send files to FastAPI server
        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('audio', audioFile);
        console.log('VQA request FormData:');
        for (let pair of formData.entries()) {
          console.log(`${pair[0]}: ${pair[1]}`);
        }

        const response = await axios.post(VQA_API_URL, formData, {
          headers: {
            Authorization: `Bearer ${user.token}`,
            'Content-Type': 'multipart/form-data',
          },
          timeout: 60000,
        });

        const prediction = response.data.prediction;
        setAiResponse(prediction);

        socketRef.current?.emit('ai-finish-processing', { response: prediction });
        socketRef.current?.emit('shared-ai-result', { response: prediction, username: user.username });

        // Update meeting session
        const sessionPayload = {
          isProcessing: false,
          output: prediction,
          completedAt: new Date().toISOString(),
          currentUploader: null,
          uploaderUsername: null,
        };
        console.log('Sending meeting session update:', {
          url: `${SERVER_URL}/api/meeting-session/${roomId}/ai-state`,
          payload: sessionPayload,
          headers: { Authorization: `Bearer ${user.token}` },
        });
        await axios.post(
          `${SERVER_URL}/api/meeting-session/${roomId}/ai-state`,
          sessionPayload,
          { headers: { Authorization: `Bearer ${user.token}` } }
        );

        toast.success('AI processing completed!', { position: 'bottom-center' });
      } catch (error) {
        console.error('AI request error:', {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
          code: error.code,
          stack: error.stack,
        });
        let errorMessage = 'Failed to process AI request.';
        if (error.response?.status === 503) {
          errorMessage = 'AI service is currently unavailable. Please try again later.';
        } else if (error.response?.status === 401) {
          errorMessage = 'Authentication failed. Please log in again.';
        } else if (error.response?.status === 400) {
          errorMessage = 'Invalid file format or missing files.';
        } else if (error.code === 'ECONNABORTED') {
          errorMessage = 'AI request timed out. Please check your network.';
        } else if (error.response?.data?.detail) {
          errorMessage = error.response.data.detail;
        }
        toast.error(errorMessage, { position: 'bottom-center' });

        setAiBotInUse(false);
        setCurrentAIUser(null);
        setAiUploadedImage(null);
        setAiUploadedAudio(null);
        socketRef.current?.emit('ai-bot-unlocked', { roomId });
      }
    },
    [aiBotInUse, user, roomId]
  );

  const handleAIComplete = useCallback(() => {
    setAiBotInUse(false);
    setCurrentAIUser(null);
    setAiResponse('');
    setAiUploadedImage(null);
    setAiUploadedAudio(null);
    socketRef.current?.emit('ai-bot-unlocked', { roomId });
    socketRef.current?.emit('shared-media-removal', { username: user.username });
  }, [roomId, user.username]);

  const handleAIStartProcessing = useCallback(({ userId, username }) => {
    setAiBotInUse(true);
    setCurrentAIUser(username);
    toast.info(`${username} started AI processing`, { position: 'bottom-center' });
  }, []);

  const handleAIFinishProcessing = useCallback(({ response }) => {
    setAiResponse(response);
  }, []);

  const handleAIImageUploaded = useCallback(({ url, userId, username }) => {
    setAiUploadedImage(url);
    toast.info(`${username} uploaded an image for AI processing`, { position: 'bottom-center' });
  }, []);

  const handleAIAudioUploaded = useCallback(({ url, userId, username }) => {
    setAiUploadedAudio(url);
    toast.info(`${username} uploaded an audio file for AI processing`, { position: 'bottom-center' });
  }, []);

  const handleAIBotLocked = useCallback(({ userId, username }) => {
    setAiBotInUse(true);
    setCurrentAIUser(username);
  }, []);

  const handleAIBotUnlocked = useCallback(() => {
    setAiBotInUse(false);
    setCurrentAIUser(null);
    setAiResponse('');
    setAiUploadedImage(null);
    setAiUploadedAudio(null);
  }, []);

  const handleSharedAIResult = useCallback(({ response, username }) => {
    setAiResponse(response);
    toast.info(`${username} shared an AI result`, { position: 'bottom-center' });
  }, []);

  const handleSharedMediaDisplay = useCallback(({ imageUrl, audioUrl, username }) => {
    if (imageUrl) setAiUploadedImage(imageUrl);
    if (audioUrl) setAiUploadedAudio(audioUrl);
  }, []);

  const handleSharedMediaRemoval = useCallback(() => {
    setAiUploadedImage(null);
    setAiUploadedAudio(null);
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

  const handleIceCandidate = useCallback(({ from, candidate }) => {
    const pc = peerConnections.current.get(from);
    if (pc) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
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

  const handleOffer = useCallback(
    async ({ from, offer, username }) => {
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
          socketRef.current.emit('answer', { to: from, answer });
          console.log('Answer sent to:', from);
        }
      } catch (err) {
        console.error('Error in offer handler:', err);
        toast.error(`Failed to process offer from ${username}.`, { position: 'bottom-center' });
      }
    },
    [createPeerConnection, socketRef, localStreamRef, signalingStates]
  );

  const handleAnswer = useCallback(
    async ({ from, answer }) => {
      console.log('Answer received from:', from);
      const pc = peerConnections.current.get(from);
      if (pc && signalingStates.current.get(from) === 'have-local-offer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          signalingStates.current.set(from, 'stable');
          console.log('Remote description set for:', from);
        } catch (err) {
          console.error('Error setting remote description:', err);
          toast.error('Failed to process answer.', { position: 'bottom-center' });
        }
      }
    },
    []
  );

  const handleUserLeft = useCallback(({ userId }) => {
    console.log('User left:', userId);
    const pc = peerConnections.current.get(userId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(userId);
      connectionTimeouts.current.get(userId)?.clearTimeout();
      connectionTimeouts.current.delete(userId);
      signalingStates.current.delete(userId);
      pendingOffers.current.delete(userId);
      pendingAnswers.current.delete(userId);
    }
    setParticipants((prev) => prev.filter((p) => p.userId !== userId));
  }, []);

  const handleChatMessage = useCallback(({ userId, username, message, timestamp, isSystemMessage }) => {
    setMessages((prev) => [
      ...prev,
      { userId, username, message, timestamp, isSystemMessage },
    ]);
  }, []);

  const handleScreenShareStart = useCallback(({ userId }) => {
    setParticipants((prev) =>
      prev.map((p) => (p.userId === userId ? { ...p, isScreenSharing: true } : p))
    );
  }, []);

  const handleScreenShareStop = useCallback(({ userId }) => {
    setParticipants((prev) =>
      prev.map((p) => (p.userId === userId ? { ...p, isScreenSharing: false } : p))
    );
  }, []);

  const handleError = useCallback(({ message }) => {
    toast.error(message, { position: 'bottom-center' });
  }, []);

  const handleDrawingStart = useCallback(({ userId, x, y, color, tool, size }) => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    remoteDrawingStates.current.set(userId, { x: x * canvas.width, y: y * canvas.height, color, tool, size });
    if (tool === 'pen' || tool === 'eraser') {
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x * canvas.width, y * canvas.height);
    }
  }, []);

  const handleDrawingMove = useCallback(({ userId, x, y }) => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const state = remoteDrawingStates.current.get(userId);
    if (!state || (state.tool !== 'pen' && state.tool !== 'eraser')) return;
    const ctx = canvas.getContext('2d');
    ctx.lineTo(x * canvas.width, y * canvas.height);
    ctx.stroke();
  }, []);

  const handleDrawShape = useCallback(({ userId, tool, startX, startY, endX, endY, color, size }) => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    if (tool === 'rectangle') {
      ctx.rect(
        startX * canvas.width,
        startY * canvas.height,
        (endX - startX) * canvas.width,
        (endY - startY) * canvas.height
      );
    } else if (tool === 'circle') {
      const radius = Math.sqrt(
        Math.pow((endX - startX) * canvas.width, 2) + Math.pow((endY - startY) * canvas.height, 2)
      );
      ctx.arc(startX * canvas.width, startY * canvas.height, radius, 0, 2 * Math.PI);
    }
    ctx.stroke();
  }, []);

  const handleClearCanvas = useCallback(() => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const handleToggleVideo = useCallback(({ userId, enabled }) => {
    console.log('Toggle video for user:', userId, enabled);
    setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, videoEnabled: enabled } : p)));
  }, []);

  const handleToggleAudio = useCallback(({ userId, enabled }) => {
    console.log('Toggle audio for user:', userId, enabled);
    setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, audioEnabled: enabled } : p)));
  }, []);

  const handlePinParticipant = useCallback(({ userId }) => {
    console.log('Pin participant:', userId);
    setPinnedParticipantId(userId);
  }, []);

  const handleUnpinParticipant = useCallback(() => {
    console.log('Unpin participant');
    setPinnedParticipantId(null);
  }, []);

  const handleSessionRestored = useCallback((data) => {
    console.log('Session restored:', data);
    if (data.chatMessages) setMessages(data.chatMessages);
    if (data.aiState) {
      setAiBotInUse(data.aiState.isProcessing || !!data.aiState.currentUploader);
      setCurrentAIUser(data.aiState.uploaderUsername);
      setAiResponse(data.aiState.output);
      if (data.uploadedFiles) {
        const lastImage = data.uploadedFiles.find(f => f.type === 'image');
        const lastAudio = data.uploadedFiles.find(f => f.type === 'audio');
        setAiUploadedImage(lastImage?.url || null);
        setAiUploadedAudio(lastAudio?.url || null);
      }
    }
  }, []);

  const setupSocketListeners = useCallback(
    (socket) => {
      const handleConnect = () => {
        console.log('✅ Socket connected:', socket.id);
        socket.emit('join-room', { roomId, username: user.username, isReconnect: false }, (otherUsers, sessionData) => {
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
            socketId: socket.id,
            profilePicture: user.profilePicture,
          };
          setParticipants([localParticipant, ...remoteParticipants]);
          if (sessionData?.chatMessages) setMessages(sessionData.chatMessages);
          if (sessionData?.aiState) {
            setAiBotInUse(sessionData.aiState.isProcessing || !!sessionData.aiState.currentUploader);
            setCurrentAIUser(sessionData.aiState.uploaderUsername);
            setAiResponse(sessionData.aiState.output);
          }
          if (sessionData?.uploadedFiles) {
            const lastImage = sessionData.uploadedFiles.find(f => f.type === 'image');
            const lastAudio = sessionData.uploadedFiles.find(f => f.type === 'audio');
            setAiUploadedImage(lastImage?.url || null);
            setAiUploadedAudio(lastAudio?.url || null);
          }
          setIsLoading(false);
        });
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
      socket.on('toggle-video', handleToggleVideo);
      socket.on('toggle-audio', handleToggleAudio);
      socket.on('pin-participant', handlePinParticipant);
      socket.on('unpin-participant', handleUnpinParticipant);
      socket.on('session-restored', handleSessionRestored);
      socket.on('ai-start-processing', handleAIStartProcessing);
      socket.on('ai-finish-processing', handleAIFinishProcessing);
      socket.on('ai-image-uploaded', handleAIImageUploaded);
      socket.on('ai-audio-uploaded', handleAIAudioUploaded);
      socket.on('ai-bot-locked', handleAIBotLocked);
      socket.on('ai-bot-unlocked', handleAIBotUnlocked);
      socket.on('shared-ai-result', handleSharedAIResult);
      socket.on('shared-media-display', handleSharedMediaDisplay);
      socket.on('shared-media-removal', handleSharedMediaRemoval);

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
        socket.off('toggle-video', handleToggleVideo);
        socket.off('toggle-audio', handleToggleAudio);
        socket.off('pin-participant', handlePinParticipant);
        socket.off('unpin-participant', handleUnpinParticipant);
        socket.off('session-restored', handleSessionRestored);
        socket.off('ai-start-processing', handleAIStartProcessing);
        socket.off('ai-finish-processing', handleAIFinishProcessing);
        socket.off('ai-image-uploaded', handleAIImageUploaded);
        socket.off('ai-audio-uploaded', handleAIAudioUploaded);
        socket.off('ai-bot-locked', handleAIBotLocked);
        socket.off('ai-bot-unlocked', handleAIBotUnlocked);
        socket.off('shared-ai-result', handleSharedAIResult);
        socket.off('shared-media-display', handleSharedMediaDisplay);
        socket.off('shared-media-removal', handleSharedMediaRemoval);
      };
    },
    [
      roomId,
      user.username,
      user.userId,
      user.profilePicture,
      createPeerConnection,
      handleIceCandidate,
      handleToggleVideo,
      handleToggleAudio,
      handlePinParticipant,
      handleUnpinParticipant,
      handleSessionRestored,
      handleAIStartProcessing,
      handleAIFinishProcessing,
      handleAIImageUploaded,
      handleAIAudioUploaded,
      handleAIBotLocked,
      handleAIBotUnlocked,
      handleSharedAIResult,
      handleSharedMediaDisplay,
      handleSharedMediaRemoval,
      handleOffer,
      handleAnswer,
      handleUserLeft,
      handleChatMessage,
      handleScreenShareStart,
      handleScreenShareStop,
      handleError,
      handleDrawingStart,
      handleDrawingMove,
      handleDrawShape,
      handleClearCanvas,
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
        const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];
        console.log('Optimized local stream initialized:', stream);
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
        if (mounted) toast.error('Failed to access camera or microphone. Check permissions.');
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
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
      connectionTimeouts.current.forEach((timeout) => clearTimeout(timeout));
      connectionTimeouts.current.clear();
      signalingStates.current.clear();
      pendingOffers.current.clear();
      pendingAnswers.current.clear();
      if (aiAnimationRef.current) cancelAnimationFrame(aiAnimationRef.current);
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
        if (sender) sender.replaceTrack(newTrack);
      });
      setParticipants((prev) => prev.map((p) => (p.isLocal ? { ...p, isScreenSharing: isScreenShare } : p)));
      socketRef.current?.emit(isScreenShare ? 'screen-share-start' : 'screen-share-stop', { userId: socketRef.current.id });
    },
    []
  );

  const toggleAudio = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      const enabled = audioTrack.enabled;
      setIsAudioMuted(!enabled);
      setParticipants((prev) => prev.map((p) => (p.isLocal ? { ...p, audioEnabled: enabled } : p)));
      socketRef.current?.emit('toggle-audio', { enabled });
    }
  };

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack.enabled) {
      videoTrack.enabled = false;
      setIsVideoEnabled(false);
      setParticipants((prev) => prev.map((p) => (p.isLocal ? { ...p, videoEnabled: false } : p)));
      socketRef.current?.emit('toggle-video', { enabled: false });
    } else {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 480, max: 640 },
            height: { ideal: 360, max: 480 },
            frameRate: { ideal: 15, max: 20 },
          },
        });
        const newVideoTrack = newStream.getVideoTracks()[0];
        await replaceTrack(newVideoTrack, false);
        localCameraTrackRef.current = newVideoTrack;
        setIsVideoEnabled(true);
        setParticipants((prev) => prev.map((p) => (p.isLocal ? { ...p, videoEnabled: true } : p)));
        socketRef.current?.emit('toggle-video', { enabled: true });
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
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
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
            onPinParticipant={(userId) => socketRef.current?.emit('pin-participant', { userId })}
            onUnpinParticipant={() => socketRef.current?.emit('unpin-participant')}
          />
        </div>
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
                    isSystemMessage: false,
                  };
                  console.log('Sending chat message:', payload);
                  socketRef.current?.emit('send-chat-message', payload);
                  setMessages((prev) => [...prev, payload]);
                }}
                currentUser={{ userId: socketRef.current?.id, username: user.username }}
                onClose={() => setIsChatOpen(false)}
              />
            </div>
          </div>
        )}
        {(isParticipantsOpen || isAIPopupOpen) && (
          <div
            className="pro-sidebar-overlay"
            onClick={() => {
              if (isParticipantsOpen) setIsParticipantsOpen(false);
              if (isAIPopupOpen) setIsAIPopupOpen(false);
            }}
          >
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
      <canvas
        ref={aiCanvasRef}
        style={{ position: 'absolute', top: -1000, left: -1000, width: 640, height: 480 }}
      />
    </div>
  );
};

export { getUserAvatar, AIAvatar };
export default Meeting;