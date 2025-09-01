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
import AIZoomBot from '../pages/AIZoomBot';

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

  // State
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(true);
  const [isAIBotOpen, setIsAIBotOpen] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [filmstripSize] = useState(6);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [pinnedParticipantId, setPinnedParticipantId] = useState(null);

  // Annotation & Toolbar State
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
  const drawingStateRef = useRef({ isDrawing: false, startX: 0, startY: 0 });

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

  const filmstripParticipants = useMemo(() => {
    if (!mainViewParticipant) return [];
    return participants.filter(p => p.userId !== mainViewParticipant.userId);
  }, [participants, mainViewParticipant]);

  const isSomeoneScreenSharing = useMemo(() => 
    participants.some(p => p.isScreenSharing), 
    [participants]
  );

  const totalFilmstripPages = Math.ceil(filmstripParticipants.length / filmstripSize);

  // Fetch ICE Servers
  const getIceServers = useCallback(async () => {
    try {
      const { data } = await axios.get(`${SERVER_URL}/ice-servers`);
      console.log('ICE Servers:', data);
      return data;
    } catch (error) {
      console.error('Error fetching ICE servers:', error);
      return [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayprojectsecret',
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayprojectsecret',
        },
        {
          urls: 'turns:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayprojectsecret',
        },
      ];
    }
  }, []);

  // Create Peer Connection
  const createPeerConnection = useCallback(
    async (remoteSocketId) => {
      const iceServers = await getIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      
      pc.ontrack = (event) => {
        setParticipants((prev) =>
          prev.map((p) =>
            p.userId === remoteSocketId ? { ...p, stream: event.streams[0] } : p
          )
        );
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('ice-candidate', { to: remoteSocketId, candidate: event.candidate });
        }
      };
      pc.onconnectionstatechange = () => {
        console.log('Peer connection state:', pc.connectionState, 'for user:', remoteSocketId);
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
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

  // Setup Socket Listeners
  const setupSocketListeners = useCallback((socket) => {
    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      socket.emit('join-room', { roomId, username: user.username }, (otherUsers) => {
        const isHost = otherUsers.length === 0;
        const remoteParticipants = otherUsers.map(u => ({
          userId: u.userId,
          username: u.username,
          stream: null,
          isLocal: false,
          isHost: u.isHost || false,
          videoEnabled: true,
          audioEnabled: true,
          isScreenSharing: false
        }));
        const localParticipant = {
          userId: socket.id,
          username: `${user.username} (You)`,
          stream: localStreamRef.current,
          isLocal: true,
          isHost,
          videoEnabled: true,
          audioEnabled: true,
          isScreenSharing: false
        };
        setParticipants([localParticipant, ...remoteParticipants]);
        setIsLoading(false);
      });
    });

    socket.on('user-joined', async ({ userId, username, isHost }) => {
      setParticipants((prev) => {
        if (prev.some(p => p.userId === userId)) {
          console.warn('Duplicate user-joined event for:', userId);
          return prev;
        }
        return [...prev, { userId, username, stream: null, isLocal: false, isHost, videoEnabled: true, audioEnabled: true, isScreenSharing: false }];
      });

      try {
        const pc = await createPeerConnection(userId);
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => {
            console.log('Adding track for user:', userId, track);
            pc.addTrack(track, localStreamRef.current);
          });
        } else {
          console.warn('localStreamRef.current is null for user:', userId);
          return;
        }
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: userId, offer, username: user.username });
      } catch (err) {
        console.error('Error in user-joined handler:', err, { userId, username });
        toast.error(`Failed to connect to user ${username}.`);
      }
    });

    socket.on('offer', async ({ from, offer, username }) => {
      setParticipants((prev) => {
        if (prev.some(p => p.userId === from)) return prev;
        return [...prev, { userId: from, username, stream: null, isLocal: false, isHost: false, videoEnabled: true, audioEnabled: true, isScreenSharing: false }];
      });

      try {
        const pc = await createPeerConnection(from);
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { to: from, answer });
      } catch (err) {
        console.error('Error in offer handler:', err, { from, username });
        toast.error(`Failed to process offer from ${username}.`);
      }
    });

    socket.on('answer', ({ from, answer }) => {
      const pc = peerConnections.current.get(from);
      if (pc) {
        pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(err => {
          console.error('Error setting remote description:', err);
        });
      }
    });

    socket.on('ice-candidate', ({ from, candidate }) => {
      const pc = peerConnections.current.get(from);
      if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
          console.error('ICE candidate error:', err);
        });
      }
    });

    socket.on('user-left', (userId) => {
      const pc = peerConnections.current.get(userId);
      if (pc) {
        pc.getSenders().forEach(sender => sender.track && sender.track.stop());
        pc.close();
        peerConnections.current.delete(userId);
      }
      setParticipants((prev) => prev.filter((p) => p.userId !== userId));
      toast.info('A user has left the meeting.');
    });

    socket.on('chat-message', (payload) => setMessages(prev => [...prev, payload]));
    socket.on('screen-share-start', ({ userId }) => setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: true } : p)));
    socket.on('screen-share-stop', ({ userId }) => setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: false } : p)));

    socket.on('error', ({ message }) => toast.error(message));

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

    socket.on('draw-shape', ({ from, tool, startX, startY, endX, endY, color, size }) => {
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
    });

    socket.on('clear-canvas', () => {
      const canvas = annotationCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
  }, [createPeerConnection, roomId, user]);

  useEffect(() => {
    const initialize = async () => {
      if (!user) {
        toast.error('Please log in to join the meeting.');
        navigate('/home');
        return;
      }
      try {
        setIsLoading(true);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, frameRate: 15 },
          audio: true
        });
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];
        console.log('Local stream initialized:', stream);

        socketRef.current = io(SERVER_URL, {
          auth: { token: user.token },
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000
        });

        setupSocketListeners(socketRef.current);
      } catch (error) {
        console.error('Initialization error:', error);
        toast.error('Failed to access camera or microphone. Check permissions.');
        navigate('/home');
      }
    };
    initialize();
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [roomId, user, navigate, setupSocketListeners]);

  useEffect(() => {
    const canvas = annotationCanvasRef.current;
    const container = mainVideoContainerRef.current;
    if (!container || !canvas) return;
    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [mainViewParticipant]);

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
      socketRef.current.emit(isScreenShare ? 'screen-share-start' : 'screen-share-stop', { userId: socketRef.current.id });
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
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack.enabled) {
      videoTrack.enabled = false;
      setIsVideoEnabled(false);
      setParticipants(prev => prev.map(p => p.isLocal ? { ...p, videoEnabled: false } : p));
    } else {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newVideoTrack = newStream.getVideoTracks()[0];
        await replaceTrack(newVideoTrack, false);
        localCameraTrackRef.current = newVideoTrack;
        setIsVideoEnabled(true);
        setParticipants(prev => prev.map(p => p.isLocal ? { ...p, videoEnabled: true } : p));
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
    setCurrentOffset((prev) => {
      const newOffset = prev + direction;
      return Math.max(0, Math.min(newOffset, totalFilmstripPages - 1));
    });
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
  };

  const handleMouseMove = (e) => {
    if (!drawingStateRef.current.isDrawing || !e.buttons) return;
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
                currentTool={currentTool}
                setCurrentTool={setCurrentTool}
                currentBrushSize={currentBrushSize}
                setCurrentBrushSize={setCurrentBrushSize}
                clearCanvas={clearAnnotations}
              />
            </div>
          )}
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
              style={{ pointerEvents: isSomeoneScreenSharing ? 'auto' : 'none', zIndex: 10, touchAction: 'none' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>
          {filmstripParticipants.length > 0 && (
            <div className="h-40 w-full relative">
              <div className="absolute inset-0 flex transition-transform duration-300 ease-in-out" style={{ transform: `translateX(-${currentOffset * 100}%)` }}>
                {Array.from({ length: totalFilmstripPages }, (_, i) => (
                  <div key={i} className={`flex-shrink-0 w-full h-full grid grid-cols-6 gap-4 justify-center`}>
                    {filmstripParticipants.slice(i * filmstripSize, (i + 1) * filmstripSize).map((p) => (
                      <div key={p.userId} className="h-full cursor-pointer" onClick={() => handleParticipantClick(p.userId)} title={`Click to focus on ${p.username}`}>
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
        <div className={`bg-gray-900 border-l border-gray-700 transition-all duration-300 ${isChatOpen || isParticipantsOpen || isAIBotOpen ? 'w-80' : 'w-0'} overflow-hidden`}>
          {isChatOpen && <Chat messages={messages} onSendMessage={(message) => {
            const payload = { message, username: user.username, timestamp: new Date().toISOString() };
            socketRef.current.emit('send-chat-message', payload);
            setMessages((prev) => [...prev, payload]);
          }} currentUser={user} onClose={() => setIsChatOpen(false)} />}
          {isParticipantsOpen && <Participants participants={participants} currentUser={user} onClose={() => setIsParticipantsOpen(false)} roomId={roomId} />}
          {isAIBotOpen && <AIZoomBot onClose={() => setIsAIBotOpen(false)} roomId={roomId} socket={socketRef.current} currentUser={user} />}
        </div>
      </div>
      <div className="bg-gray-900 border-t border-gray-700 p-4 flex justify-center gap-4 z-20">
        <button onClick={toggleAudio} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">{isAudioMuted ? 'Unmute 🎤' : 'Mute 🔇'}</button>
        <button onClick={toggleVideo} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">{isVideoEnabled ? 'Stop Video 📷' : 'Start Video 📹'}</button>
        <button onClick={handleScreenShare} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">{isSharingScreen ? 'Stop Sharing' : 'Share Screen 🖥️'}</button>
        <button onClick={() => { setIsChatOpen(o => !o); setIsParticipantsOpen(false); setIsAIBotOpen(false); }} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">Chat 💬</button>
        <button onClick={() => { setIsParticipantsOpen(o => !o); setIsChatOpen(false); setIsAIBotOpen(false); }} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">Participants 👥</button>
        <button onClick={() => { setIsAIBotOpen(o => !o); setIsChatOpen(false); setIsParticipantsOpen(false); }} className="p-2 rounded-full text-white bg-purple-600 hover:bg-purple-500">AI 🤖</button>
        <button onClick={() => navigate('/home')} className="p-2 rounded text-white bg-red-600 hover:bg-red-500">Exit Room 📞</button>
      </div>
    </div>
  );
};

export default Meeting;