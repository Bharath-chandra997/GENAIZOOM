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
import LoadingSpinner from '../components/LoadingSpinner';
import Chat from '../components/Chat';
import Participants from '../components/Participants';
import VideoPlayer from '../components/VideoPlayer';
import AnnotationToolbar from '../components/AnnotationToolbar';
import UploadControls from '../components/UploadControls';

const SERVER_URL = 'https://genaizoomserver-0yn4.onrender.com';
const AI_MODEL_API_URL = 'https://genaizoom-1.onrender.com/predict';

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

  // Media/AI state
  const [imageUrl, setImageUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [output, setOutput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentUploader, setCurrentUploader] = useState(null);
  const [isBotLocked, setIsBotLocked] = useState(false);
  const [uploaderUsername, setUploaderUsername] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedAudio, setSelectedAudio] = useState(null);
  const [isMediaDisplayed, setIsMediaDisplayed] = useState(false);

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
  const displayParticipants = participants; // Remove AI agent frame entirely
  const totalGridPages = useMemo(() => Math.max(1, Math.ceil(displayParticipants.length / 4)), [displayParticipants.length]);

  const getUsernameById = useCallback((userId) => {
    const participant = participants.find(p => p.userId === userId);
    return participant ? (participant.isLocal ? user.username : participant.username) : 'Another user';
  }, [participants, user.username]);

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

  const handleAiStartProcessing = useCallback(({ userId, username }) => {
    console.log(`Received ai-start-processing: userId=${userId}, username=${username}`);
    setIsProcessing(true);
    setCurrentUploader(userId);
    setUploaderUsername(username || getUsernameById(userId));
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

  const handleAiProcessed = useCallback(({ response }) => {
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
    setOutput(displayResponse);
  }, []);

  const handleAiImageUploaded = useCallback(({ url, userId, username }) => {
    console.log(`Received ai-image-uploaded: url=${url}, userId=${userId}, username=${username}`);
    setImageUrl(url);
    setCurrentUploader(userId);
    setUploaderUsername(username || getUsernameById(userId));
  }, [getUsernameById]);

  const handleMediaUploaded = useCallback(({ imageUrl: img, audioUrl: aud, userId, username }) => {
    if (img) setImageUrl(img);
    if (aud) setAudioUrl(aud);
    setCurrentUploader(userId);
    setUploaderUsername(username || getUsernameById(userId));
  }, [getUsernameById]);

  const handleUploadNotification = useCallback(({ username }) => {
    const uploadMessage = {
      message: `📤 ${username} is uploading an image and audio file.`,
      username: 'System',
      timestamp: new Date().toISOString(),
      isSystemMessage: true
    };
    setMessages(prev => [...prev, uploadMessage]);
  }, []);

  const handleSharedMediaDisplay = useCallback(({ imageUrl: img, audioUrl: aud, username }) => {
    if (img) {
      if (imageUrl && imageUrl.startsWith('blob:')) try { URL.revokeObjectURL(imageUrl); } catch {}
      setImageUrl(img);
    }
    if (aud) {
      if (audioUrl && audioUrl.startsWith('blob:')) try { URL.revokeObjectURL(audioUrl); } catch {}
      setAudioUrl(aud);
    }
    setUploaderUsername(username);
    setIsMediaDisplayed(true);
    const displayMessage = {
      message: `📺 ${username} is now displaying the uploaded media.`,
      username: 'System',
      timestamp: new Date().toISOString(),
      isSystemMessage: true
    };
    setMessages(prev => [...prev, displayMessage]);
  }, [imageUrl, audioUrl]);

  const handleSharedMediaRemoval = useCallback(({ username }) => {
    setIsMediaDisplayed(false);
    if (imageUrl) try { URL.revokeObjectURL(imageUrl); } catch {}
    if (audioUrl) try { URL.revokeObjectURL(audioUrl); } catch {}
    setImageUrl('');
    setAudioUrl('');
    setOutput('');
    setUploaderUsername('');
    const removalMessage = {
      message: `🗑️ ${username || 'Someone'} removed the displayed media.`,
      username: 'System',
      timestamp: new Date().toISOString(),
      isSystemMessage: true
    };
    setMessages(prev => [...prev, removalMessage]);
  }, []);

  const handleAiProcessingNotification = useCallback(({ username }) => {
    const processingMessage = {
      message: `🤖 ${username} is analyzing the uploaded media with AI.`,
      username: 'System',
      timestamp: new Date().toISOString(),
      isSystemMessage: true
    };
    setMessages(prev => [...prev, processingMessage]);
  }, []);

  const handleSharedAiResult = useCallback(({ response, username }) => {
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
      } else if (response.prediction) {
        displayResponse = response.prediction;
      } else {
        displayResponse = JSON.stringify(response, null, 2);
      }
    } else {
      displayResponse = String(response);
    }
    setOutput(displayResponse);
    setUploaderUsername(username);
    const completionMessage = {
      message: `✅ ${username} completed AI analysis.`,
      username: 'System',
      timestamp: new Date().toISOString(),
      isSystemMessage: true
    };
    setMessages(prev => [...prev, completionMessage]);
  }, []);

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

  const setupSocketListeners = useCallback((socket) => {
    const handleConnect = () => {
      console.log('Socket connected:', socket.id);
      socket.emit('join-room', {
        roomId,
        username: user.username,
        isReconnect: false
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
        setIsLoading(false);
      });
    };

    const handleUserJoined = async ({ userId, username, isHost, isReconnect }) => {
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
      try {
        const pc = await createPeerConnection(userId);
        const currentState = signalingStates.current.get(userId);
        if (currentState === 'new' || currentState === 'stable') {
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
          }
          signalingStates.current.set(userId, 'have-local-offer');
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          pendingOffers.current.set(userId, offer);
          socket.emit('offer', { to: userId, offer, username: user.username });
        }
      } catch (err) {
        console.error('Error in user-joined handler:', err);
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
        }
      } catch (err) {
        console.error('Error in offer handler:', err);
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
          })
          .catch(err => {
            console.error('Error setting remote description:', err);
            signalingStates.current.set(from, 'stable');
            pendingOffers.current.delete(from);
          });
      }
    };

    const handleIceCandidate = ({ from, candidate }) => {
      const pc = peerConnections.current.get(from);
      if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => console.error('ICE candidate error:', err));
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
        if (pinnedParticipantId === userId) setPinnedParticipantId(null);
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
    socket.on('mediaUploaded', handleMediaUploaded);
    socket.on('ai-bot-locked', handleAiBotLocked);
    socket.on('ai-bot-unlocked', handleAiBotUnlocked);
    socket.on('ai-audio-play', handleAiAudioPlay);
    socket.on('ai-audio-pause', handleAiAudioPause);
    socket.on('media-display', () => setIsMediaDisplayed(true));
    socket.on('media-remove', () => setIsMediaDisplayed(false));
    socket.on('mediaDisplayed', () => setIsMediaDisplayed(true));
    socket.on('mediaRemoved', () => setIsMediaDisplayed(false));
    socket.on('aiProcessed', handleAiProcessed);
    socket.on('upload-notification', handleUploadNotification);
    socket.on('shared-media-display', handleSharedMediaDisplay);
    socket.on('shared-media-removal', handleSharedMediaRemoval);
    socket.on('ai-processing-notification', handleAiProcessingNotification);
    socket.on('shared-ai-result', handleSharedAiResult);

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
      socket.off('mediaUploaded', handleMediaUploaded);
      socket.off('ai-bot-locked', handleAiBotLocked);
      socket.off('ai-bot-unlocked', handleAiBotUnlocked);
      socket.off('ai-audio-play', handleAiAudioPlay);
      socket.off('ai-audio-pause', handleAiAudioPause);
      socket.off('media-display');
      socket.off('media-remove');
      socket.off('mediaDisplayed');
      socket.off('mediaRemoved');
      socket.off('aiProcessed', handleAiProcessed);
      socket.off('upload-notification', handleUploadNotification);
      socket.off('shared-media-display', handleSharedMediaDisplay);
      socket.off('shared-media-removal', handleSharedMediaRemoval);
      socket.off('ai-processing-notification', handleAiProcessingNotification);
      socket.off('shared-ai-result', handleSharedAiResult);
    };
  }, [
    createPeerConnection,
    roomId,
    user,
    getUsernameById,
    handleAiStartProcessing,
    handleAiFinishProcessing,
    handleAiImageUploaded,
    handleMediaUploaded,
    handleAiAudioUploaded,
    handleAiBotLocked,
    handleAiBotUnlocked,
    handleAiAudioPlay,
    handleAiAudioPause,
    handleAiProcessed,
    handleUploadNotification,
    handleSharedMediaDisplay,
    handleSharedMediaRemoval,
    handleAiProcessingNotification,
    handleSharedAiResult,
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
    if (isProcessing) setOutput('');
  }, [isProcessing]);

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

  const handleToolbarMouseMove = (e) => {
    if (dragInfo.current.isDragging) {
      setToolbarPosition({
        x: e.clientX - dragInfo.current.offsetX,
        y: e.clientY - dragInfo.current.offsetY,
      });
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

  const handleProcessWithAI = async () => {
    const hasImg = !!selectedImage;
    const hasAud = !!selectedAudio;
    
    if (!hasImg || !hasAud) {
      toast.error('Please upload both image and audio to process.');
      return;
    }
    
    if (isBotLocked && currentUploader !== socketRef.current?.id) {
      toast.error('Another user is currently processing. Please wait.');
      return;
    }
    
    try {
      setOutput('');
      setIsBotLocked(true);
      socketRef.current?.emit('ai-bot-locked', { userId: socketRef.current?.id, username: user.username, roomId });
      setIsProcessing(true);
      socketRef.current?.emit('ai-start-processing', { userId: socketRef.current?.id, username: user.username, roomId });
      socketRef.current?.emit('ai-processing-notification', { username: user.username, roomId });
      
      const formData = new FormData();
      formData.append('image', selectedImage);
      formData.append('audio', selectedAudio);
      
      try {
        await axios.post(`${SERVER_URL}/api/meeting-session/${roomId}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${user.token}` }
        });
      } catch {}

      const response = await axios.post(AI_MODEL_API_URL, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const modelOutput = response.data?.prediction ?? response.data?.result ?? response.data;
      let displayResponse = '';
      if (typeof modelOutput === 'object') {
        displayResponse = modelOutput.answer || modelOutput.response || modelOutput.text || 
                        modelOutput.result || modelOutput.prediction || (modelOutput.data && (modelOutput.data.answer || modelOutput.data.response)) || '';
        if (!displayResponse) {
          const firstStringValue = Object.values(modelOutput).find(val => typeof val === 'string');
          displayResponse = firstStringValue || JSON.stringify(modelOutput, null, 2);
        }
      } else {
        displayResponse = String(modelOutput);
      }
      setOutput(displayResponse);
      socketRef.current?.emit('ai-finish-processing', { response: modelOutput, roomId });
      socketRef.current?.emit('aiProcessed', { response: modelOutput, roomId });
      socketRef.current?.emit('shared-ai-result', { response: modelOutput, username: user.username, roomId });
    } catch (error) {
      console.error('AI processing error:', error);
      const status = error?.response?.status;
      const detail = error?.response?.data?.detail || error?.message || 'Unknown error';
      toast.error('AI analysis failed. Please try again.');
      console.debug('[Analyze] Failure details:', { status, detail });
    } finally {
      setIsProcessing(false);
      setIsBotLocked(false);
      socketRef.current?.emit('ai-bot-unlocked', { roomId });
    }
  };

  const handleExitRoom = () => {
    try {
      socketRef.current?.emit('leave-room');
    } catch (e) {
      console.warn('Error emitting leave-room:', e);
    }
    setImageUrl('');
    setAudioUrl('');
    setOutput('');
    setIsProcessing(false);
    setCurrentUploader(null);
    setUploaderUsername('');
    setIsBotLocked(false);
    setIsPlaying(false);
    navigate('/home');
  };

  if (isLoading) return <div className="h-screen bg-black flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden text-white">
      <MeetingHeader roomId={roomId} participants={participants} />
      <MeetingMainArea
        participants={participants}
        isMediaDisplayed={isMediaDisplayed}
        imageUrl={imageUrl}
        audioUrl={audioUrl}
        output={output}
        uploaderUsername={uploaderUsername}
        isProcessing={isProcessing}
        handleProcessWithAI={handleProcessWithAI}
        isBotLocked={isBotLocked}
        currentUploader={currentUploader}
        socketId={socketRef.current?.id}
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
        user={user}
        roomId={roomId}
        selectedImage={selectedImage}
        setSelectedImage={setSelectedImage}
        selectedAudio={selectedAudio}
        setSelectedAudio={setSelectedAudio}
        handleExitRoom={handleExitRoom}
      />
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
        participants={participants}
        onCloseParticipants={() => setIsParticipantsOpen(false)}
        roomId={roomId}
      />
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
        handleExitRoom={handleExitRoom}
      />
    </div>
  );
};

export default Meeting;