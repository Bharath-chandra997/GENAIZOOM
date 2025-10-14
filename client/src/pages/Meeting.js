import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import io from 'socket.io-client';
import axios from 'axios';
import Chat from '../components/Chat';
import Participants from '../components/Participants';
import LoadingSpinner from '../components/LoadingSpinner';
import VideoPlayer from '../components/VideoPlayer';
import AnnotationToolbar from '../components/AnnotationToolbar';

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

const Meeting = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State for meeting
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(true);
  const [showAiMiniCard, setShowAiMiniCard] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [filmstripSize] = useState(6);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [pinnedParticipantId, setPinnedParticipantId] = useState(null);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 20, y: 20 });
  const [currentTool, setCurrentTool] = useState('pen');
  const [currentBrushSize, setCurrentBrushSize] = useState(5);
  const [gridPage, setGridPage] = useState(0);
  const touchStartXRef = useRef(0);
  const touchDeltaRef = useRef(0);

  // State for AI Zoom Bot (shared across users)
  const [imageUrl, setImageUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [output, setOutput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentUploader, setCurrentUploader] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBotLocked, setIsBotLocked] = useState(false);
  const [uploaderUsername, setUploaderUsername] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedAudio, setSelectedAudio] = useState(null);

  // Session persistence state
  const [sessionRestored, setSessionRestored] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Refs
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const localCameraTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnections = useRef(new Map());
  const dragInfo = useRef({ isDragging: false });
  const annotationCanvasRef = useRef(null);
  const mainVideoContainerRef = useRef(null);
  const remoteDrawingStates = useRef(new Map());
  const drawingStateRef = useRef({ isDrawing: false, startX: 0, startY: 0 });
  const isInitialized = useRef(false);

  // Connection optimization refs
  const connectionTimeouts = useRef(new Map());
  const iceServersCache = useRef(null);
  const lastIceFetch = useRef(0);

  // Signaling state management
  const signalingStates = useRef(new Map());
  const pendingOffers = useRef(new Map());
  const pendingAnswers = useRef(new Map());

  // Detect if browser mirrors front camera tracks (e.g., iOS Safari)
  const isMirroringBrowser = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream, []);

  // AI Participant with proper socketId and stable functions
  const handlePlayAudio = useCallback(() => {
    setIsPlaying(true);
    socketRef.current?.emit('ai-audio-play', { roomId });
  }, [roomId]);

  const handlePauseAudio = useCallback(() => {
    setIsPlaying(false);
    socketRef.current?.emit('ai-audio-pause', { roomId });
  }, [roomId]);

  const aiParticipant = useMemo(() => ({
    userId: 'ai-bot',
    username: 'AI Zoom Bot',
    isAI: true,
    isLocal: false,
    isHost: false,
    videoEnabled: true,
    audioEnabled: true,
    isScreenSharing: false,
    imageUrl,
    audioUrl,
    output,
    isProcessing,
    isPlaying,
    isBotLocked,
    currentUploader,
    uploaderUsername,
    handlePlay: handlePlayAudio,
    handlePause: handlePauseAudio,
    socketId: socketRef.current?.id,
  }), [
    imageUrl,
    audioUrl,
    output,
    isProcessing,
    isPlaying,
    isBotLocked,
    currentUploader,
    uploaderUsername,
    handlePlayAudio,
    handlePauseAudio,
    socketRef.current?.id
  ]);

  // Display participants with socketId
  const displayParticipants = useMemo(() => {
    const participantsWithSocketId = participants.map(p => ({
      ...p,
      socketId: p.userId
    }));
    return [aiParticipant, ...participantsWithSocketId];
  }, [aiParticipant, participants]);

  // Derived State
  const defaultMainParticipant = useMemo(() => {
    const screenSharer = participants.find(p => p.isScreenSharing);
    if (screenSharer) return screenSharer;
    const host = participants.find(p => p.isHost);
    if (host) return host;
    return participants[0] || null;
  }, [participants]);

  const mainViewParticipant = useMemo(() => {
    return participants.find(p => p.userId === pinnedParticipantId) || defaultMainParticipant;
  }, [pinnedParticipantId, defaultMainParticipant, participants]);

  const isSomeoneScreenSharing = useMemo(() =>
    participants.some(p => p.isScreenSharing),
    [participants]
  );
  const totalGridPages = useMemo(() => Math.max(1, Math.ceil(displayParticipants.length / 4)), [displayParticipants.length]);

  const getUsernameById = useCallback((userId) => {
    const participant = participants.find(p => p.userId === userId);
    return participant ? (participant.isLocal ? user.username : participant.username) : 'Another user';
  }, [participants, user.username]);

  // Session persistence functions
  const saveSessionToStorage = useCallback((data) => {
    try {
      localStorage.setItem(`meeting_session_${roomId}`, JSON.stringify({
        ...data,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Error saving session to storage:', error);
    }
  }, [roomId]);

  const loadSessionFromStorage = useCallback(() => {
    try {
      const stored = localStorage.getItem(`meeting_session_${roomId}`);
      if (stored) {
        const data = JSON.parse(stored);
        if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
          return data;
        }
      }
    } catch (error) {
      console.error('Error loading session from storage:', error);
    }
    return null;
  }, [roomId]);

  const restoreSessionData = useCallback((sessionData) => {
    if (sessionData) {
      console.log('Restoring session data:', sessionData);

      if (sessionData.uploadedFiles && sessionData.uploadedFiles.length > 0) {
        const imageFile = sessionData.uploadedFiles.find(f => f.type === 'image');
        const audioFile = sessionData.uploadedFiles.find(f => f.type === 'audio');

        if (imageFile) {
          console.log('Restoring image:', imageFile);
          setImageUrl(imageFile.url);
          setCurrentUploader(imageFile.uploadedBy);
          setUploaderUsername(imageFile.uploadedByUsername);
        }

        if (audioFile) {
          console.log('Restoring audio:', audioFile);
          setAudioUrl(audioFile.url);
          setCurrentUploader(audioFile.uploadedBy);
          setUploaderUsername(audioFile.uploadedByUsername);
        }
      }

      if (sessionData.aiState) {
        console.log('Restoring AI state:', sessionData.aiState);
        if (sessionData.aiState.output) {
          let output = sessionData.aiState.output;
          if (typeof output === 'string') {
            try {
              const parsed = JSON.parse(output);
              if (typeof parsed === 'object') {
                if (parsed.answer) {
                  output = parsed.answer;
                } else if (parsed.response) {
                  output = parsed.response;
                } else if (parsed.text) {
                  output = parsed.text;
                } else if (parsed.result) {
                  output = parsed.result;
                } else if (parsed.data && parsed.data.answer) {
                  output = parsed.data.answer;
                } else if (parsed.data && parsed.data.response) {
                  output = parsed.data.response;
                } else {
                  const firstStringValue = Object.values(parsed).find(val => typeof val === 'string');
                  output = firstStringValue || output;
                }
              }
            } catch (e) {
              console.log('Could not parse AI output, using as string:', output);
            }
          }
          setOutput(output);
        }
        if (sessionData.aiState.isProcessing) {
          setIsProcessing(true);
          setCurrentUploader(sessionData.aiState.currentUploader);
          setUploaderUsername(sessionData.aiState.uploaderUsername);
        }
      }

      if (sessionData.chatMessages) {
        console.log('Restoring chat messages:', sessionData.chatMessages);
        setMessages(sessionData.chatMessages);
      }

      setSessionRestored(true);
    }
  }, []);

  // Optimized ICE Servers with caching and timeout
  const getIceServers = useCallback(async () => {
    const now = Date.now();
    const cacheExpiry = 5 * 60 * 1000;

    if (iceServersCache.current && (now - lastIceFetch.current) < cacheExpiry) {
      return iceServersCache.current;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const { data } = await axios.get(`${SERVER_URL}/ice-servers`, {
        signal: controller.signal,
        timeout: 2000
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

  // Optimized Peer Connection with signaling state management
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
      }, 8000);

      connectionTimeouts.current.set(remoteSocketId, connectionTimeout);

      pc.ontrack = (event) => {
        clearTimeout(connectionTimeout);
        connectionTimeouts.current.delete(remoteSocketId);
        setParticipants((prev) =>
          prev.map((p) =>
            p.userId === remoteSocketId ? { ...p, stream: event.streams[0] } : p
          )
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

  // Save session data when it changes
  const saveCurrentSession = useCallback(() => {
    const sessionData = {
      uploadedFiles: [],
      aiState: {
        isProcessing,
        currentUploader,
        uploaderUsername,
        output
      },
      chatMessages: messages
    };

    if (imageUrl) {
      sessionData.uploadedFiles.push({
        type: 'image',
        url: imageUrl,
        uploadedBy: currentUploader,
        uploadedByUsername: uploaderUsername
      });
    }

    if (audioUrl) {
      sessionData.uploadedFiles.push({
        type: 'audio',
        url: audioUrl,
        uploadedBy: currentUploader,
        uploadedByUsername: uploaderUsername
      });
    }

    saveSessionToStorage(sessionData);
  }, [imageUrl, audioUrl, isProcessing, currentUploader, uploaderUsername, output, messages, saveSessionToStorage]);

  // AI Zoom Bot Socket Handlers
  const handleAiStartProcessing = useCallback(({ userId, username }) => {
    console.log(`Received ai-start-processing: userId=${userId}, username=${username}`);
    setIsProcessing(true);
    setCurrentUploader(userId);
    setUploaderUsername(username || getUsernameById(userId));
    setIsPlaying(false);

    setOutput('');
  }, [getUsernameById]);

  const handleAiFinishProcessing = useCallback(({ response }) => {
    console.log(`Received ai-finish-processing: response=`, response);
    setIsProcessing(false);
    setCurrentUploader(null);
    setUploaderUsername('');

    let displayResponse = '';
    if (typeof response === 'object') {
      if (response.answer) {
        displayResponse = response.answer;
      } else if (response.response) {
        displayResponse = response.response;
      } else if (response.text) {
        displayResponse = response.text;
      } else if (response.result) {
        displayResponse = response.result;
      } else if (response.data && response.data.answer) {
        displayResponse = response.data.answer;
      } else if (response.data && response.data.response) {
        displayResponse = response.data.response;
      } else {
        const firstStringValue = Object.values(response).find(val => typeof val === 'string');
        displayResponse = firstStringValue || JSON.stringify(response, null, 2);
      }
    } else {
      displayResponse = String(response);
    }

    console.log(`Setting output to:`, displayResponse);
    setOutput(displayResponse);
  }, []);

  const handleAiImageUploaded = useCallback(({ url, userId, username }) => {
    console.log(`Received ai-image-uploaded: url=${url}, userId=${userId}, username=${username}`);
    setImageUrl(url);
    setCurrentUploader(userId);
    setUploaderUsername(username || getUsernameById(userId));
  }, [getUsernameById]);

  const handleAiAudioUploaded = useCallback(({ url, userId, username }) => {
    console.log(`Received ai-audio-uploaded: url=${url}, userId=${userId}, username=${username}`);
    setAudioUrl(url);
    setCurrentUploader(userId);
    setUploaderUsername(username || getUsernameById(userId));
    setIsPlaying(false);
  }, [getUsernameById]);

  const handleAiBotLocked = useCallback(({ userId, username }) => {
    console.log(`Received ai-bot-locked: userId=${userId}, username=${username}`);
    setIsBotLocked(true);
    setCurrentUploader(userId);
    setUploaderUsername(username || getUsernameById(userId));

    if (userId !== socketRef.current?.id) {
      setOutput('');
    }
  }, [getUsernameById]);

  const handleAiBotUnlocked = useCallback(() => {
    console.log('Received ai-bot-unlocked');
    setIsBotLocked(false);
    setCurrentUploader(null);
    setUploaderUsername('');

    setIsProcessing(false);
  }, []);

  const handleAiAudioPlay = useCallback(() => {
    console.log('Received ai-audio-play');
    setIsPlaying(true);
  }, []);

  const handleAiAudioPause = useCallback(() => {
    console.log('Received ai-audio-pause');
    setIsPlaying(false);
  }, []);

  // Setup Socket Listeners
  const setupSocketListeners = useCallback((socket) => {
    const handleConnect = () => {
      console.log('Socket connected:', socket.id);
      socket.emit('join-room', {
        roomId,
        username: user.username,
        isReconnect: isReconnecting
      }, (otherUsers, sessionData) => {
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

        if (sessionData) {
          console.log('Restoring session data from server:', sessionData);
          restoreSessionData(sessionData);
        } else {
          const storedSession = loadSessionFromStorage();
          if (storedSession) {
            console.log('Restoring session data from local storage:', storedSession);
            restoreSessionData(storedSession);
          }
        }

        setIsReconnecting(false);
        setIsLoading(false);
      });
    };

    const handleUserJoined = async ({ userId, username, isHost, isReconnect }) => {
      if (isReconnect) {
        console.log('Skipping user-joined for reconnection:', username);
        return;
      }

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

      try {
        const pc = await createPeerConnection(userId);
        const currentState = signalingStates.current.get(userId);

        if (currentState === 'new' || currentState === 'stable') {
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
              console.log('Adding track for user:', userId, track);
              pc.addTrack(track, localStreamRef.current);
            });
          } else {
            console.warn('localStreamRef.current is null for user:', userId);
            return;
          }

          signalingStates.current.set(userId, 'have-local-offer');
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          pendingOffers.current.set(userId, offer);
          socket.emit('offer', { to: userId, offer, username: user.username });
        }
      } catch (err) {
        console.error('Error in user-joined handler:', err, { userId, username });
        toast.error(`Failed to connect to user ${username}.`);
      }
    };

    const handleOffer = async ({ from, offer, username }) => {
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
        const currentState = signalingStates.current.get(from);

        if (currentState === 'new' || currentState === 'stable') {
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
          }

          signalingStates.current.set(from, 'have-remote-offer');
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signalingStates.current.set(from, 'stable');
          socket.emit('answer', { to: from, answer });
        } else {
          console.warn('Ignoring offer from', from, 'due to invalid state:', currentState);
        }
      } catch (err) {
        console.error('Error in offer handler:', err, { from, username });
        toast.error(`Failed to process offer from ${username}.`);
      }
    };

    const handleAnswer = ({ from, answer }) => {
      const pc = peerConnections.current.get(from);
      const currentState = signalingStates.current.get(from);

      if (pc && currentState === 'have-local-offer') {
        pc.setRemoteDescription(new RTCSessionDescription(answer))
          .then(() => {
            signalingStates.current.set(from, 'stable');
            pendingOffers.current.delete(from);
            console.log('Answer processed successfully for user:', from);
          })
          .catch(err => {
            console.error('Error setting remote description:', err);
            signalingStates.current.set(from, 'stable');
            pendingOffers.current.delete(from);
          });
      } else {
        console.warn('Ignoring answer from', from, 'due to invalid state:', currentState);
      }
    };

    const handleIceCandidate = ({ from, candidate }) => {
      const pc = peerConnections.current.get(from);
      if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
          console.error('ICE candidate error:', err);
        });
      }
    };

    const handleUserLeft = (userId) => {
      const pc = peerConnections.current.get(userId);
      if (pc) {
        pc.getSenders().forEach(sender => sender.track && sender.track.stop());
        pc.close();
        peerConnections.current.delete(userId);
      }
      setParticipants((prev) => {
        const updated = prev.filter((p) => p.userId !== userId);
        if (pinnedParticipantId === userId) {
          setPinnedParticipantId(null);
        }
        return updated;
      });
      toast.info('A user has left the meeting.');
    };

    const handleChatMessage = (payload) => setMessages(prev => [...prev, payload]);
    const handleScreenShareStart = ({ userId }) => setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: true } : p));
    const handleScreenShareStop = ({ userId }) => setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: false } : p));
    const handleError = ({ message }) => toast.error(message);
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
      if (tool === 'rectangle') {
        ctx.rect(sX, sY, eX - sX, eY - sY);
      } else if (tool === 'circle') {
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
    socket.on('ai-start-processing', handleAiStartProcessing);
    socket.on('ai-finish-processing', handleAiFinishProcessing);
    socket.on('ai-image-uploaded', handleAiImageUploaded);
    socket.on('ai-audio-uploaded', handleAiAudioUploaded);
    socket.on('ai-bot-locked', handleAiBotLocked);
    socket.on('ai-bot-unlocked', handleAiBotUnlocked);
    socket.on('ai-audio-play', handleAiAudioPlay);
    socket.on('ai-audio-pause', handleAiAudioPause);
    socket.on('session-restored', (sessionData) => {
      console.log('Session restored from server:', sessionData);
      restoreSessionData(sessionData);
    });

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
      socket.off('ai-start-processing', handleAiStartProcessing);
      socket.off('ai-finish-processing', handleAiFinishProcessing);
      socket.off('ai-image-uploaded', handleAiImageUploaded);
      socket.off('ai-audio-uploaded', handleAiAudioUploaded);
      socket.off('ai-bot-locked', handleAiBotLocked);
      socket.off('ai-bot-unlocked', handleAiBotUnlocked);
      socket.off('ai-audio-play', handleAiAudioPlay);
      socket.off('ai-audio-pause', handleAiAudioPause);
      socket.off('session-restored');
    };
  }, [
    createPeerConnection,
    roomId,
    user,
    getUsernameById,
    handleAiStartProcessing,
    handleAiFinishProcessing,
    handleAiImageUploaded,
    handleAiAudioUploaded,
    handleAiBotLocked,
    handleAiBotUnlocked,
    handleAiAudioPlay,
    handleAiAudioPause,
    restoreSessionData,
    isReconnecting
  ]);

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
          video: { width: { ideal: 480, max: 640 }, height: { ideal: 360, max: 480 }, frameRate: { ideal: 15, max: 20 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 44100 }
        };
        const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];
        console.log('Optimized local stream initialized:', stream);
        const storedSession = loadSessionFromStorage();
        const isReconnecting = !!storedSession;
        if (isReconnecting) {
          setIsReconnecting(true);
          console.log('Attempting to reconnect to meeting...');
        }
        socketRef.current = io(SERVER_URL, {
          auth: { token: user.token },
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: 3,
          reconnectionDelay: 500,
          reconnectionDelayMax: 2000,
          timeout: 5000,
          forceNew: true
        });
        const cleanupSocketListeners = setupSocketListeners(socketRef.current);
        return () => {
          console.log('Cleaning up Meeting component');
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
          }
          peerConnections.current.forEach(pc => pc.close());
          peerConnections.current.clear();
          connectionTimeouts.current.forEach(timeout => clearTimeout(timeout));
          connectionTimeouts.current.clear();
          signalingStates.current.clear();
          pendingOffers.current.clear();
          pendingAnswers.current.clear();
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

  useEffect(() => {
    if (sessionRestored) {
      saveCurrentSession();
      try {
        const token = user?.token;
        if (token) {
          const aiStatePayload = { isProcessing, currentUploader, uploaderUsername, output };
          axios.post(`${SERVER_URL}/api/meeting-session/${roomId}/ai-state`, aiStatePayload, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
          if (imageUrl) {
            axios.post(`${SERVER_URL}/api/meeting-session/${roomId}/upload`, { type: 'image', url: imageUrl, uploadedBy: currentUploader, uploadedByUsername: uploaderUsername }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
          }
          if (audioUrl) {
            axios.post(`${SERVER_URL}/api/meeting-session/${roomId}/upload`, { type: 'audio', url: audioUrl, uploadedBy: currentUploader, uploadedByUsername: uploaderUsername }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
          }
        }
      } catch {}
    }
  }, [imageUrl, audioUrl, isProcessing, currentUploader, uploaderUsername, output, messages, saveCurrentSession, sessionRestored]);

  useEffect(() => { if (isProcessing) { setOutput(''); } }, [isProcessing]);
  useEffect(() => {
    const canvas = annotationCanvasRef.current;
    const container = mainVideoContainerRef.current;
    if (!container || !canvas) return;
    const resizeCanvas = () => { canvas.width = container.clientWidth; canvas.height = container.clientHeight; };
    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [mainViewParticipant]);

  const replaceTrack = useCallback(async (newTrack, isScreenShare = false) => {
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
      socketRef.current?.emit('toggle-video', { enabled: false, roomId });
    } else {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 480, max: 640 }, height: { ideal: 360, max: 480 }, frameRate: { ideal: 15, max: 20 } } });
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
    setGridPage((prev) => {
      const next = prev + direction;
      return Math.max(0, Math.min(next, totalGridPages - 1));
    });
  };

  const handleToolbarMouseDown = (e) => {
    const toolbar = e.currentTarget.parentElement;
    const rect = toolbar.getBoundingClientRect();
    dragInfo.current = { isDragging: true, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, };
    window.addEventListener('mousemove', handleToolbarMouseMove);
    window.addEventListener('mouseup', handleToolbarMouseUp);
  };

  const handleToolbarMouseMove = (e) => {
    if (dragInfo.current.isDragging) {
      setToolbarPosition({ x: e.clientX - dragInfo.current.offsetX, y: e.clientY - dragInfo.current.offsetY, });
    }
  };

  const handleToolbarMouseUp = () => {
    dragInfo.current.isDragging = false;
    window.removeEventListener('mousemove', handleToolbarMouseMove);
    window.removeEventListener('mouseup', handleToolbarMouseUp);
  };

  const handleMouseDown = (e) => {
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
  };

  const handleMouseMove = (e) => {
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
  };

  const handleMouseUp = (e) => {
    if (!drawingStateRef.current.isDrawing) return;
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    if (currentTool === 'rectangle' || currentTool === 'circle') {
      const rect = canvas.getBoundingClientRect();
      const { startX, startY } = drawingStateRef.current;
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;
      const myColor = getColorForId(socketRef.current?.id);
      const payload = { tool: currentTool, startX: startX / canvas.width, startY: startY / canvas.height, endX: endX / canvas.width, endY: endY / canvas.height, color: myColor, size: currentBrushSize };
      socketRef.current?.emit('draw-shape', payload);
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = myColor;
      ctx.lineWidth = currentBrushSize;
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      if (currentTool === 'rectangle') {
        ctx.rect(startX, startY, endX - startX, endY - startY);
      } else if (currentTool === 'circle') {
        const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
      }
      ctx.stroke();
    }
    drawingStateRef.current = { isDrawing: false, startX: 0, startY: 0 };
  };

  const handleParticipantClick = (userId) => {
    setPinnedParticipantId(userId);
    setCurrentOffset(0);
  };

  const clearAnnotations = () => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socketRef.current?.emit('clear-canvas');
  };

  const handleExitRoom = () => {
    try { socketRef.current?.emit('leave-room'); } catch (e) { console.warn('Error emitting leave-room:', e); }
    try { localStorage.removeItem(`meeting_session_${roomId}`); } catch (e) { console.warn('Error clearing local session:', e); }
    setImageUrl(''); setAudioUrl(''); setOutput(''); setIsProcessing(false); setCurrentUploader(null); setUploaderUsername(''); setIsBotLocked(false); setIsPlaying(false);
    navigate('/home');
  };

  if (isLoading) return <div className="h-screen bg-black flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  const renderVideoPlayer = (participant, isLocal, className = "mx-auto") => (
    <VideoPlayer
      participant={participant}
      isLocal={isLocal}
      isPinned={pinnedParticipantId === participant.userId}
      isMirroringBrowser={isMirroringBrowser}
      socketId={socketRef.current?.id}
      className={className}
    />
  );

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden text-white">
      <div className="bg-gray-900 px-2 py-1 flex items-center justify-between z-20">
        <h1 className="text-lg font-semibold">Meeting: {roomId}</h1>
        <span>Participants: {participants.length}</span>
      </div>
      <div className="flex-1 flex relative overflow-hidden">
        <div
          className="flex-1 flex flex-col relative overflow-hidden"
          onWheel={(e) => {
            if (e.deltaX !== 0 && totalGridPages > 1) {
              e.preventDefault();
              handleSwipe(e.deltaX > 0 ? 1 : -1);
            }
          }}
        >
          {isSomeoneScreenSharing && (
            <div style={{ position: 'absolute', top: toolbarPosition.y, left: toolbarPosition.x, zIndex: 50 }}>
              <AnnotationToolbar onMouseDown={handleToolbarMouseDown} currentTool={currentTool} setCurrentTool={setCurrentTool} currentBrushSize={currentBrushSize} setCurrentBrushSize={setCurrentBrushSize} clearCanvas={clearAnnotations} />
            </div>
          )}
          <div
            className="flex-1 min-h-0 relative overflow-hidden h-full"
            ref={mainVideoContainerRef}
            onTouchStart={(e) => { touchStartXRef.current = e.touches[0].clientX; touchDeltaRef.current = 0; }}
            onTouchMove={(e) => { touchDeltaRef.current = e.touches[0].clientX - touchStartXRef.current; }}
            onTouchEnd={() => { if (Math.abs(touchDeltaRef.current) > 50) { setGridPage((prev) => { const dir = touchDeltaRef.current > 0 ? -1 : 1; const np = Math.max(0, Math.min(prev + dir, totalGridPages - 1)); return np; }); } }}
          >
            {/****************************************************************/}
            {/* START: REVISED LAYOUT FOR TALLER FRAMES AND SPACING          */}
            {/****************************************************************/}
            {(() => {
              const count = displayParticipants.length;
              const pageStart = gridPage * 4;
              const pageItems = displayParticipants.slice(pageStart, pageStart + 4);

              // 1 participant: Full screen with padding
              if (count === 1) {
                const p = displayParticipants[0];
                return (
                  <div className="w-full h-full flex items-center justify-center p-2">
                    <div className="w-full h-full">
                      {renderVideoPlayer(p, p.isLocal, "w-full h-full object-cover")}
                    </div>
                  </div>
                );
              }

              // 2 or 3 participants: TALL vertical stack with spacing
              if (count === 2 || count === 3) {
                return (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
                    {displayParticipants.map(p => (
                      <div key={p.userId} className="w-full flex-1 min-h-0">
                         {/* Using object-contain to prevent cropping when aspect ratios differ */}
                         {renderVideoPlayer(p, p.isLocal, "w-full h-full object-contain")}
                      </div>
                    ))}
                  </div>
                );
              }

              // 4 or more -> paginated 2x2 grid with spacing
              return (
                <div className="w-full h-full p-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 w-full h-full gap-2">
                    {pageItems.map((p) => (
                      <div
                        key={p.userId}
                        className="w-full h-full flex items-center justify-center"
                      >
                        {renderVideoPlayer(p, p.isLocal, "w-full h-full object-cover")}
                      </div>
                    ))}
                  </div>
                  {totalGridPages > 1 && (
                    <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-2">
                      <button onClick={() => setGridPage((p) => Math.max(0, p - 1))} className="px-2 py-1 bg-gray-700 bg-opacity-70 rounded">‹</button>
                      {Array.from({ length: totalGridPages }, (_, i) => (
                        <button key={i} onClick={() => setGridPage(i)} className={`w-2.5 h-2.5 rounded-full ${gridPage === i ? 'bg-white' : 'bg-gray-500'}`} />
                      ))}
                      <button onClick={() => setGridPage((p) => Math.min(totalGridPages - 1, p + 1))} className="px-2 py-1 bg-gray-700 bg-opacity-70 rounded">›</button>
                    </div>
                  )}
                </div>
              );
            })()}
            {/****************************************************************/}
            {/* END: REVISED LAYOUT                                          */}
            {/****************************************************************/}
            <canvas
              ref={annotationCanvasRef}
              className="absolute top-0 left-0"
              style={{ pointerEvents: isSomeoneScreenSharing ? 'auto' : 'none', zIndex: 10, touchAction: 'none' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>
        </div>
        <div className={`bg-gray-900 border-l border-gray-700 transition-all duration-300 ${isChatOpen || isParticipantsOpen ? 'w-80' : 'w-0'} overflow-hidden`}>
          {isChatOpen && <Chat messages={messages} onSendMessage={(message) => {
            const payload = { message, username: user.username, timestamp: new Date().toISOString() };
            socketRef.current?.emit('send-chat-message', payload);
            setMessages((prev) => [...prev, payload]);
          }} currentUser={user} onClose={() => setIsChatOpen(false)} />}
          {isParticipantsOpen && <Participants participants={participants} currentUser={user} onClose={() => setIsParticipantsOpen(false)} roomId={roomId} />}
        </div>
      </div>
      <div className="bg-gray-900 border-t border-gray-700 px-2 py-1 flex justify-center gap-1 z-20 relative">
        <button onClick={toggleAudio} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">{isAudioMuted ? 'Unmute 🎤' : 'Mute 🔇'}</button>
        <button onClick={toggleVideo} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">{isVideoEnabled ? 'Stop Video 📷' : 'Start Video 📹'}</button>
        <button onClick={handleScreenShare} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">{isSharingScreen ? 'Stop Sharing' : 'Share Screen 🖥️'}</button>
        <button onClick={() => { setIsChatOpen(o => !o); setIsParticipantsOpen(false); }} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">Chat 💬</button>
        <button onClick={() => { setIsParticipantsOpen(o => !o); setIsChatOpen(false); }} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">Participants 👥</button>
        <div className="relative">
          <button onClick={() => setShowAiMiniCard(v => !v)} className="p-2 rounded text-white bg-purple-600 hover:bg-purple-500">AI Tools</button>
          {showAiMiniCard && (
            <div className="absolute bottom-12 right-0 w-80 bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
              {isBotLocked && currentUploader !== socketRef.current?.id && (
                <div className="mb-2 text-xs p-2 bg-yellow-700 rounded">{uploaderUsername || 'Another user'} is processing...</div>
              )}
              <div className="space-y-2">
                <div>
                  <label className="block text-sm mb-1">Upload Image</label>
                  <input type="file" accept="image/*" onChange={(e) => { if (!(isBotLocked && currentUploader !== socketRef.current?.id)) { const f = e.target.files?.[0]; if (f) setSelectedImage(f); } }} disabled={isProcessing || (isBotLocked && currentUploader !== socketRef.current?.id)} className="w-full text-sm" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Upload Audio</label>
                  <input type="file" accept="audio/*" onChange={(e) => { if (!(isBotLocked && currentUploader !== socketRef.current?.id)) { const f = e.target.files?.[0]; if (f) setSelectedAudio(f); } }} disabled={isProcessing || (isBotLocked && currentUploader !== socketRef.current?.id)} className="w-full text-sm" />
                </div>
                <button onClick={async () => { const hasImg = !!(selectedImage || imageUrl); const hasAud = !!(selectedAudio || audioUrl); if (!hasImg || !hasAud) { toast.error('Please upload both image and audio to process.'); return; } if (isBotLocked && currentUploader !== socketRef.current?.id) { toast.error('Another user is currently processing. Please wait.'); return; } try { setOutput(''); setIsBotLocked(true); socketRef.current?.emit('ai-bot-locked', { userId: socketRef.current?.id, username: user.username, roomId }); let effImg = imageUrl; let effAud = audioUrl; if (selectedImage && !effImg) { const fd = new FormData(); fd.append('file', selectedImage); const r = await axios.post(`${SERVER_URL}/upload/image`, fd, { headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${user.token}` } }); effImg = r.data?.url; setImageUrl(effImg); socketRef.current?.emit('ai-image-uploaded', { url: effImg, userId: socketRef.current?.id, username: user.username, roomId }); }
                  if (selectedAudio && !effAud) { const fd2 = new FormData(); fd2.append('file', selectedAudio); const r2 = await axios.post(`${SERVER_URL}/upload/audio`, fd2, { headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${user.token}` } }); effAud = r2.data?.url; setAudioUrl(effAud); socketRef.current?.emit('ai-audio-uploaded', { url: effAud, userId: socketRef.current?.id, username: user.username, roomId }); }
                  setIsProcessing(true); socketRef.current?.emit('ai-start-processing', { userId: socketRef.current?.id, username: user.username, roomId }); const fd3 = new FormData(); if (effImg) { const ir = await fetch(effImg); const ib = await ir.blob(); fd3.append('image', new File([ib], 'image.jpg', { type: ib.type || 'image/jpeg' })); } if (effAud) { const ar = await fetch(effAud); const ab = await ar.blob(); fd3.append('audio', new File([ab], 'audio.mp3', { type: ab.type || 'audio/mpeg' })); } const AI_MODEL_API_URL = 'https://genaizoom-1.onrender.com/predict'; const resp = await axios.post(AI_MODEL_API_URL, fd3, { headers: { 'Content-Type': 'multipart/form-data' } }); const modelOutput = resp.data?.result || resp.data; let disp = ''; if (typeof modelOutput === 'object') { disp = modelOutput.answer || modelOutput.response || modelOutput.text || modelOutput.result || (modelOutput.data && (modelOutput.data.answer || modelOutput.data.response)) || ''; if (!disp) { const firstStr = Object.values(modelOutput).find(v => typeof v === 'string'); disp = firstStr || JSON.stringify(modelOutput, null, 2); } } else { disp = String(modelOutput); } setOutput(disp); socketRef.current?.emit('ai-finish-processing', { response: modelOutput, roomId }); } catch (e) { console.error(e); toast.error('Failed to process with AI.'); } finally { setIsProcessing(false); setIsBotLocked(false); socketRef.current?.emit('ai-bot-unlocked', { roomId }); } }} disabled={isProcessing || isBotLocked || !(selectedImage || imageUrl) || !(selectedAudio || audioUrl)} className="w-full p-2 rounded bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700">{isProcessing ? 'Processing...' : 'Process with AI'}</button>
              </div>
            </div>
          )}
        </div>
        <button onClick={handleExitRoom} className="p-2 rounded text-white bg-red-600 hover:bg-red-500">Exit Room 📞</button>
      </div>
    </div>
  );
};

export default Meeting;