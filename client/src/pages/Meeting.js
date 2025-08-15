import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import io from 'socket.io-client';
import axios from 'axios';
// Import Components
import Chat from '../components/Chat';
import Participants from '../components/Participants';
import LoadingSpinner from '../components/LoadingSpinner';
import VideoPlayer from '../components/VideoPlayer';
import AnnotationToolbar from '../components/AnnotationToolbar';

const SERVER_URL = 'https://genaizoomserver-0yn4.onrender.com';

// Helper function to generate a unique, consistent color from a user's ID
const getColorForId = (id) => {
  if (!id) return '#FFFFFF'; // Return white for null ID
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

  // State
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

  // Annotation & Toolbar State
  const [isAnnotationActive, setIsAnnotationActive] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 20, y: 20 });
  const [currentTool, setCurrentTool] = useState('pen');
  const [currentBrushSize, setCurrentBrushSize] = useState(5);
  
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

  // --- DERIVED STATE (Calculated on every render for accuracy) ---
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

  const filmstripParticipants = useMemo(() => {
    if (!mainViewParticipant) return [];
    return participants.filter(p => p.userId !== mainViewParticipant.userId);
  }, [participants, mainViewParticipant]);
  
  const isSomeoneScreenSharing = useMemo(() => 
    participants.some(p => p.isScreenSharing), 
    [participants]
  );

  const totalFilmstripPages = Math.ceil(filmstripParticipants.length / filmstripSize);
  
  // --- CORE WEBRTC & SOCKET LOGIC ---
  const getIceServers = useCallback(async () => {
    try {
      const { data } = await axios.get(`${SERVER_URL}/ice-servers`);
      return data;
    } catch (error) {
      return [{ urls: 'stun:stun.l.google.com:19302' }];
    }
  }, []);

  const createPeerConnection = useCallback(
    async (remoteSocketId) => {
      const iceServers = await getIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      
      pc.ontrack = (event) => {
        setParticipants((prev) => prev.map((p) =>
          p.userId === remoteSocketId ? { ...p, stream: event.streams[0] } : p
        ));
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('ice-candidate', { to: remoteSocketId, candidate: event.candidate });
        }
      };
      peerConnections.current.set(remoteSocketId, pc);
      return pc;
    },
    [getIceServers]
  );

  const setupSocketListeners = useCallback((socket) => {
    socket.on('offer', async ({ from, offer, username }) => {
      setParticipants(prev => {
        if (prev.some(p => p.userId === from)) return prev;
        return [...prev, { userId: from, username, stream: null, isLocal: false, isHost: false, videoEnabled: true, audioEnabled: true, isScreenSharing: false }];
      });

      const pc = await createPeerConnection(from);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
      }
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { to: from, answer });
    });

    socket.on('answer', ({ from, answer }) => peerConnections.current.get(from)?.setRemoteDescription(new RTCSessionDescription(answer)));
    socket.on('ice-candidate', ({ from, candidate }) => peerConnections.current.get(from)?.addIceCandidate(new RTCIceCandidate(candidate)));
    socket.on('user-left', (userId) => {
      peerConnections.current.get(userId)?.close();
      peerConnections.current.delete(userId);
      setParticipants(prev => prev.filter(p => p.userId !== userId));
    });
    
    socket.on('chat-message', (payload) => setMessages(prev => [...prev, payload]));
    socket.on('screen-share-start', ({ userId }) => setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: true } : p)));
    socket.on('screen-share-stop', ({ userId }) => setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: false } : p)));
    
    // Annotation Listeners
    socket.on('drawing-start', ({ from, x, y, color, tool, size }) => {
        remoteDrawingStates.current.set(from, { color, tool, size });
        const canvas = annotationCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.moveTo(x * canvas.width, y * canvas.height);
    });
    socket.on('drawing-move', ({ from, x, y }) => {
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
    });
    socket.on('clear-canvas', () => {
        const canvas = annotationCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

  }, [createPeerConnection]);

  useEffect(() => {
    // Main initialization logic
    const initialize = async () => {
      if (!user) { navigate('/home'); return; }
      try {
        setIsLoading(true);
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
        
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];

        const socket = io(SERVER_URL, { auth: { token: user.token }, transports: ['websocket'] });
        socketRef.current = socket;
        
        setupSocketListeners(socket);
        
        socket.emit('join-room', { roomId, username: user.username }, async (otherUsers) => {
            const isHost = otherUsers.length === 0;
            const remoteParticipants = otherUsers.map(u => ({ userId: u.userId, username: u.username, stream: null, isLocal: false, isHost: u.isHost || false, videoEnabled: true, audioEnabled: true, isScreenSharing: false }));
            const localParticipant = { userId: socket.id, username: `${user.username} (You)`, stream, isLocal: true, isHost, videoEnabled: true, audioEnabled: true, isScreenSharing: false };
            
            setParticipants([localParticipant, ...remoteParticipants]);

            for (const otherUser of otherUsers) {
                const pc = await createPeerConnection(otherUser.userId);
                stream.getTracks().forEach(track => pc.addTrack(track, stream));
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('offer', { to: otherUser.userId, offer, username: user.username });
            }
        });
        setIsLoading(false);
      } catch (error) {
        toast.error("Failed to access camera. Please check permissions.");
        navigate('/home');
      }
    };
    initialize();
    return () => {
      socketRef.current?.disconnect();
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      peerConnections.current.forEach(pc => pc.close());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user, navigate]);

  // Canvas resize logic
  useEffect(() => {
    const canvas = annotationCanvasRef.current;
    const container = mainVideoContainerRef.current;
    if (!container || !canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [mainViewParticipant]);

  const replaceTrack = useCallback(async (newTrack, isScreenShare = false) => { /* ... unchanged ... */ },[]);
  const toggleAudio = () => { /* ... unchanged ... */ };
  const toggleVideo = () => { /* ... unchanged ... */ };
  const handleScreenShare = async () => { /* ... unchanged ... */ };
  const handleSwipe = (direction) => { /* ... unchanged ... */ };
  const handleToolbarMouseDown = (e) => { /* ... unchanged ... */ };
  const handleToolbarMouseMove = (e) => { /* ... unchanged ... */ };
  const handleToolbarMouseUp = () => { /* ... unchanged ... */ };

  // --- ANNOTATION HANDLERS ---
  const handleMouseDown = (e) => {
    if (!isAnnotationActive) return;
    const canvas = annotationCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / canvas.width;
    const y = (e.clientY - rect.top) / canvas.height;
    
    const myColor = getColorForId(socketRef.current.id);
    const payload = { x, y, color: myColor, tool: currentTool, size: currentBrushSize };
    socketRef.current.emit('drawing-start', payload);

    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = myColor;
    ctx.lineWidth = currentBrushSize;
    ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x * canvas.width, y * canvas.height);
  };

  const handleMouseMove = (e) => {
     if (!isAnnotationActive || !e.buttons) return;
     const canvas = annotationCanvasRef.current;
     const rect = canvas.getBoundingClientRect();
     const x = (e.clientX - rect.left) / canvas.width;
     const y = (e.clientY - rect.top) / canvas.height;
     
     socketRef.current.emit('drawing-move', { x, y });
     
     const ctx = canvas.getContext('2d');
     ctx.lineTo(x * canvas.width, y * canvas.height);
     ctx.stroke();
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
    socketRef.current.emit('clear-canvas');
  };

  if (isLoading) return <div className="h-screen bg-black flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden text-white">
      <div className="bg-gray-900 p-4 flex items-center justify-between z-20">
        <h1 className="text-lg font-semibold">Meeting: {roomId}</h1>
        <span>Participants: {participants.length}</span>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div 
            className="flex-1 flex flex-col relative p-4 gap-4"
            onWheel={(e) => { if (e.deltaY !== 0 && totalFilmstripPages > 1) { e.preventDefault(); handleSwipe(e.deltaY > 0 ? 1 : -1); } }}
        >
          {isSomeoneScreenSharing && (
            <div style={{ position: 'absolute', top: toolbarPosition.y, left: toolbarPosition.x, zIndex: 50 }}>
              <AnnotationToolbar 
                onMouseDown={handleToolbarMouseDown} 
                isAnnotationActive={isAnnotationActive} 
                toggleAnnotations={() => setIsAnnotationActive(p => !p)}
                currentTool={currentTool}
                setCurrentTool={setCurrentTool}
                currentBrushSize={currentBrushSize}
                setCurrentBrushSize={setCurrentBrushSize}
                clearCanvas={clearAnnotations}
              />
            </div>
          )}

          {/* Main View Area */}
          <div className="flex-1 min-h-0 relative" ref={mainVideoContainerRef}>
            {mainViewParticipant && (
                <div className="w-full h-full cursor-pointer" onClick={() => setPinnedParticipantId(null)} title="Click to unpin and return to default view">
                    <VideoPlayer
                      key={mainViewParticipant.userId}
                      participant={mainViewParticipant}
                      isPinned={!!pinnedParticipantId}
                      isLocal={mainViewParticipant.isLocal}
                    />
                </div>
            )}
            <canvas
              ref={annotationCanvasRef}
              className="absolute top-0 left-0"
              style={{ pointerEvents: isAnnotationActive ? 'auto' : 'none', zIndex: 10, touchAction: 'none' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
            />
          </div>
          
          {/* Filmstrip View Area */}
          {filmstripParticipants.length > 0 && (
            <div className="h-40 w-full relative">
                <div className="absolute inset-0 flex transition-transform duration-300 ease-in-out" style={{ transform: `translateX(-${currentOffset * 100}%)` }}>
                  {Array.from({ length: totalFilmstripPages }, (_, i) => (
                    <div key={i} className={`flex-shrink-0 w-full h-full grid grid-cols-6 gap-4 justify-center`}>
                      {filmstripParticipants.slice(i * filmstripSize, (i + 1) * filmstripSize).map((p) => (
                        <div key={p.userId} className="h-full cursor-pointer" onClick={() => handleParticipantClick(p.userId)} title={`Focus on ${p.username}`}>
                          <VideoPlayer participant={p} isLocal={p.isLocal}/>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                {totalFilmstripPages > 1 && (
                    <div className="absolute bottom-[-10px] left-0 right-0 flex justify-center gap-2">
                        {Array.from({ length: totalFilmstripPages }, (_, i) => (
                        <button key={i} onClick={() => setCurrentOffset(i)} className={`w-2.5 h-2.5 rounded-full ${currentOffset === i ? 'bg-white' : 'bg-gray-500'}`} />
                        ))}
                    </div>
                )}
            </div>
          )}
        </div>
        
        <div className={`bg-gray-900 border-l border-gray-700 transition-all duration-300 ${isChatOpen || isParticipantsOpen ? 'w-80' : 'w-0'} overflow-hidden`}>
          {isChatOpen && <Chat messages={messages} onSendMessage={(message) => {
              const payload = { message, username: user.username, timestamp: new Date().toISOString() };
              socketRef.current.emit('send-chat-message', payload);
              setMessages((prev) => [...prev, payload]);
            }} currentUser={user} onClose={() => setIsChatOpen(false)} />}
          {isParticipantsOpen && <Participants participants={participants} currentUser={user} onClose={() => setIsParticipantsOpen(false)} roomId={roomId} />}
        </div>
      </div>

      <div className="bg-gray-900 border-t border-gray-700 p-4 flex justify-center gap-4 z-20">
          <button onClick={toggleAudio} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">{isAudioMuted ? 'Unmute 🎤' : 'Mute 🔇'}</button>
          <button onClick={toggleVideo} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">{isVideoEnabled ? 'Stop Video 📷' : 'Start Video 📹'}</button>
          <button onClick={handleScreenShare} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">{isSharingScreen ? 'Stop Sharing' : 'Share Screen 🖥️'}</button>
          <button onClick={() => { setIsChatOpen(o => !o); setIsParticipantsOpen(false); }} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">Chat 💬</button>
          <button onClick={() => { setIsParticipantsOpen(o => !o); setIsChatOpen(false); }} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">Participants 👥</button>
          <button onClick={() => navigate('/home')} className="p-2 rounded text-white bg-red-600 hover:bg-red-500">Exit Room 📞</button>
      </div>
    </div>
  );
};

export default Meeting;