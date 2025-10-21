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

const AIAvatar = ({ size = 40 }) => (
  <div
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
        border: '2px solid white',
      }}
    />
  </div>
);

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

  const getUsernameById = useCallback(
    (socketId) => {
      const p = allParticipants.find(p => p.socketId === socketId);
      return p ? (p.isLocal ? user.username : p.username) : 'Another user';
    },
    [allParticipants, user.username]
  );

  const copyInviteLink = useCallback(() => {
    const link = `${window.location.origin}/join/${roomId}`;
    navigator.clipboard.writeText(link).then(
      () => toast.success('Invite link copied!', { position: 'bottom-center', autoClose: 3000 }),
      () => toast.error('Failed to copy')
    );
  }, [roomId]);

  /* ------------------------------------------------------------------ */
  /* AI animation – unchanged */
  /* ------------------------------------------------------------------ */
  const initializeAiAnimation = useCallback(() => {
    const canvas = aiCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let time = 0;

    const create = () => {
      particles = Array.from({ length: 30 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 1,
        speed: Math.random() * 1 + 0.5,
        color: `hsl(${200 + Math.random() * 60}, 70%, 60%)`,
        angle: Math.random() * Math.PI * 2,
      }));
    };

    const animate = () => {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      time += 0.02;

      particles.forEach((p, i) => {
        p.x += Math.cos(p.angle + time) * p.speed;
        p.y += Math.sin(p.angle + time) * p.speed;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        particles.slice(i + 1).forEach(o => {
          const d = Math.hypot(p.x - o.x, p.y - o.y);
          if (d < 80) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(100, 200, 255, ${0.2 * (1 - d / 80)})`;
            ctx.lineWidth = 0.3;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(o.x, o.y);
            ctx.stroke();
          }
        });
      });

      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = 'rgba(96, 165, 250, 0.9)';
      ctx.textAlign = 'center';
      ctx.fillText('AI Assistant', canvas.width / 2, canvas.height / 2 - 10);

      ctx.font = '12px sans-serif';
      ctx.fillStyle = aiBotInUse ? 'rgba(239, 68, 68, 0.7)' : 'rgba(96, 165, 250, 0.7)';
      ctx.fillText(aiBotInUse ? `In use by ${currentAIUser}` : 'Ready to help', canvas.width / 2, canvas.height / 2 + 15);

      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, 25 + Math.sin(time * 2) * 3, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(96, 165, 250, ${0.5 + Math.sin(time) * 0.3})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      aiAnimationRef.current = requestAnimationFrame(animate);
    };

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      create();
    };
    resize();
    window.addEventListener('resize', resize);
    animate();

    return () => {
      cancelAnimationFrame(aiAnimationRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [aiBotInUse, currentAIUser]);

  useEffect(() => initializeAiAnimation(), [initializeAiAnimation]);

  /* ------------------------------------------------------------------ */
  /* AI request handling – unchanged */
  /* ------------------------------------------------------------------ */
  const handleAIRequest = useCallback(
    async (imageFile, audioFile) => {
      if (aiBotInUse) {
        toast.error('AI Bot is currently in use by another user');
        return;
      }
      setAiBotInUse(true);
      setCurrentAIUser(user.username);
      setAiUploadedImage(imageFile);
      setAiUploadedAudio(audioFile);

      setTimeout(() => {
        const resp = `Hello ${user.username}! I've processed your ${imageFile ? 'image' : ''}${imageFile && audioFile ? ' and ' : ''}${audioFile ? 'audio' : ''}.`;
        setAiResponse(resp);
        socketRef.current?.emit('ai-response', {
          user: user.username,
          response: resp,
          image: imageFile ? URL.createObjectURL(imageFile) : null,
          audio: audioFile ? URL.createObjectURL(audioFile) : null,
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

  /* ------------------------------------------------------------------ */
  /* ICE servers */
  /* ------------------------------------------------------------------ */
  const getIceServers = useCallback(async () => {
    const now = Date.now();
    if (iceServersCache.current && now - lastIceFetch.current < 5 * 60 * 1000) {
      return iceServersCache.current;
    }
    try {
      const { data } = await axios.get(`${SERVER_URL}/ice-servers`, { timeout: 5000 });
      iceServersCache.current = data;
      lastIceFetch.current = now;
      return data;
    } catch {
      const fallback = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];
      iceServersCache.current = fallback;
      lastIceFetch.current = now;
      return fallback;
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /* Peer connection */
  /* ------------------------------------------------------------------ */
  const createPeerConnection = useCallback(
    async (remoteSocketId) => {
      if (peerConnections.current.has(remoteSocketId)) {
        return peerConnections.current.get(remoteSocketId);
      }

      const ice = await getIceServers();
      const pc = new RTCPeerConnection({
        iceServers: ice,
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      });

      const timeout = setTimeout(() => {
        if (pc.connectionState === 'connecting') {
          pc.close();
          peerConnections.current.delete(remoteSocketId);
          connectionTimeouts.current.delete(remoteSocketId);
        }
      }, 15000);
      connectionTimeouts.current.set(remoteSocketId, timeout);

      localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));

      /* ---- ontrack – safe add / update ---- */
      pc.ontrack = (e) => {
        const stream = e.streams[0];
        if (!stream) return;
        clearTimeout(connectionTimeouts.current.get(remoteSocketId));
        connectionTimeouts.current.delete(remoteSocketId);

        setParticipants(prev => {
          const exists = prev.some(p => p.socketId === remoteSocketId);
          if (!exists) {
            return [
              ...prev,
              {
                socketId: remoteSocketId,
                userId: remoteSocketId,
                username: 'Connecting...',
                stream,
                isLocal: false,
                isHost: false,
                videoEnabled: true,
                audioEnabled: true,
                isScreenSharing: false,
              },
            ];
          }
          return prev.map(p => (p.socketId === remoteSocketId ? { ...p, stream } : p));
        });
      };

      pc.onicecandidate = e => {
        if (e.candidate) {
          socketRef.current?.emit('ice-candidate', { to: remoteSocketId, candidate: e.candidate });
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
    },
    [getIceServers, getUsernameById]
  );

  /* ------------------------------------------------------------------ */
  /* Socket listeners */
  /* ------------------------------------------------------------------ */
  const setupSocketListeners = useCallback(
    socket => {
      const onConnect = () => {
        socket.emit(
          'join-room',
          { roomId, username: user.username },
          otherUsers => {
            const isHost = otherUsers.length === 0;
            const local = {
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
            const remotes = otherUsers.map(u => ({
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
            setParticipants([local, ...remotes]);
            setIsLoading(false);

            otherUsers.forEach(async u => {
              const pc = await createPeerConnection(u.userId);
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              socket.emit('offer', { to: u.userId, offer });
            });
          }
        );
      };

      const onUserJoined = async ({ userId, username, isHost }) => {
        setParticipants(prev => {
          if (prev.some(p => p.socketId === userId)) return prev;
          return [
            ...prev,
            {
              socketId: userId,
              userId,
              username,
              stream: null,
              isLocal: false,
              isHost,
              videoEnabled: true,
              audioEnabled: true,
              isScreenSharing: false,
            },
          ];
        });
        toast.info(`${username} joined`);
        const pc = await createPeerConnection(userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: userId, offer });
      };

      const onOffer = async ({ from, offer }) => {
        setParticipants(prev => {
          if (prev.some(p => p.socketId === from)) return prev;
          return [
            ...prev,
            {
              socketId: from,
              userId: from,
              username: 'User',
              stream: null,
              isLocal: false,
              isHost: false,
              videoEnabled: true,
              audioEnabled: true,
              isScreenSharing: false,
            },
          ];
        });
        const pc = await createPeerConnection(from);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { to: from, answer });
      };

      const onAnswer = async ({ from, answer }) => {
        const pc = peerConnections.current.get(from);
        if (pc && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      };

      const onIceCandidate = ({ from, candidate }) => {
        const pc = peerConnections.current.get(from);
        if (pc && candidate) pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      };

      const onUserLeft = ({ userId }) => {
        peerConnections.current.get(userId)?.close();
        peerConnections.current.delete(userId);
        setParticipants(prev => prev.filter(p => p.socketId !== userId));
        if (pinnedParticipantId === userId) setPinnedParticipantId(null);
        toast.error('A user left');
      };

      socket.on('connect', onConnect);
      socket.on('user-joined', onUserJoined);
      socket.on('offer', onOffer);
      socket.on('answer', onAnswer);
      socket.on('ice-candidate', onIceCandidate);
      socket.on('user-left', onUserLeft);
      socket.on('chat-message', msg => setMessages(prev => [...prev, msg]));
      socket.on('screen-share-start', ({ userId }) => setParticipants(prev => prev.map(p => (p.socketId === userId ? { ...p, isScreenSharing: true } : p))));
      socket.on('screen-share-stop', ({ userId }) => setParticipants(prev => prev.map(p => (p.socketId === userId ? { ...p, isScreenSharing: false } : p))));
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
        socket.off('connect', onConnect);
        // …remove others
      };
    },
    [createPeerConnection, roomId, user, getUsernameById, handleAIComplete]
  );

  /* ------------------------------------------------------------------ */
  /* Init */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const init = async () => {
      if (!user) return navigate('/login');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, frameRate: 15 },
          audio: true,
        });
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];

        socketRef.current = io(SERVER_URL, { auth: { token: user.token } });
        setupSocketListeners(socketRef.current);
      } catch {
        toast.error('Camera/mic access denied');
        navigate('/home');
      }
    };
    init();
  }, [user, navigate, setupSocketListeners]);

  /* ------------------------------------------------------------------ */
  /* Track replacement – FIXED */
  /* ------------------------------------------------------------------ */
  const replaceTrack = useCallback(
    async (newTrack, isScreenShare = false) => {
      const local = localStreamRef.current;
      if (!local) return;
      const old = local.getVideoTracks()[0];
      if (old) old.stop();
      local.removeTrack(old);
      local.addTrack(newTrack);

      peerConnections.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(newTrack);
      });

      setParticipants(prev =>
        prev.map(p => (p.isLocal ? { ...p, isScreenSharing: isScreenShare } : p))
      );
      socketRef.current?.emit(isScreenShare ? 'screen-share-start' : 'screen-share-stop', {
        userId: socketRef.current.id,
      });
    },
    []
  );

  const toggleAudio = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsAudioMuted(!track.enabled);
      setParticipants(prev => prev.map(p => (p.isLocal ? { ...p, audioEnabled: track.enabled } : p)));
    }
  };

  const toggleVideo = async () => {
    if (isVideoEnabled) {
      localStreamRef.current.getVideoTracks()[0].enabled = false;
      setIsVideoEnabled(false);
      setParticipants(prev => prev.map(p => (p.isLocal ? { ...p, videoEnabled: false } : p)));
    } else {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      await replaceTrack(stream.getVideoTracks()[0]);
      setIsVideoEnabled(true);
      setParticipants(prev => prev.map(p => (p.isLocal ? { ...p, videoEnabled: true } : p)));
    }
  };

  const handleScreenShare = async () => {
    if (isSharingScreen) {
      await replaceTrack(localCameraTrackRef.current);
      setIsSharingScreen(false);
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
    } else {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      await replaceTrack(track, true);
      setIsSharingScreen(true);
      track.onended = () => handleScreenShare();
    }
  };

  const handlePinParticipant = socketId => {
    if (pinnedParticipantId === socketId) {
      setPinnedParticipantId(null);
      socketRef.current?.emit('unpin-participant');
    } else {
      setPinnedParticipantId(socketId);
      socketRef.current?.emit('pin-participant', { participantId: socketId });
    }
  };

  const handleSwipe = dir => setGridPage(p => Math.max(0, Math.min(p + dir, totalGridPages - 1)));

  if (isLoading) return <LoadingSpinner />;

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
            setToolbarPosition={setToolbarPosition}
            currentTool={currentTool}
            currentBrushSize={currentBrushSize}
            annotationCanvasRef={annotationCanvasRef}
            remoteDrawingStates={remoteDrawingStates}
            drawingStateRef={drawingStateRef}
            handleSwipe={handleSwipe}
            gridPage={gridPage}
            totalGridPages={totalGridPages}
            pinnedParticipantId={pinnedParticipantId}
            handlePinParticipant={handlePinParticipant}
            isMirroringBrowser={isMirroringBrowser}
            socketRef={socketRef}
            handleExitRoom={() => navigate('/home')}
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

        {/* Chat & sidebars – unchanged */}
        {isChatOpen && (
          <div className="pro-chat-sidebar-overlay" onClick={() => setIsChatOpen(false)}>
            <div className="pro-chat-sidebar" onClick={e => e.stopPropagation()}>
              <Chat
                messages={messages}
                onSendMessage={msg => {
                  const payload = { socketId: socketRef.current.id, username: user.username, message: msg, timestamp: Date.now() };
                  socketRef.current?.emit('send-chat-message', payload);
                  setMessages(prev => [...prev, payload]);
                }}
                currentUser={{ socketId: socketRef.current?.id, username: user.username }}
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
                  onSendMessage={p => { socketRef.current?.emit('send-chat-message', p); setMessages(prev => [...prev, p]); }}
                  onCloseChat={() => setIsChatOpen(false)}
                  participants={allParticipants}
                  onCloseParticipants={() => setIsParticipantsOpen(false)}
                  roomId={roomId}
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
        handleExitRoom={() => navigate('/home')}
        onCopyInvite={copyInviteLink}
      />

      <canvas ref={aiCanvasRef} style={{ position: 'absolute', top: -1000, left: -1000, width: 640, height: 480 }} />
    </div>
  );
};

export { getUserAvatar, AIAvatar };
export default Meeting;