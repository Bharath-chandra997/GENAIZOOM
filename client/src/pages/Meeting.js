import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import io from 'socket.io-client';
import axios from 'axios';
import VideoGrid from '../components/VideoGrid';
import AnnotationCanvas from '../components/AnnotationCanvas';
import MediaPanel from '../components/MediaPanel';
import UploadControls from '../components/UploadControls';
import ChatComponent from '../components/ChatComponent';
import ParticipantsPanel from '../components/ParticipantsPanel';
import MeetingControls from '../components/MeetingControls';
import LoadingSpinner from '../components/LoadingSpinner';

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

  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(true);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [gridPage, setGridPage] = useState(0);
  const [pinnedParticipantId, setPinnedParticipantId] = useState(null);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 20, y: 20 });
  const [currentTool, setCurrentTool] = useState('pen');
  const [currentBrushSize, setCurrentBrushSize] = useState(5);
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
  const [isMediaDisplayed, setIsMediaDisplayed] = useState(false);

  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const localCameraTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnections = useRef(new Map());
  const dragInfo = useRef({ isDragging: false });
  const annotationCanvasRef = useRef(null);
  const mainVideoContainerRef = useRef(null);
  const isInitialized = useRef(false);
  const isMirroringBrowser = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream, []);

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
  const displayParticipants = participants;
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
      const { data } = await axios.get(`${SERVER_URL}/ice-servers`, { timeout: 2000 });
      iceServersCache.current = data;
      lastIceFetch.current = now;
      return data;
    } catch {
      return [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
        { urls: 'turns:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayprojectsecret' },
      ];
    }
  }, []);

  const createPeerConnection = useCallback(async (remoteSocketId) => {
    if (peerConnections.current.has(remoteSocketId)) return peerConnections.current.get(remoteSocketId);
    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 10, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });
    pc.ontrack = (event) => setParticipants((prev) => prev.map(p => p.userId === remoteSocketId ? { ...p, stream: event.streams[0] } : p));
    pc.onicecandidate = (event) => event.candidate && socketRef.current?.emit('ice-candidate', { to: remoteSocketId, candidate: event.candidate });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        pc.close();
        peerConnections.current.delete(remoteSocketId);
        setParticipants((prev) => prev.filter(p => p.userId !== remoteSocketId));
      }
    };
    peerConnections.current.set(remoteSocketId, pc);
    return pc;
  }, [getIceServers]);

  const setupSocketListeners = useCallback((socket) => {
    socket.on('connect', () => {
      socket.emit('join-room', { roomId, username: user.username }, (otherUsers) => {
        const isHost = otherUsers.length === 0;
        setParticipants([{ userId: socket.id, username: `${user.username} (You)`, stream: localStreamRef.current, isLocal: true, isHost, videoEnabled: true, audioEnabled: true, isScreenSharing: false, socketId: socket.id }, ...otherUsers.map(u => ({ userId: u.userId, username: u.username, stream: null, isLocal: false, isHost: u.isHost || false, videoEnabled: true, audioEnabled: true, isScreenSharing: false, socketId: u.userId }))]);
        setIsLoading(false);
      });
    });
    socket.on('user-joined', async ({ userId, username }) => {
      setParticipants((prev) => [...prev, { userId, username, stream: null, isLocal: false, isHost: false, videoEnabled: true, audioEnabled: true, isScreenSharing: false, socketId: userId }]);
      const pc = await createPeerConnection(userId);
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { to: userId, offer, username: user.username });
    });
    socket.on('offer', async ({ from, offer, username }) => {
      setParticipants((prev) => [...prev, { userId: from, username, stream: null, isLocal: false, isHost: false, videoEnabled: true, audioEnabled: true, isScreenSharing: false, socketId: from }]);
      const pc = await createPeerConnection(from);
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { to: from, answer });
    });
    socket.on('answer', ({ from, answer }) => {
      const pc = peerConnections.current.get(from);
      if (pc) pc.setRemoteDescription(new RTCSessionDescription(answer));
    });
    socket.on('ice-candidate', ({ from, candidate }) => {
      const pc = peerConnections.current.get(from);
      if (pc) pc.addIceCandidate(new RTCIceCandidate(candidate));
    });
    socket.on('user-left', (userId) => {
      peerConnections.current.get(userId)?.close();
      peerConnections.current.delete(userId);
      setParticipants((prev) => prev.filter(p => p.userId !== userId));
    });
    socket.on('chat-message', (payload) => setMessages(prev => [...prev, payload]));
    socket.on('screen-share-start', ({ userId }) => setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: true } : p)));
    socket.on('screen-share-stop', ({ userId }) => setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: false } : p)));
    socket.on('error', ({ message }) => toast.error(message));
    socket.on('media-display', () => setIsMediaDisplayed(true));
    socket.on('media-remove', () => setIsMediaDisplayed(false));
    return () => socket.disconnect();
  }, [createPeerConnection, roomId, user.username]);

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
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 15 } }, audio: true });
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];
        socketRef.current = io(SERVER_URL, { auth: { token: user.token }, transports: ['websocket'] });
        setupSocketListeners(socketRef.current);
      } catch (error) {
        console.error('Initialization error:', error);
        toast.error('Failed to access camera or microphone.');
        navigate('/home');
      } finally {
        setIsLoading(false);
      }
    };
    initialize();
    return () => {
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
      peerConnections.current.forEach(pc => pc.close());
      socketRef.current?.disconnect();
    };
  }, [roomId, user, navigate, setupSocketListeners]);

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
    setParticipants((prev) => prev.map(p => p.isLocal ? { ...p, isScreenSharing: isScreenShare } : p));
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
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 15 } } });
      const newVideoTrack = newStream.getVideoTracks()[0];
      await replaceTrack(newVideoTrack, false);
      localCameraTrackRef.current = newVideoTrack;
      setIsVideoEnabled(true);
      setParticipants(prev => prev.map(p => p.isLocal ? { ...p, videoEnabled: true } : p));
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
        screenTrack.onended = () => {
          replaceTrack(localCameraTrackRef.current, false);
          setIsSharingScreen(false);
        };
      } catch (err) {
        console.error('Screen share error:', err);
        toast.error('Screen sharing failed.');
      }
    }
  };

  const handleSwipe = (direction, page = null) => {
    setGridPage((prev) => page !== null ? page : Math.max(0, Math.min(prev + direction, totalGridPages - 1)));
  };

  const handleToolbarMouseDown = (e) => {
    const toolbar = e.currentTarget.parentElement;
    const rect = toolbar.getBoundingClientRect();
    dragInfo.current = { isDragging: true, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    window.addEventListener('mousemove', handleToolbarMouseMove);
    window.addEventListener('mouseup', handleToolbarMouseUp);
  };

  const handleToolbarMouseMove = (e) => {
    if (dragInfo.current.isDragging) {
      setToolbarPosition({ x: e.clientX - dragInfo.current.offsetX, y: e.clientY - dragInfo.current.offsetY });
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
    if (currentTool === 'pen' || currentTool === 'eraser') {
      const myColor = getColorForId(socketId);
      socketRef.current?.emit('drawing-start', { x: x / canvas.width, y: y / canvas.height, color: myColor, tool: currentTool, size: currentBrushSize });
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
    const canvas = annotationCanvasRef.current;
    if (!canvas || !e.buttons) return;
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
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    if (currentTool === 'rectangle' || currentTool === 'circle') {
      const rect = canvas.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;
      const myColor = getColorForId(socketId);
      socketRef.current?.emit('draw-shape', { tool: currentTool, startX: 0, startY: 0, endX: endX / canvas.width, endY: endY / canvas.height, color: myColor, size: currentBrushSize });
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = myColor;
      ctx.lineWidth = currentBrushSize;
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      if (currentTool === 'rectangle') {
        ctx.rect(0, 0, endX, endY);
      } else if (currentTool === 'circle') {
        const radius = Math.sqrt(Math.pow(endX, 2) + Math.pow(endY, 2));
        ctx.arc(0, 0, radius, 0, 2 * Math.PI);
      }
      ctx.stroke();
    }
  };

  const handleParticipantClick = (userId) => {
    setPinnedParticipantId(userId);
    setGridPage(0);
  };

  const clearAnnotations = () => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socketRef.current?.emit('clear-canvas');
  };

  const handleProcessWithAI = async () => {
    if (!selectedImage || !selectedAudio) {
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
      const formData = new FormData();
      formData.append('image', selectedImage);
      formData.append('audio', selectedAudio);
      const response = await axios.post('https://genaizoom-1.onrender.com/predict', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const modelOutput = response.data?.prediction ?? response.data;
      setOutput(modelOutput.answer || modelOutput.response || String(modelOutput));
      socketRef.current?.emit('ai-finish-processing', { response: modelOutput, roomId });
    } catch (error) {
      console.error('AI processing error:', error);
      toast.error('AI analysis failed.');
    } finally {
      setIsProcessing(false);
      setIsBotLocked(false);
      socketRef.current?.emit('ai-bot-unlocked', { roomId });
    }
  };

  const handleExitRoom = () => {
    socketRef.current?.emit('leave-room');
    navigate('/home');
  };

  if (isLoading) return <div className="h-screen bg-black flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden text-white">
      <div className="bg-gray-900 px-2 py-1 flex items-center justify-between z-20">
        <h1 className="text-lg font-semibold">Meeting: {roomId}</h1>
        <span>Participants: {participants.length}</span>
      </div>
      <div className="flex-1 flex relative overflow-hidden">
        <div className={`flex-1 ${isMediaDisplayed ? 'grid grid-cols-[60%_40%] xl:grid-cols-[65%_35%] 2xl:grid-cols-[70%_30%]' : 'flex flex-col'} relative overflow-hidden`}
          onWheel={(e) => e.deltaX !== 0 && totalGridPages > 1 && handleSwipe(e.deltaX > 0 ? 1 : -1)}
          ref={mainVideoContainerRef}
        >
          <div className="flex flex-col min-h-0 w-full">
            <div className="bg-gray-800 border-b border-gray-700 p-3">
              <UploadControls
                canUpload={!isMediaDisplayed}
                selectedImage={selectedImage}
                setSelectedImage={setSelectedImage}
                selectedAudio={selectedAudio}
                setSelectedAudio={setSelectedAudio}
                hasImageUrl={!!imageUrl}
                hasAudioUrl={!!audioUrl}
                isMediaDisplayed={isMediaDisplayed}
                onDisplay={() => setIsMediaDisplayed(true)}
                onRemove={() => setIsMediaDisplayed(false)}
                onAnalyze={handleProcessWithAI}
                isProcessing={isProcessing}
              />
            </div>
            {isSomeoneScreenSharing && (
              <div style={{ position: 'absolute', top: toolbarPosition.y, left: toolbarPosition.x, zIndex: 50 }}>
                <AnnotationToolbar
                  onMouseDown={handleToolbarMouseDown}
                  currentTool={currentTool}
                  setCurrentTool={setCurrentTool}
                  currentBrushSize={currentBrushSize}
                  setCurrentBrushSize={setCurrentBrushSize}
                  clearCanvas={clearAnnotations}
                />
              </div>
            )}
            <div className="flex-1 min-h-0 relative overflow-hidden h-full">
              <VideoGrid
                participants={displayParticipants}
                isMediaDisplayed={isMediaDisplayed}
                gridPage={gridPage}
                totalGridPages={totalGridPages}
                handleSwipe={handleSwipe}
                handleParticipantClick={handleParticipantClick}
                isMirroringBrowser={isMirroringBrowser}
                socketId={socketRef.current?.id}
              />
              <AnnotationCanvas
                ref={annotationCanvasRef}
                toolbarPosition={toolbarPosition}
                isSomeoneScreenSharing={isSomeoneScreenSharing}
                currentTool={currentTool}
                currentBrushSize={currentBrushSize}
                getColorForId={getColorForId}
                socketId={socketRef.current?.id}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>
          </div>
          {isMediaDisplayed && (
            <MediaPanel imageUrl={imageUrl} audioUrl={audioUrl} uploaderUsername={uploaderUsername} output={output} />
          )}
        </div>
        <div className={`bg-gray-900 border-l border-gray-700 transition-all duration-300 ${isChatOpen || isParticipantsOpen ? 'w-80' : 'w-0'} overflow-hidden`}>
          {isChatOpen && <ChatComponent messages={messages} onSendMessage={(msg) => socketRef.current?.emit('send-chat-message', { message: msg, username: user.username, timestamp: new Date().toISOString() }) && setMessages(prev => [...prev, { message: msg, username: user.username, timestamp: new Date().toISOString() }])} currentUser={user} onClose={() => setIsChatOpen(false)} />}
          {isParticipantsOpen && <ParticipantsPanel participants={participants} currentUser={user} onClose={() => setIsParticipantsOpen(false)} roomId={roomId} />}
        </div>
      </div>
      <div className="bg-gray-900 border-t border-gray-700 px-2 py-1 flex justify-center gap-1 z-20 sticky bottom-0">
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
    </div>
  );
};

export default Meeting;