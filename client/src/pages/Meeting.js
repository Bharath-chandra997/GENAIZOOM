import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import io from 'socket.io-client';
import axios from 'axios';
import MeetingHeader from './MeetingHeader';
import MeetingMainArea from './MeetingMainArea';
import MeetingSidebar from './MeetingSidebar';
import MeetingControls from './MeetingControls';
import ScribbleOverlay from '../components/ScribbleOverlay';
import AIPopup from './AIPopup';
import Chat from '../components/Chat';
import LoadingSpinner from '../components/LoadingSpinner';
import './Meeting.css';

const SERVER_URL = 'https://genaizoomserver-0yn4.onrender.com';
// CORRECT: Proxy through your Express server
const VQA_API_URL = `${SERVER_URL}/api/ai/predict`;

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
  const initials = (user?.username?.charAt(0)?.toUpperCase() || 'U');
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
        background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 50%, #1e40af 100%)',
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: 'bold',
        fontSize: size * 0.25,
        border: '3px solid #10b981',
        position: 'relative',
        boxShadow: '0 4px 20px rgba(59, 130, 246, 0.3)',
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
      }}
    >
      
      <div
        style={{
          position: 'absolute',
          bottom: -3,
          right: -3,
          width: 16,
          height: 16,
          backgroundColor: '#10b981',
          borderRadius: '50%',
          border: '2px solid #0f172a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '8px',
          color: 'white',
          fontWeight: 'bold',
        }}
      >
        
      </div>
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
  const [toolbarPosition] = useState({ x: 20, y: 20 });
  const [gridPage, setGridPage] = useState(0);
  const [aiResponse, setAiResponse] = useState('');
  const [aiUploadedImage, setAiUploadedImage] = useState(null);
  const [aiUploadedAudio, setAiUploadedAudio] = useState(null);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [scribbleActive, setScribbleActive] = useState(false);

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

  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const localCameraTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnections = useRef(new Map());
  const aiCanvasRef = useRef(null);
  const aiAnimationRef = useRef(null);
  const connectionTimeouts = useRef(new Map());
  const iceServersCache = useRef(null);
  const lastIceFetch = useRef(0);
  const signalingStates = useRef(new Map());
  const pendingIceCandidates = useRef(new Map());

  const isMirroringBrowser = useMemo(
    () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
    []
  );

  const allParticipants = useMemo(() => [...participants], [participants]);
  const participantsWithAI = useMemo(
    () => [aiParticipant, ...participants],
    [aiParticipant, participants]
  );
  const realParticipantsCount = useMemo(() => participants.length, [participants]);

  const defaultMainParticipant = useMemo(() => {
    const screenSharer = allParticipants.find((p) => p.isScreenSharing);
    if (screenSharer) return screenSharer;
    const host = allParticipants.find((p) => p.isHost);
    if (host) return host;
    return allParticipants[0] || null;
  }, [allParticipants]);

  const isSomeoneScreenSharing = useMemo(
    () => allParticipants.some((p) => p.isScreenSharing),
    [allParticipants]
  );

  const displayParticipants = participantsWithAI;
  const totalGridPages = useMemo(
    () => Math.max(1, Math.ceil(displayParticipants.length / 3)),
    [displayParticipants.length]
  );

  const getUsernameById = useCallback(
    (userId) => {
      const participant = allParticipants.find((p) => p.userId === userId);
      return participant
        ? participant.isLocal
          ? user.username
          : participant.username
        : 'Another user';
    },
    [allParticipants, user.username]
  );

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
      ctx.fillStyle = 'rgba(96, 165, 250, 0.7)';
      ctx.fillText('Ready to help', canvas.width / 2, canvas.height / 2 + 15);

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
  }, []);

  useEffect(() => {
    const cleanup = initializeAiAnimation();
    return cleanup;
  }, [initializeAiAnimation]);

  // === CORRECTED AI REQUEST: NOW GOES THROUGH EXPRESS PROXY ===
  const handleAIRequest = useCallback(
    async (imageFile, audioFile) => {
      let isLocked = false;
      setIsAIProcessing(true);

      try {
        console.log('Starting AI request via proxy...', { image: imageFile?.name, audio: audioFile?.name });

        // 1. Lock AI
        const lockRes = await axios.post(
          `${SERVER_URL}/api/ai/lock/${roomId}`,
          { userId: user.userId, username: user.username },
          { headers: { Authorization: `Bearer ${user.token}` }, timeout: 5000 }
        );

        if (!lockRes.data.success) throw new Error(lockRes.data.error || 'Failed to lock AI');
        isLocked = true;

        // 2. Validate files
        const validImageTypes = ['image/jpeg', 'image/png'];
        const validAudioTypes = ['audio/mpeg', 'audio/wav'];
        const maxSize = 100 * 1024 * 1024;

        if (!imageFile || !validImageTypes.includes(imageFile.type) || imageFile.size > maxSize) {
          throw new Error('Invalid image: JPEG/PNG, <100MB');
        }
        if (!audioFile || !validAudioTypes.includes(audioFile.type) || audioFile.size > maxSize) {
          throw new Error('Invalid audio: MP3/WAV, <100MB');
        }

        // 3. Upload to Cloudinary (optional, for sharing)
        const uploadFile = async (file, type) => {
          const form = new FormData();
          form.append('file', file);
          const res = await axios.post(`${SERVER_URL}/upload/${type}`, form, {
            headers: { Authorization: `Bearer ${user.token}` },
            timeout: 30000,
          });
          return res.data.url;
        };

        const [imageUrl, audioUrl] = await Promise.all([
          uploadFile(imageFile, 'image'),
          uploadFile(audioFile, 'audio'),
        ]);

        socketRef.current?.emit('shared-media-display', { imageUrl, audioUrl, username: user.username });
        setAiUploadedImage(imageUrl);
        setAiUploadedAudio(audioUrl);

        // 4. Send to Express → FastAPI via /api/ai/predict
        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('audio', audioFile);

        const aiRes = await axios.post(VQA_API_URL, formData, {
          headers: {
            Authorization: `Bearer ${user.token}`,
            'Content-Type': 'multipart/form-data',
          },
          timeout: 60000,
        });

        const prediction = aiRes.data.prediction;
        if (!prediction?.trim()) throw new Error('Empty response from AI');

        setAiResponse(prediction);
        socketRef.current?.emit('shared-ai-result', { response: prediction, username: user.username });

        toast.success('AI analysis complete!', { position: 'bottom-center' });

      } catch (error) {
        console.error('AI request failed:', error);
        let msg = error.message;

        if (error.response?.status === 409) msg = 'AI is busy. Try again later.';
        else if (error.response?.status === 401) msg = 'Unauthorized. Please log in.';
        else if (error.response?.data?.error) msg = error.response.data.error;

        toast.error(msg, { position: 'bottom-center' });

      } finally {
        // Always unlock
        if (isLocked) {
          try {
            await axios.post(`${SERVER_URL}/api/ai/unlock/${roomId}`, { userId: user.userId }, {
              headers: { Authorization: `Bearer ${user.token}` },
              timeout: 5000,
            });
          } catch (e) {
            console.warn('Failed to unlock AI:', e);
          }
        }
        setIsAIProcessing(false);
      }
    },
    [user, roomId]
  );

  const handleAIComplete = useCallback(async () => {
    setAiResponse('');
    setAiUploadedImage(null);
    setAiUploadedAudio(null);
    socketRef.current?.emit('shared-media-removal', { username: user.username });

    try {
      await axios.post(
        `${SERVER_URL}/api/ai/unlock/${roomId}`,
        { userId: user.userId },
        { headers: { Authorization: `Bearer ${user.token}` }, timeout: 5000 }
      );
    } catch (e) {
      console.warn('Manual unlock failed:', e);
    }
    toast.info('AI session ended', { position: 'bottom-center' });
  }, [roomId, user]);

  const handleSharedAIResult = useCallback(({ response, username }) => {
    setAiResponse(response);
    toast.info(`${username} shared AI result`, { position: 'bottom-center' });
  }, []);

  const handleSharedMediaDisplay = useCallback(({ imageUrl, audioUrl, username }) => {
    if (imageUrl) setAiUploadedImage(imageUrl);
    if (audioUrl) setAiUploadedAudio(audioUrl);
  }, []);

  const handleSharedMediaRemoval = useCallback(() => {
    setAiUploadedImage(null);
    setAiUploadedAudio(null);
  }, []);

  const getIceServers = useCallback(async () => {
    const now = Date.now();
    if (iceServersCache.current && now - lastIceFetch.current < 5 * 60 * 1000) {
      return iceServersCache.current;
    }
    try {
      const { data } = await axios.get(`${SERVER_URL}/ice-servers`, { timeout: 2000 });
      iceServersCache.current = data;
      lastIceFetch.current = now;
      return data;
    } catch (e) {
      throw new Error('Failed to fetch ICE servers');
    }
  }, []);

  const handleIceCandidate = useCallback(({ from, candidate }) => {
    const pc = peerConnections.current.get(from);
    if (!pc) return;
    if (pc.remoteDescription?.type) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    } else {
      const pending = pendingIceCandidates.current.get(from) || [];
      pending.push(candidate);
      pendingIceCandidates.current.set(from, pending);
    }
  }, []);

  const createPeerConnection = useCallback(
    async (remoteSocketId) => {
      if (peerConnections.current.has(remoteSocketId)) {
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
      const timeout = setTimeout(() => {
        if (pc.connectionState === 'connecting') {
          pc.close();
          peerConnections.current.delete(remoteSocketId);
        }
      }, 8000);
      connectionTimeouts.current.set(remoteSocketId, timeout);

      pc.ontrack = (event) => {
        clearTimeout(timeout);
        connectionTimeouts.current.delete(remoteSocketId);
        setParticipants((prev) =>
          prev.map((p) =>
            p.userId === remoteSocketId ? { ...p, stream: event.streams[0] } : p
          )
        );
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit('ice-candidate', {
            to: remoteSocketId,
            candidate: event.candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          clearTimeout(timeout);
        } else if (pc.connectionState === 'failed') {
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
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) =>
            pc.addTrack(track, localStreamRef.current)
          );
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current?.emit('answer', { to: from, answer });
      } catch (e) {
        toast.error(`Failed to connect to ${username}`);
      }
    },
    [createPeerConnection]
  );

  const handleAnswer = useCallback(async ({ from, answer }) => {
    const pc = peerConnections.current.get(from);
    if (pc && pc.signalingState === 'have-local-offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }, []);

  const handleUserLeft = useCallback(({ userId, username }) => {
    toast.info(`${username} left`, { position: 'top-center' });
    const pc = peerConnections.current.get(userId);
    if (pc) pc.close();
    peerConnections.current.delete(userId);
    setParticipants((prev) => prev.filter((p) => p.userId !== userId));
  }, []);

  const setupSocketListeners = useCallback(
    (socket) => {
      const onConnect = () => {
        socket.emit(
          'join-room',
          { roomId, username: user.username, isReconnect: false },
          (otherUsers, sessionData) => {
            const isHost = otherUsers.length === 0;
            toast.success(`Welcome, ${user.username}!`, { position: 'top-center' });

            const remoteParticipants = otherUsers.map((u) => ({
              userId: u.userId,
              username: u.username,
              stream: null,
              isLocal: false,
              isHost: u.isHost,
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
              setAiResponse(sessionData.aiState.output || '');
              const img = sessionData.uploadedFiles?.find(f => f.type === 'image');
              const aud = sessionData.uploadedFiles?.find(f => f.type === 'audio');
              setAiUploadedImage(img?.url || null);
              setAiUploadedAudio(aud?.url || null);
            }
            setIsLoading(false);
          }
        );
      };

      socket.on('connect', onConnect);
      socket.on('user-joined', async ({ userId, username, isHost, profilePicture }) => {
        if (userId === socket.id) return;
        toast.success(`${username} joined`, { position: 'top-center' });
        setParticipants((prev) => {
          if (prev.some(p => p.userId === userId)) return prev;
          return [...prev, {
            userId, username, stream: null, isLocal: false, isHost,
            videoEnabled: true, audioEnabled: true, isScreenSharing: false,
            socketId: userId, profilePicture,
          }];
        });

        try {
          const pc = await createPeerConnection(userId);
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
          }
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('offer', { to: userId, offer, username: user.username });
        } catch (e) {
          console.error(e);
        }
      });

      socket.on('offer', handleOffer);
      socket.on('answer', handleAnswer);
      socket.on('ice-candidate', handleIceCandidate);
      socket.on('user-left', handleUserLeft);
      socket.on('chat-message', ({ userId, username, message, timestamp }) => {
        setMessages(prev => [...prev, { userId, username, message, timestamp }]);
      });
      socket.on('screen-share-start', ({ userId }) => {
        setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: true } : p));
      });
      socket.on('screen-share-stop', ({ userId }) => {
        setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: false } : p));
      });
      socket.on('toggle-video', ({ userId, enabled }) => {
        setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, videoEnabled: enabled } : p));
      });
      socket.on('toggle-audio', ({ userId, enabled }) => {
        setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, audioEnabled: enabled } : p));
      });
      socket.on('pin-participant', ({ userId }) => setPinnedParticipantId(userId));
      socket.on('unpin-participant', () => setPinnedParticipantId(null));
      socket.on('shared-ai-result', handleSharedAIResult);
      socket.on('shared-media-display', handleSharedMediaDisplay);
      socket.on('shared-media-removal', handleSharedMediaRemoval);
      socket.on('scribble:image', (img) => img && setScribbleActive(true));
      socket.on('scribble:removeImage', () => setScribbleActive(false));

      return () => {
        socket.off('connect', onConnect);
        socket.off('user-joined');
        socket.off('offer'); socket.off('answer'); socket.off('ice-candidate');
        socket.off('user-left'); socket.off('chat-message');
        socket.off('screen-share-start'); socket.off('screen-share-stop');
        socket.off('toggle-video'); socket.off('toggle-audio');
        socket.off('pin-participant'); socket.off('unpin-participant');
        socket.off('shared-ai-result'); socket.off('shared-media-display');
        socket.off('shared-media-removal');
        socket.off('scribble:image'); socket.off('scribble:removeImage');
      };
    },
    [roomId, user, createPeerConnection, handleOffer, handleAnswer, handleIceCandidate, handleUserLeft, handleSharedAIResult, handleSharedMediaDisplay, handleSharedMediaRemoval]
  );

  useEffect(() => {
    let socketCleanup = () => {};
    const init = async () => {
      if (!user) { navigate('/home'); return; }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 15 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];
      } catch (e) {
        toast.error('Camera/mic access denied');
        navigate('/home');
        return;
      }

      socketRef.current = io(SERVER_URL, { auth: { token: user.token }, transports: ['websocket'] });
      socketCleanup = setupSocketListeners(socketRef.current);

      socketRef.current.on('connect_error', (err) => {
        toast.error(`Connection failed: ${err.message}`);
      });
    };

    init();

    return () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();
      if (socketRef.current) { socketCleanup(); socketRef.current.disconnect(); }
    };
  }, [user, navigate, roomId, setupSocketListeners]);

  const toggleAudio = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      const enabled = track.enabled;
      setIsAudioMuted(!enabled);
      setParticipants(prev => prev.map(p => p.isLocal ? { ...p, audioEnabled: enabled } : p));
      socketRef.current?.emit('toggle-audio', { enabled });
    }
  };

  const toggleVideo = async () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!videoTrack) return;

    if (videoTrack.enabled) {
      videoTrack.enabled = false;
      setIsVideoEnabled(false);
      setParticipants(prev => prev.map(p => p.isLocal ? { ...p, videoEnabled: false } : p));
      socketRef.current?.emit('toggle-video', { enabled: false });
    } else {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = newStream.getVideoTracks()[0];
        const oldTrack = localStreamRef.current.getVideoTracks()[0];
        localStreamRef.current.removeTrack(oldTrack); oldTrack.stop();
        localStreamRef.current.addTrack(newTrack);
        localCameraTrackRef.current = newTrack;

        peerConnections.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(newTrack);
        });

        setIsVideoEnabled(true);
        setParticipants(prev => prev.map(p => p.isLocal ? { ...p, videoEnabled: true } : p));
        socketRef.current?.emit('toggle-video', { enabled: true });
      } catch (e) {
        toast.error('Failed to enable video');
      }
    }
  };

  const handleScreenShare = async () => {
    if (isSharingScreen) {
      await replaceTrack(localCameraTrackRef.current, false);
      setIsSharingScreen(false);
      socketRef.current?.emit('screen-share-stop');
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screen;
        const track = screen.getVideoTracks()[0];
        await replaceTrack(track, true);
        setIsSharingScreen(true);
        socketRef.current?.emit('screen-share-start');

        track.onended = async () => {
          await replaceTrack(localCameraTrackRef.current, false);
          setIsSharingScreen(false);
          socketRef.current?.emit('screen-share-stop');
        };
      } catch (e) {
        toast.error('Screen share failed');
      }
    }
  };

  const replaceTrack = async (newTrack, isScreen) => {
    const stream = localStreamRef.current;
    const oldVideo = stream.getVideoTracks()[0];
    if (oldVideo) { oldVideo.stop(); stream.removeTrack(oldVideo); }
    stream.addTrack(newTrack);
    peerConnections.current.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(newTrack);
    });
    setParticipants(prev => prev.map(p => p.isLocal ? { ...p, isScreenSharing: isScreen } : p));
  };

  if (isLoading) {
    return (
      <div className="pro-meeting-page flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="pro-meeting-page">
      <MeetingHeader
        roomId={roomId}
        participants={allParticipants}
        realParticipantsCount={realParticipantsCount}
        onCopyInvite={() => {
          const link = `${window.location.origin}/join/${roomId}`;
          navigator.clipboard.writeText(link);
          toast.success('Link copied!', { position: 'bottom-center' });
        }}
      />

      <div className="pro-meeting-body">
        <div className={`pro-mainarea-container ${isChatOpen ? 'with-chat-sidebar' : ''}`}>
          <MeetingMainArea
            participants={displayParticipants}
            realParticipants={allParticipants}
            isSomeoneScreenSharing={isSomeoneScreenSharing}
            toolbarPosition={toolbarPosition}
            currentTool="pen"
            currentBrushSize={5}
            handleToolbarMouseDown={() => {}}
            handleMouseDown={() => {}}
            handleMouseMove={() => {}}
            handleMouseUp={() => {}}
            handleSwipe={(dir) => setGridPage(p => Math.max(0, Math.min(p + dir, totalGridPages - 1)))}
            gridPage={gridPage}
            totalGridPages={totalGridPages}
            pinnedParticipantId={pinnedParticipantId}
            isMirroringBrowser={isMirroringBrowser}
            socketRef={socketRef}
            handleExitRoom={() => {
              socketRef.current?.emit('leave-room');
              navigate('/home');
            }}
            aiCanvasRef={aiCanvasRef}
            setGridPage={setGridPage}
            aiResponse={aiResponse}
            aiUploadedImage={aiUploadedImage}
            aiUploadedAudio={aiUploadedAudio}
            getUserAvatar={getUserAvatar}
            AIAvatar={AIAvatar}
            onPinParticipant={(uid) => socketRef.current?.emit('pin-participant', { userId: uid })}
            onUnpinParticipant={() => socketRef.current?.emit('unpin-participant')}
            onAIReset={() => {
              setAiResponse(''); setAiUploadedImage(null); setAiUploadedAudio(null);
              socketRef.current?.emit('shared-media-removal', { username: user.username });
            }}
          />
        </div>

        {isChatOpen && (
          <div className="pro-chat-sidebar-overlay" onClick={() => setIsChatOpen(false)}>
            <div className="pro-chat-sidebar" onClick={e => e.stopPropagation()}>
              <Chat
                messages={messages}
                onSendMessage={(msg) => {
                  const payload = { userId: socketRef.current?.id, username: user.username, message: msg, timestamp: Date.now() };
                  socketRef.current?.emit('send-chat-message', payload);
                  setMessages(prev => [...prev, payload]);
                }}
                currentUser={{ userId: socketRef.current?.id, username: user.username }}
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
                  aiParticipant={aiParticipant}
                  onCloseParticipants={() => setIsParticipantsOpen(false)}
                  roomId={roomId}
                  getUserAvatar={getUserAvatar}
                  AIAvatar={AIAvatar}
                  onPinParticipant={(uid) => socketRef.current?.emit('pin-participant', { userId: uid })}
                  onCopyInvite={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/join/${roomId}`);
                    toast.success('Link copied!');
                  }}
                />
              </div>
            )}

            {isAIPopupOpen && (
              <div className="pro-sidebar-popup" onClick={e => e.stopPropagation()}>
                <AIPopup
                  onClose={() => setIsAIPopupOpen(false)}
                  onAIRequest={handleAIRequest}
                  onAIComplete={handleAIComplete}
                  aiResponse={aiResponse}
                  aiUploadedImage={aiUploadedImage}
                  aiUploadedAudio={aiUploadedAudio}
                  user={user}
                  isAIProcessing={isAIProcessing}
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
        handleExitRoom={() => { socketRef.current?.emit('leave-room'); navigate('/home'); }}
        onCopyInvite={() => {
          navigator.clipboard.writeText(`${window.location.origin}/join/${roomId}`);
          toast.success('Link copied!');
        }}
        scribbleActive={scribbleActive}
        onToggleScribble={() => setScribbleActive(v => !v)}
      />

      {scribbleActive && (
        <ScribbleOverlay
          socketRef={socketRef}
          roomId={roomId}
          onClose={() => setScribbleActive(false)}
          participants={allParticipants}
          currentUser={{ id: socketRef.current?.id, username: user.username }}
        />
      )}

      <canvas ref={aiCanvasRef} style={{ position: 'absolute', top: -1000, left: -1000, width: 640, height: 480 }} />
    </div>
  );
};

export { getUserAvatar, AIAvatar };
export default Meeting;