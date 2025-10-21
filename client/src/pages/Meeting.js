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

// ==================== UTILS ====================

const getColorForId = (id) => {
  if (!id) return '#FFFFFF';
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 90%, 60%)`;
};

// Avatar Component (React Element)
const UserAvatar = ({ user, size = 40 }) => {
  if (user?.profilePicture) {
    return <img src={user.profilePicture} alt="avatar" className="user-avatar" style={{ width: size, height: size, borderRadius: '50%' }} />;
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
        fontSize: size * 0.4
      }}
    >
      {initials}
    </div>
  );
};

// AI Avatar
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

// ==================== MAIN COMPONENT ====================

const Meeting = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // State
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

  // AI Participant
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
  const aiCanvasRef = useRef(null);
  const aiAnimationRef = useRef(null);
  const connectionTimeouts = useRef(new Map());
  const iceServersCache = useRef(null);
  const lastIceFetch = useRef(0);

  const isMirroringBrowser = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream, []);

  const allParticipants = useMemo(() => [...participants], [participants]);
  const participantsWithAI = useMemo(() => [aiParticipant, ...participants], [aiParticipant, participants]);
  const realParticipantsCount = participants.length;

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
    const p = allParticipants.find(p => p.userId === userId);
    return p ? (p.isLocal ? user.username : p.username) : 'User';
  }, [allParticipants, user.username]);

  const copyInviteLink = useCallback(() => {
    const link = `${window.location.origin}/join/${roomId}`;
    navigator.clipboard.writeText(link).then(() => {
      toast.success('Invite link copied!', { position: 'bottom-center' });
    }).catch(() => {
      toast.error('Failed to copy');
    });
  }, [roomId]);

  // ==================== AI ANIMATION ====================
  const initializeAiAnimation = useCallback(() => {
    const canvas = aiCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let particles = [];
    let time = 0;

    const createParticles = () => {
      particles = Array.from({ length: 30 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 1,
        speed: Math.random() * 1 + 0.5,
        color: `hsl(${200 + Math.random() * 60}, 70%, 60%)`,
        angle: Math.random() * Math.PI * 2
      }));
    };

    const animate = () => {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      time += 0.02;

      particles.forEach(p => {
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
      });

      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = 'rgba(96, 165, 250, 0.9)';
      ctx.textAlign = 'center';
      ctx.fillText('AI Assistant', canvas.width / 2, canvas.height / 2 - 10);

      ctx.font = '12px sans-serif';
      ctx.fillStyle = aiBotInUse ? 'rgba(239, 68, 68, 0.7)' : 'rgba(96, 165, 250, 0.7)';
      ctx.fillText(aiBotInUse ? `In use by ${currentAIUser}` : 'Ready', canvas.width / 2, canvas.height / 2 + 15);

      aiAnimationRef.current = requestAnimationFrame(animate);
    };

    const resize = () => {
      canvas.width = 300;
      canvas.height = 200;
      createParticles();
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

  // ==================== AI BOT ====================
  const handleAIRequest = useCallback(async (imageFile, audioFile) => {
    if (aiBotInUse) {
      toast.error('AI in use');
      return;
    }

    setAiBotInUse(true);
    setCurrentAIUser(user.username);
    setAiUploadedImage(imageFile ? URL.createObjectURL(imageFile) : null);
    setAiUploadedAudio(audioFile ? URL.createObjectURL(audioFile) : null);

    socketRef.current?.emit('ai-start-processing', { userId: socketRef.current.id, username: user.username });

    setTimeout(() => {
      const response = `Processed your input.`;
      setAiResponse(response);
      socketRef.current?.emit('ai-finish-processing', { response });
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

  // ==================== DRAWING ====================
  const handleMouseDown = useCallback((e) => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / canvas.width;
    const y = (e.clientY - rect.top) / canvas.height;
    drawingStateRef.current = { isDrawing: true, startX: x, startY: y };
    const color = getColorForId(socketRef.current?.id);
    socketRef.current?.emit('drawing-start', { x, y, color, tool: currentTool, size: currentBrushSize });
  }, [currentTool, currentBrushSize]);

  const handleMouseMove = useCallback((e) => {
    if (!drawingStateRef.current.isDrawing) return;
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / canvas.width;
    const y = (e.clientY - rect.top) / canvas.height;
    socketRef.current?.emit('drawing-move', { x, y });
  }, []);

  const handleMouseUp = useCallback((e) => {
    if (!drawingStateRef.current.isDrawing) return;
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const endX = (e.clientX - rect.left) / canvas.width;
    const endY = (e.clientY - rect.top) / canvas.height;
    const color = getColorForId(socketRef.current?.id);
    socketRef.current?.emit('draw-shape', {
      tool: currentTool,
      startX: drawingStateRef.current.startX,
      startY: drawingStateRef.current.startY,
      endX, endY, color, size: currentBrushSize
    });
    drawingStateRef.current.isDrawing = false;
  }, [currentTool, currentBrushSize]);

  // ==================== ICE SERVERS ====================
  const getIceServers = useCallback(async () => {
    const now = Date.now();
    if (iceServersCache.current && now - lastIceFetch.current < 300000) {
      return iceServersCache.current;
    }

    try {
      const { data } = await axios.get(`${SERVER_URL}/ice-servers`, { timeout: 5000 });
      iceServersCache.current = data;
      lastIceFetch.current = now;
      return data;
    } catch (err) {
      console.warn('ICE fetch failed, using fallback');
      const fallback = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:staticauth.openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
        { urls: 'turns:staticauth.openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
      ];
      iceServersCache.current = fallback;
      lastIceFetch.current = now;
      return fallback;
    }
  }, []);

  // ==================== PEER CONNECTION ====================
  const createPeerConnection = useCallback(async (remoteId) => {
    if (peerConnections.current.has(remoteId)) return peerConnections.current.get(remoteId);

    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 10 });

    const timeout = setTimeout(() => {
      if (pc.connectionState === 'connecting') {
        pc.close();
        peerConnections.current.delete(remoteId);
      }
    }, 15000);
    connectionTimeouts.current.set(remoteId, timeout);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
    }

    pc.ontrack = (e) => {
      clearTimeout(connectionTimeouts.current.get(remoteId));
      setParticipants(prev => prev.map(p => p.userId === remoteId ? { ...p, stream: e.streams[0] } : p));
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current?.emit('ice-candidate', { to: remoteId, candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearTimeout(connectionTimeouts.current.get(remoteId));
        toast.success(`Connected to ${getUsernameById(remoteId)}`);
      } else if (pc.connectionState === 'failed') {
        pc.close();
        peerConnections.current.delete(remoteId);
        toast.error(`Failed to connect`);
      }
    };

    peerConnections.current.set(remoteId, pc);
    return pc;
  }, [getIceServers, getUsernameById]);

  const handleIceCandidate = useCallback(({ from, candidate }) => {
    const pc = peerConnections.current.get(from);
    if (pc && pc.remoteDescription) {
      pc.addIceCandidate(candidate).catch(() => {});
    }
  }, []);

  // ==================== SOCKET SETUP ====================
  const setupSocketListeners = useCallback((socket) => {
    const onConnect = () => {
      socket.emit('join-room', { roomId, username: user.username }, (others) => {
        const local = {
          userId: socket.id,
          username: `${user.username} (You)`,
          stream: localStreamRef.current,
          isLocal: true,
          isHost: others.length === 0,
          videoEnabled: true,
          audioEnabled: true,
          isScreenSharing: false,
          socketId: socket.id
        };
        const remotes = others.map(u => ({
          userId: u.userId,
          username: u.username,
          stream: null,
          isLocal: false,
          isHost: u.isHost,
          videoEnabled: true,
          audioEnabled: true,
          isScreenSharing: false,
          socketId: u.userId
        }));
        setParticipants([local, ...remotes]);
        setIsLoading(false);

        others.forEach(async (u) => {
          const pc = await createPeerConnection(u.userId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('offer', { to: u.userId, offer });
        });
      });
    };

    const onUserJoined = async ({ userId, username }) => {
      setParticipants(prev => [...prev, {
        userId, username, stream: null, isLocal: false, isHost: false,
        videoEnabled: true, audioEnabled: true, isScreenSharing: false, socketId: userId
      }]);
      const pc = await createPeerConnection(userId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { to: userId, offer });
    };

    const onOffer = async ({ from, offer }) => {
      const pc = await createPeerConnection(from);
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { to: from, answer });
    };

    const onAnswer = ({ from, answer }) => {
      const pc = peerConnections.current.get(from);
      if (pc && pc.signalingState === 'have-local-offer') {
        pc.setRemoteDescription(answer);
      }
    };

    const onUserLeft = ({ userId }) => {
      const pc = peerConnections.current.get(userId);
      if (pc) pc.close();
      peerConnections.current.delete(userId);
      setParticipants(prev => prev.filter(p => p.userId !== userId));
    };

    const onChat = (msg) => setMessages(prev => [...prev, msg]);
    const onScreenShareStart = ({ userId }) => setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: true } : p));
    const onScreenShareStop = ({ userId }) => setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: false } : p));

    socket.on('connect', onConnect);
    socket.on('user-joined', onUserJoined);
    socket.on('offer', onOffer);
    socket.on('answer', onAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('user-left', onUserLeft);
    socket.on('send-chat-message', onChat);
    socket.on('screen-share-start', onScreenShareStart);
    socket.on('screen-share-stop', onScreenShareStop);

    return () => {
      socket.off('connect', onConnect);
      socket.off('user-joined', onUserJoined);
      socket.off('offer', onOffer);
      socket.off('answer', onAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('user-left', onUserLeft);
      socket.off('send-chat-message', onChat);
      socket.off('screen-share-start', onScreenShareStart);
      socket.off('screen-share-stop', onScreenShareStop);
    };
  }, [roomId, user.username, createPeerConnection, handleIceCandidate]);

  // ==================== INITIALIZATION ====================
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const init = async () => {
      if (!user) return navigate('/home');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: { echoCancellation: true, noiseSuppression: true }
        });
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];

        socketRef.current = io(SERVER_URL, {
          auth: { token: user.token },
          transports: ['websocket']
        });

        setupSocketListeners(socketRef.current);
      } catch (err) {
        toast.error('Camera/mic access denied');
        navigate('/home');
      }
    };

    init();

    return () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      peerConnections.current.forEach(pc => pc.close());
      socketRef.current?.disconnect();
    };
  }, [user, navigate, setupSocketListeners]);

  // ==================== MEDIA CONTROL ====================
  const replaceTrack = useCallback(async (newTrack, isScreen = false) => {
    const stream = localStreamRef.current;
    const old = stream.getVideoTracks()[0];
    if (old) old.stop();
    stream.removeTrack(old);
    stream.addTrack(newTrack);

    peerConnections.current.forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(newTrack);
    });

    setParticipants(prev => prev.map(p => p.isLocal ? { ...p, isScreenSharing: isScreen } : p));
    socketRef.current?.emit(isScreen ? 'screen-share-start' : 'screen-share-stop');
  }, []);

  const toggleAudio = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsAudioMuted(!track.enabled);
    }
  };

  const toggleVideo = async () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track.enabled) {
      track.enabled = false;
      setIsVideoEnabled(false);
    } else {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
      await replaceTrack(newStream.getVideoTracks()[0]);
      setIsVideoEnabled(true);
    }
  };

  const handleScreenShare = async () => {
    if (isSharingScreen) {
      await replaceTrack(localCameraTrackRef.current);
      setIsSharingScreen(false);
    } else {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      await replaceTrack(stream.getVideoTracks()[0], true);
      setIsSharingScreen(true);
      stream.getVideoTracks()[0].onended = () => handleScreenShare();
    }
  };

  const handleExitRoom = () => {
    socketRef.current?.emit('leave-room');
    navigate('/home');
  };

  // ==================== RENDER ====================
  if (isLoading) return <div className="pro-meeting-page flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  return (
    <div className="pro-meeting-page">
      <MeetingHeader roomId={roomId} participants={allParticipants} realParticipantsCount={realParticipantsCount} onCopyInvite={copyInviteLink} />
      <div className="pro-meeting-body">
        <div className={`pro-mainarea-container ${isChatOpen ? 'with-chat-sidebar' : ''}`}>
          <MeetingMainArea
            participants={displayParticipants}
            realParticipants={allParticipants}
            isSomeoneScreenSharing={isSomeoneScreenSharing}
            toolbarPosition={toolbarPosition}
            currentTool={currentTool}
            currentBrushSize={currentBrushSize}
            handleMouseDown={handleMouseDown}
            handleMouseMove={handleMouseMove}
            handleMouseUp={handleMouseUp}
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
            getUserAvatar={(u) => <UserAvatar user={u} />}
            AIAvatar={AIAvatar}
          />
        </div>

        {isChatOpen && (
          <div className="pro-chat-sidebar-overlay" onClick={() => setIsChatOpen(false)}>
            <div className="pro-chat-sidebar" onClick={e => e.stopPropagation()}>
              <Chat
                messages={messages}
                onSendMessage={(msg) => {
                  const payload = { userId: socketRef.current.id, username: user.username, message: msg, timestamp: Date.now() };
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
                  participants={allParticipants}
                  aiParticipant={aiParticipant}
                  onCloseParticipants={() => setIsParticipantsOpen(false)}
                  roomId={roomId}
                  getUserAvatar={(u) => <UserAvatar user={u} />}
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

      <canvas ref={aiCanvasRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', opacity: 0 }} width="300" height="200" />
    </div>
  );
};

export default Meeting;