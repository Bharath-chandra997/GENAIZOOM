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
const VQA_API_URL = `${SERVER_URL}/predict`;

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
  const [scribbleActive, setScribbleActive] = useState(false);

  // === AI STATE ===
  const [aiResponse, setAiResponse] = useState(''); // Full JSON string
  const [aiUploadedImage, setAiUploadedImage] = useState(null);
  const [aiUploadedAudio, setAiUploadedAudio] = useState(null);
  const [isAIProcessingLayout, setIsAIProcessingLayout] = useState(false);

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

  // === REVERT AI LAYOUT ===
  const handleRevertAILayout = useCallback(() => {
    setAiUploadedImage(null);
    setAiUploadedAudio(null);
    setAiResponse('');
    setIsAIProcessingLayout(false);
  }, []);

  const handleAIRequest = useCallback(
    async (imageFile, audioFile) => {
      let isLocked = false;
      setIsAIProcessingLayout(true);
      try {
        console.log('Starting AI request for user:', user.username, {
          image: imageFile?.name,
          audio: audioFile?.name,
          endpoint: VQA_API_URL,
        });

        const lockResponse = await axios.post(
          `${SERVER_URL}/api/ai/lock/${roomId}`,
          { userId: user.userId, username: user.username },
          {
            headers: {
              Authorization: `Bearer ${user.token}`,
              'Content-Type': 'application/json',
            },
            timeout: 5000,
          }
        );
        if (lockResponse.data.success) {
          isLocked = true;
          console.log('AI locked successfully');
        } else {
          throw new Error(lockResponse.data.error || 'Lock failed');
        }

        const validImageTypes = ['image/jpeg', 'image/png'];
        const validAudioTypes = ['audio/mpeg', 'audio/wav'];
        const maxFileSize = 100 * 1024 * 1024;
        if (
          !imageFile ||
          !validImageTypes.includes(imageFile.type) ||
          imageFile.size > maxFileSize
        ) {
          throw new Error('Invalid image file. Must be JPEG/PNG and less than 100 MB.');
        }
        if (
          !audioFile ||
          !validAudioTypes.includes(audioFile.type) ||
          audioFile.size > maxFileSize
        ) {
          throw new Error('Invalid audio file. Must be MP3/WAV and less than 100 MB.');
        }

        const upload = async (formData, type) => {
          const res = await axios.post(
            `${SERVER_URL}/upload/${type}`,
            formData,
            {
              headers: {
                Authorization: `Bearer ${user.token}`,
                'Content-Type': 'multipart/form-data',
              },
              timeout: 30000,
            }
          );
          return res.data.url;
        };

        const imageForm = new FormData();
        imageForm.append('file', imageFile);
        const imageUrl = await upload(imageForm, 'image');

        const audioForm = new FormData();
        audioForm.append('file', audioFile);
        const audioUrl = await upload(audioForm, 'audio');

        // DON'T set state directly - let socket event handle it for all users including sender
        // This ensures synchronization across all participants
        // Question text will be set after AI processing completes
        socketRef.current?.emit('shared-media-display', {
          imageUrl,
          audioUrl,
          username: user.username,
          question: '', // Will be updated with result.sent_from_csv in shared-ai-result event
        });

        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('audio', audioFile);

        const response = await axios.post(VQA_API_URL, formData, {
          headers: {
            Authorization: `Bearer ${user.token}`,
            'Content-Type': 'multipart/form-data',
          },
          timeout: 60000,
        });

        console.log('FastAPI raw response:', response.data);

        const raw = response.data.prediction || response.data.result || response.data;
        const fullResult = typeof raw === 'string' ? { text: raw } : raw;

        // Extract question text if available and ensure it's in the result object
        const question = fullResult.sent_from_csv || fullResult.question || '';
        
        // Ensure question is always in the result object for consistent parsing across all users
        if (question && !fullResult.sent_from_csv) {
          fullResult.sent_from_csv = question;
        }
        if (question && !fullResult.question) {
          fullResult.question = question;
        }

        // DON'T set state directly - let socket event handle it for all users including sender
        // This ensures synchronization across all participants
        socketRef.current?.emit('shared-ai-result', {
          result: fullResult,
          imageUrl,
          audioUrl,
          username: user.username,
          question,
        });

        await axios.post(
          `${SERVER_URL}/api/meeting-session/${roomId}/ai-state`,
          {
            isProcessing: false,
            output: fullResult.text || '',
            question: fullResult.sent_from_csv || '',
            sentFromCSV: !!fullResult.sent_from_csv,
            imageUrl,
            audioUrl,
            completedAt: new Date().toISOString(),
            currentUploader: null,
            uploaderUsername: null,
          },
          {
            headers: { Authorization: `Bearer ${user.token}` },
            timeout: 5000,
          }
        );

        toast.success('AI processing completed!', { position: 'bottom-center' });

        await axios.post(
          `${SERVER_URL}/api/ai/unlock/${roomId}`,
          { userId: user.userId },
          {
            headers: { Authorization: `Bearer ${user.token}` },
            timeout: 5000,
          }
        );
      } catch (error) {
        console.error('AI request error:', error);
        let errorMessage = error.message;
        if (error.response) {
          const { status, data } = error.response;
          if (status === 409) errorMessage = 'AI Bot is already in use.';
          else if (status === 400) errorMessage = 'Invalid file format.';
          else errorMessage = data?.error || error.message;
        }
        toast.error(errorMessage, { position: 'bottom-center' });

        if (isLocked) {
          try {
            await axios.post(
              `${SERVER_URL}/api/ai/unlock/${roomId}`,
              { userId: user.userId },
              { headers: { Authorization: `Bearer ${user.token}` } }
            );
          } catch (e) {}
        }
      }
    },
    [user, roomId]
  );

  const handleSharedMediaDisplay = useCallback(({ imageUrl, audioUrl, username, question }) => {
    // Clear previous AI response when new media is uploaded
    // This ensures clean state when a new upload starts
    setAiResponse('');
    // Set uploaded media - this triggers the processing layout display
    setAiUploadedImage(imageUrl || null);
    setAiUploadedAudio(audioUrl || null);
    setIsAIProcessingLayout(true);
    
    // Question text will be included in the AI response event when processing completes
    // For now, we just show the uploaded media in the processing layout
  }, []);

  const handleSharedAIResult = useCallback(
    ({ result, imageUrl, audioUrl, username, question }) => {
      // Parse result if it's a string
      const parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      
      // Ensure question is included in the result object for consistent display
      // This ensures all users see the question text in the AI frame
      if (question && !parsedResult.sent_from_csv) {
        parsedResult.sent_from_csv = question;
      }
      // Also ensure question field is set if sent_from_csv is not present
      if (question && !parsedResult.question) {
        parsedResult.question = question;
      }
      
      // Update all AI state from the synchronized event
      // This ensures all users see the same state
      setAiResponse(JSON.stringify(parsedResult));
      if (imageUrl) setAiUploadedImage(imageUrl);
      if (audioUrl) setAiUploadedAudio(audioUrl);
      setIsAIProcessingLayout(true);

      // Show notification only if it's not the current user (to avoid duplicate notifications)
      if (username !== user.username) {
        toast.info(
          <div>
            <strong>{username}</strong> shared AI result
            {(parsedResult?.sent_from_csv || question) && <span style={{ color: '#10b981', marginLeft: 6 }}>[CSV]</span>}
          </div>,
          { position: 'bottom-center' }
        );
      }
    },
    [user.username]
  );

  const handleSharedMediaRemoval = useCallback(() => {
    setAiUploadedImage(null);
    setAiUploadedAudio(null);
    setAiResponse('');
    setIsAIProcessingLayout(false);
  }, []);

  const getIceServers = useCallback(async () => {
    const now = Date.now();
    if (iceServersCache.current && now - lastIceFetch.current < 5 * 60 * 1000) {
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
      iceServersCache.current = data;
      lastIceFetch.current = now;
      return data;
    } catch (e) {
      console.error('ICE servers fetch failed:', e.message);
      throw new Error('Failed to fetch ICE servers');
    }
  }, []);

  const handleIceCandidate = useCallback(({ from, candidate }) => {
    const pc = peerConnections.current.get(from);
    if (!pc) return;
    if (pc.remoteDescription && pc.remoteDescription.type) {
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
          connectionTimeouts.current.delete(remoteSocketId);
          signalingStates.current.delete(remoteSocketId);
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
          connectionTimeouts.current.delete(remoteSocketId);
        } else if (pc.connectionState === 'failed') {
          clearTimeout(timeout);
          connectionTimeouts.current.delete(remoteSocketId);
          signalingStates.current.delete(remoteSocketId);
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
        const state = signalingStates.current.get(from);
        if (state === 'new' || state === 'stable') {
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) =>
              pc.addTrack(track, localStreamRef.current)
            );
          }
          signalingStates.current.set(from, 'have-remote-offer');
          await pc.setRemoteDescription(new RTCSessionDescription(offer));

          const queued = pendingIceCandidates.current.get(from) || [];
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          pendingIceCandidates.current.delete(from);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signalingStates.current.set(from, 'stable');
          socketRef.current?.emit('answer', { to: from, answer });
        }
      } catch (e) {
        console.error('Offer handler error:', e);
        toast.error(`Failed to process offer from ${username}.`);
      }
    },
    [createPeerConnection]
  );

  const handleAnswer = useCallback(async ({ from, answer }) => {
    const pc = peerConnections.current.get(from);
    if (pc && signalingStates.current.get(from) === 'have-local-offer') {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        const queued = pendingIceCandidates.current.get(from) || [];
        for (const cand of queued) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
        pendingIceCandidates.current.delete(from);
        signalingStates.current.set(from, 'stable');
      } catch (e) {
        console.error('Answer handler error:', e);
      }
    }
  }, []);

  const handleUserLeft = useCallback(({ userId, username }) => {
    if (username) {
      toast.info(`${username} left the meeting`, { 
        position: 'top-center',
        autoClose: 3000,
      });
    }
    
    const pc = peerConnections.current.get(userId);
    if (pc) pc.close();
    peerConnections.current.delete(userId);
    connectionTimeouts.current.get(userId)?.clearTimeout();
    connectionTimeouts.current.delete(userId);
    signalingStates.current.delete(userId);
    pendingIceCandidates.current.delete(userId);
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
            
            toast.success(`Welcome to the meeting, ${user.username}!`, { 
              position: 'top-center',
              autoClose: 3000,
            });
            
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
              username: user.username, // Remove "(You)" suffix - it's added in the UI
              stream: localStreamRef.current,
              isLocal: true,
              isHost,
              videoEnabled: true,
              audioEnabled: true,
              isScreenSharing: false,
              socketId: socket.id,
              profilePicture: user.profilePicture,
            };
            // Check for existing local participant to prevent duplicates on reload
            setParticipants((prev) => {
              const filtered = prev.filter((p) => !p.isLocal);
              return [localParticipant, ...filtered, ...remoteParticipants.filter((rp) => 
                !filtered.some((p) => p.userId === rp.userId)
              )];
            });

            if (sessionData?.chatMessages) setMessages(sessionData.chatMessages);
            
            // Restore AI state from session data (sharedMedia and aiState)
            if (sessionData?.sharedMedia || sessionData?.aiState) {
              const sharedMedia = sessionData.sharedMedia || {};
              const aiState = sessionData.aiState || {};
              
              // Restore uploaded media
              setAiUploadedImage(sharedMedia.imageUrl || null);
              setAiUploadedAudio(sharedMedia.audioUrl || null);
              
              // Restore AI response if it exists
              if (aiState.output) {
                try {
                  // Try to parse as JSON first, if it fails, treat as plain text
                  const parsed = typeof aiState.output === 'string' 
                    ? (aiState.output.startsWith('{') ? JSON.parse(aiState.output) : { text: aiState.output })
                    : aiState.output;
                  
                  setAiResponse(JSON.stringify(parsed));
                } catch (e) {
                  // If parsing fails, create a simple text object
                  setAiResponse(JSON.stringify({ text: aiState.output }));
                }
              } else {
                setAiResponse('');
              }
              
              // Show processing layout if there's media or a response
              setIsAIProcessingLayout(!!sharedMedia.imageUrl || !!sharedMedia.audioUrl || !!aiState.output);
            }
            setIsLoading(false);
          }
        );
      };

      socket.on('connect', onConnect);
      socket.on('user-joined', async ({ userId, username, isHost, profilePicture }) => {
        if (userId === socket.id) return;
        
        toast.success(`${username} joined the meeting`, { 
          position: 'top-center',
          autoClose: 3000,
        });
        
        setParticipants((prev) => {
          // Check if participant already exists (prevent duplicates on reconnect)
          const existingIndex = prev.findIndex((p) => p.userId === userId);
          if (existingIndex >= 0) {
            // Update existing participant instead of adding duplicate
            const updated = [...prev];
            updated[existingIndex] = {
              ...updated[existingIndex],
              username,
              isHost,
              profilePicture,
            };
            return updated;
          }
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
          const state = signalingStates.current.get(userId);
          if (state === 'new' || state === 'stable') {
            if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach((track) =>
                pc.addTrack(track, localStreamRef.current)
              );
            }
            signalingStates.current.set(userId, 'have-local-offer');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { to: userId, offer, username: user.username });
          }
        } catch (e) {
          console.error('User-joined handler error:', e);
        }
      });
      socket.on('offer', handleOffer);
      socket.on('answer', handleAnswer);
      socket.on('ice-candidate', handleIceCandidate);
      socket.on('user-left', handleUserLeft);
      socket.on('chat-message', ({ userId, username, message, timestamp }) => {
        setMessages((prev) => [...prev, { userId, username, message, timestamp }]);
      });
      socket.on('screen-share-start', ({ userId }) => {
        setParticipants((prev) =>
          prev.map((p) => (p.userId === userId ? { ...p, isScreenSharing: true } : p))
        );
      });
      socket.on('screen-share-stop', ({ userId }) => {
        setParticipants((prev) =>
          prev.map((p) => (p.userId === userId ? { ...p, isScreenSharing: false } : p))
        );
      });
      socket.on('toggle-video', ({ userId, enabled }) => {
        setParticipants((prev) =>
          prev.map((p) => (p.userId === userId ? { ...p, videoEnabled: enabled } : p))
        );
      });
      socket.on('toggle-audio', ({ userId, enabled }) => {
        setParticipants((prev) =>
          prev.map((p) => (p.userId === userId ? { ...p, audioEnabled: enabled } : p))
        );
      });
      socket.on('pin-participant', ({ userId }) => setPinnedParticipantId(userId));
      socket.on('unpin-participant', () => setPinnedParticipantId(null));
      socket.on('shared-ai-result', handleSharedAIResult);
      socket.on('shared-media-display', handleSharedMediaDisplay);
      socket.on('shared-media-removal', handleSharedMediaRemoval);
      socket.on('scribble:image', (img) => {
        if (img) setScribbleActive(true);
      });
      socket.on('scribble:removeImage', () => setScribbleActive(false));

      return () => {
        socket.off('connect', onConnect);
        socket.off('user-joined');
        socket.off('offer', handleOffer);
        socket.off('answer', handleAnswer);
        socket.off('ice-candidate', handleIceCandidate);
        socket.off('user-left', handleUserLeft);
        socket.off('chat-message');
        socket.off('screen-share-start');
        socket.off('screen-share-stop');
        socket.off('toggle-video');
        socket.off('toggle-audio');
        socket.off('pin-participant');
        socket.off('unpin-participant');
        socket.off('shared-ai-result');
        socket.off('shared-media-display');
        socket.off('shared-media-removal');
        socket.off('scribble:image');
        socket.off('scribble:removeImage');
      };
    },
    [
      roomId,
      user,
      createPeerConnection,
      handleOffer,
      handleAnswer,
      handleIceCandidate,
      handleUserLeft,
      handleSharedAIResult,
      handleSharedMediaDisplay,
      handleSharedMediaRemoval,
    ]
  );

  useEffect(() => {
    let mounted = true;
    let socketCleanup = () => {};

    const wakeFastAPI = async () => {
      if (!user?.token) return;
      try {
        await fetch('https://genaizoom-1.onrender.com/ping', {
          method: 'GET',
          headers: { Authorization: `Bearer ${user.token}` },
        });
      } catch (e) {}
    };
    wakeFastAPI();

    const init = async () => {
      if (!user) {
        toast.error('Please log in to join the meeting.');
        navigate('/home');
        return;
      }

      setIsLoading(true);
      try {
        const constraints = {
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
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];
      } catch (e) {
        console.error('Media init error:', e);
        toast.error('Failed to access camera/microphone.');
        navigate('/home');
        return;
      }

      socketRef.current = io(SERVER_URL, {
        auth: { token: user.token },
        transports: ['websocket'],
        reconnectionAttempts: 10,
      });

      socketCleanup = setupSocketListeners(socketRef.current);

      socketRef.current.on('connect_error', (err) => {
        console.error('Socket connect error:', err);
        toast.error(`Connection failed: ${err.message}`);
      });
    };

    init();

    return () => {
      mounted = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
      connectionTimeouts.current.forEach((t) => clearTimeout(t));
      connectionTimeouts.current.clear();
      signalingStates.current.clear();
      pendingIceCandidates.current.clear();
      if (aiAnimationRef.current) cancelAnimationFrame(aiAnimationRef.current);
      if (socketRef.current) {
        socketCleanup();
        socketRef.current.disconnect();
      }
    };
  }, [user, navigate, roomId, setupSocketListeners]);

  const toggleAudio = () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;

    // Determine the next state (mute when any track is currently enabled)
    const currentlyEnabled = audioTracks.some((track) => track.enabled);
    const nextEnabled = !currentlyEnabled;

    audioTracks.forEach((track) => {
      track.enabled = nextEnabled;
    });

    // Ensure all peer connection audio senders respect the new enabled state
    peerConnections.current.forEach((pc) => {
      pc.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === 'audio') {
          sender.track.enabled = nextEnabled;
        }
      });
    });

    setIsAudioMuted(!nextEnabled);
    setParticipants((prev) =>
      prev.map((p) => (p.isLocal ? { ...p, audioEnabled: nextEnabled } : p))
    );
    socketRef.current?.emit('toggle-audio', { enabled: nextEnabled });
  };

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack.enabled) {
      videoTrack.enabled = false;
      setIsVideoEnabled(false);
      setParticipants((prev) =>
        prev.map((p) => (p.isLocal ? { ...p, videoEnabled: false } : p))
      );
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
        const newTrack = newStream.getVideoTracks()[0];
        const oldTrack = localStreamRef.current.getVideoTracks()[0];
        localStreamRef.current.removeTrack(oldTrack);
        oldTrack.stop();
        localStreamRef.current.addTrack(newTrack);
        localCameraTrackRef.current = newTrack;

        peerConnections.current.forEach((pc) => {
          const sender = pc
            .getSenders()
            .find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(newTrack);
        });

        setIsVideoEnabled(true);
        setParticipants((prev) =>
          prev.map((p) => (p.isLocal ? { ...p, videoEnabled: true } : p))
        );
        socketRef.current?.emit('toggle-video', { enabled: true });
      } catch (e) {
        console.error('Video enable error:', e);
        toast.error('Failed to start video.');
      }
    }
  };

  const handleScreenShare = async () => {
    if (isSharingScreen) {
      // Stop screen sharing and restore camera
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      if (localCameraTrackRef.current && !localCameraTrackRef.current.enabled) {
        // Re-enable camera track if it was disabled
        localCameraTrackRef.current.enabled = true;
      }
      await replaceTrack(localCameraTrackRef.current, false);
      setIsSharingScreen(false);
      socketRef.current?.emit('screen-share-stop', { userId: socketRef.current.id });
    } else {
      // Prevent multiple screen shares - check if one is already active
      if (screenStreamRef.current) {
        // Stop any existing screen share first
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
        setIsSharingScreen(false);
      }
      
      try {
        // Store camera track reference BEFORE starting screen share
        const currentVideoTrack = localStreamRef.current?.getVideoTracks()[0];
        if (currentVideoTrack && currentVideoTrack.kind === 'video' && !currentVideoTrack.label.includes('screen')) {
          // Only store if it's not already a screen share track
          localCameraTrackRef.current = currentVideoTrack;
        }
        
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screen;
        const screenTrack = screen.getVideoTracks()[0];
        
        await replaceTrack(screenTrack, true);
        setIsSharingScreen(true);
        socketRef.current?.emit('screen-share-start', { userId: socketRef.current.id });
        
        screenTrack.onended = async () => {
          // Screen share ended (user stopped via browser UI)
          if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((t) => t.stop());
            screenStreamRef.current = null;
          }
          
          // Restore camera track
          if (localCameraTrackRef.current && localStreamRef.current) {
            // Ensure camera track is enabled
            if (!localCameraTrackRef.current.enabled) {
              localCameraTrackRef.current.enabled = true;
            }
            await replaceTrack(localCameraTrackRef.current, false);
          }
          
          setIsSharingScreen(false);
          socketRef.current?.emit('screen-share-stop', { userId: socketRef.current.id });
        };
      } catch (e) {
        console.error('Screen share error:', e);
        if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') {
          toast.error('Screen sharing failed.');
        }
        // Reset state on error
        setIsSharingScreen(false);
        screenStreamRef.current = null;
      }
    }
  };

  const replaceTrack = async (newTrack, isScreen = false) => {
    if (!newTrack) return;
    
    const stream = localStreamRef.current;
    if (!stream) return;
    
    const oldVideo = stream.getVideoTracks()[0];
    if (oldVideo && oldVideo !== newTrack) {
      // Don't stop the camera track when switching to screen share (we'll need it back)
      // When switching back to camera, the old track is the screen share, so stop it
      const isCameraTrack = oldVideo === localCameraTrackRef.current;
      if (isScreen && isCameraTrack) {
        // Switching TO screen share: keep camera track alive, just remove from stream
        // Don't stop it
      } else {
        // Switching FROM screen share or other cases: stop the old track
        oldVideo.stop();
      }
      stream.removeTrack(oldVideo);
    }
    
    // Ensure new track is enabled
    if (!newTrack.enabled) {
      newTrack.enabled = true;
    }
    
    stream.addTrack(newTrack);
    
    // Update peer connections
    const replacePromises = [];
    peerConnections.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        replacePromises.push(sender.replaceTrack(newTrack).catch(err => {
          console.error('Error replacing track in peer connection:', err);
        }));
      }
    });
    
    await Promise.all(replacePromises);
    
    // Update participant state with new stream reference
    setParticipants((prev) =>
      prev.map((p) => {
        if (p.isLocal) {
          return { 
            ...p, 
            isScreenSharing: isScreen,
            videoEnabled: true,
            stream: stream // Update stream reference to trigger re-render
          };
        }
        return p;
      })
    );
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
          navigator.clipboard.writeText(link).then(() => {
            toast.success('Invite link copied!', { position: 'bottom-center' });
          });
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
            handleSwipe={(dir) => setGridPage((p) => Math.max(0, Math.min(p + dir, totalGridPages - 1)))}
            gridPage={gridPage}
            totalGridPages={totalGridPages}
            pinnedParticipantId={pinnedParticipantId}
            isMirroringBrowser={isMirroringBrowser}
            socketRef={socketRef}
            handleExitRoom={() => {
              socketRef.current?.emit('leave-room', { userId: socketRef.current.id });
              navigate('/home');
            }}
            aiCanvasRef={aiCanvasRef}
            setGridPage={setGridPage}
            aiResponse={aiResponse}
            aiUploadedImage={aiUploadedImage}
            aiUploadedAudio={aiUploadedAudio}
            isAIProcessingLayout={isAIProcessingLayout}
            onRevertAILayout={handleRevertAILayout}
            getUserAvatar={getUserAvatar}
            AIAvatar={AIAvatar}
            onPinParticipant={(uid) => socketRef.current?.emit('pin-participant', { userId: uid })}
            onUnpinParticipant={() => socketRef.current?.emit('unpin-participant')}
            onAIReset={handleRevertAILayout}
          />
        </div>

        {isChatOpen && (
          <div className="pro-chat-sidebar-overlay" onClick={() => setIsChatOpen(false)}>
            <div className="pro-chat-sidebar" onClick={(e) => e.stopPropagation()}>
              <Chat
                messages={messages}
                onSendMessage={(msg) => {
                  const payload = {
                    userId: socketRef.current?.id,
                    username: user.username,
                    message: msg,
                    timestamp: Date.now(),
                  };
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
              setIsParticipantsOpen(false);
              setIsAIPopupOpen(false);
            }}
          >
            {isParticipantsOpen && (
              <div className="pro-sidebar-popup pro-sidebar-popup--participants" onClick={(e) => e.stopPropagation()}>
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
                  onPinParticipant={(uid) => socketRef.current?.emit('pin-participant', { userId: uid })}
                  onCopyInvite={() => {
                    const link = `${window.location.origin}/join/${roomId}`;
                    navigator.clipboard.writeText(link).then(() => {
                      toast.success('Meeting link copied!', { position: 'bottom-center' });
                    });
                  }}
                />
              </div>
            )}

            {isAIPopupOpen && (
              <div className="pro-sidebar-popup" onClick={(e) => e.stopPropagation()}>
                <AIPopup
                  onClose={() => setIsAIPopupOpen(false)}
                  onAIRequest={handleAIRequest}
                  onAIComplete={handleRevertAILayout}
                  aiResponse={aiResponse}
                  aiUploadedImage={aiUploadedImage}
                  aiUploadedAudio={aiUploadedAudio}
                  user={user}
                  isAIProcessing={false}
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
        handleExitRoom={() => {
          socketRef.current?.emit('leave-room', { userId: socketRef.current.id });
          navigate('/home');
        }}
        onCopyInvite={() => {
          const link = `${window.location.origin}/join/${roomId}`;
          navigator.clipboard.writeText(link).then(() => {
            toast.success('Invite link copied!', { position: 'bottom-center' });
          });
        }}
        scribbleActive={scribbleActive}
        onToggleScribble={() => setScribbleActive((v) => !v)}
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
      <canvas
        ref={aiCanvasRef}
        style={{ position: 'absolute', top: -1000, left: -1000, width: 640, height: 480 }}
      />
    </div>
  );
};

export { getUserAvatar, AIAvatar };
export default Meeting;