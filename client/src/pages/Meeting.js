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
  const [mediaState, setMediaState] = useState({ audio: true, video: true });
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  // RESTORED: Annotation state
  const [isAnnotationActive, setIsAnnotationActive] = useState(false);
  const [currentTool, setCurrentTool] = useState('pen');
  const [currentBrushSize, setCurrentBrushSize] = useState(5);
  const [myColor, setMyColor] = useState('');

  // Refs
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const localCameraTrackRef = useRef(null);
  const peerConnections = useRef(new Map());
  // RESTORED: Annotation refs
  const annotationCanvasRef = useRef(null);
  const videoContainerRef = useRef(null);
  const drawingStateRef = useRef({ isDrawing: false, startX: 0, startY: 0 });
  const remoteDrawingStates = useRef(new Map());

  const memoizedParticipants = useMemo(() => participants, [participants]);

  const getIceServers = useCallback(async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/ice-servers`);
      return response.data;
    } catch (error) {
      console.error('Failed to get ICE servers:', error);
      return [{ urls: 'stun:stun.l.google.com:19302' }];
    }
  }, []);

  // CORRECTED LOGIC: Stable WebRTC connection setup
  const createPeerConnection = useCallback(async (remoteSocketId, remoteUsername) => {
      try {
        const iceServers = await getIceServers();
        const pc = new RTCPeerConnection({ iceServers });

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socketRef.current.emit('ice-candidate', { to: remoteSocketId, candidate: event.candidate });
          }
        };

        pc.ontrack = (event) => {
          console.log(`Received remote stream from ${remoteUsername} (${remoteSocketId})`);
          setParticipants((prev) =>
            prev.map((p) =>
              p.userId === remoteSocketId ? { ...p, stream: event.streams[0] } : p
            )
          );
        };

        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => {
            pc.addTrack(track, localStreamRef.current);
          });
        }

        peerConnections.current.set(remoteSocketId, pc);
        return pc;
      } catch (error) {
        console.error('Failed to create peer connection:', error);
        return null;
      }
    }, [getIceServers]);

  useEffect(() => {
    if (!user || !roomId) {
      navigate('/home');
      return;
    }
    setMyColor(`hsl(${Math.random() * 360}, 80%, 60%)`);

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];
        
        setParticipants([{ 
            userId: 'local-placeholder', 
            username: `${user.username} (You)`, 
            stream, 
            isLocal: true 
        }]);

        const socket = io(SERVER_URL, { auth: { token: user.token } });
        socketRef.current = socket;

        socket.on('connect', () => {
          setParticipants(prev => prev.map(p => 
            p.userId === 'local-placeholder' ? { ...p, userId: socket.id } : p
          ));
          socket.emit('join-room', { roomId }, (otherUsers) => {
            otherUsers.forEach(async (otherUser) => {
              const pc = await createPeerConnection(otherUser.userId, otherUser.username);
              if (pc) {
                setParticipants(prev => [...prev, { userId: otherUser.userId, username: otherUser.username, stream: null, isLocal: false }]);
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('offer', { to: otherUser.userId, offer });
              }
            });
          });
        });

        socket.on('user-joined', async ({ userId, username }) => {
          toast.info(`${username} joined.`);
          // This user has joined, we will wait for their offer
          setParticipants(prev => [...prev, { userId, username, stream: null, isLocal: false }]);
        });

        socket.on('offer', async ({ from, offer, username }) => {
          const pc = await createPeerConnection(from, username);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('answer', { to: from, answer });
          }
        });

        socket.on('answer', async ({ from, answer }) => {
          const pc = peerConnections.current.get(from);
          if (pc && pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        });

        socket.on('ice-candidate', ({ from, candidate }) => {
          const pc = peerConnections.current.get(from);
          if (pc) pc.addIceCandidate(new RTCIceCandidate(candidate));
        });

        socket.on('user-left', (userId) => {
          toast.info(`A user left.`);
          const pc = peerConnections.current.get(userId);
          if (pc) { pc.close(); peerConnections.current.delete(userId); }
          setParticipants((prev) => prev.filter((p) => p.userId !== userId));
        });
        
        // Chat and Annotation Listeners (Unchanged)
        socket.on('chat-message', (payload) => setMessages((prev) => [...prev, payload]));
        socket.on('drawing-start', ({ from, x, y, color, size, tool }) => {
            remoteDrawingStates.current.set(from, { color, size, tool });
            const canvas = annotationCanvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (ctx && canvas) {
                const absX = x * canvas.width;
                const absY = y * canvas.height;
                ctx.beginPath();
                ctx.moveTo(absX, absY);
            }
        });
        socket.on('drawing-move', ({ from, x, y }) => {
            const state = remoteDrawingStates.current.get(from);
            const canvas = annotationCanvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (!state || !ctx || !canvas) return;
            const absX = x * canvas.width;
            const absY = y * canvas.height;
            ctx.lineWidth = state.size;
            ctx.strokeStyle = state.color;
            ctx.globalCompositeOperation = state.tool === 'eraser' ? 'destination-out' : 'source-over';
            ctx.lineCap = 'round';
            ctx.lineTo(absX, absY);
            ctx.stroke();
        });
        socket.on('drawing-end', ({ from }) => { remoteDrawingStates.current.delete(from); });
        socket.on('clear-canvas', () => {
            const canvas = annotationCanvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        });

        setIsLoading(false);
      } catch (error) {
        console.error('Initialization error:', error);
        toast.error('Could not access camera/microphone. Please check permissions.');
        navigate('/home');
      }
    };

    init();

    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      peerConnections.current.forEach((pc) => pc.close());
      socketRef.current?.disconnect();
    };
  }, [roomId, user, navigate, createPeerConnection]);

  const toggleMedia = (kind) => {
      const track = kind === 'audio' 
          ? localStreamRef.current?.getAudioTracks()[0]
          : localStreamRef.current?.getVideoTracks()[0];
      if (track) {
          track.enabled = !track.enabled;
          setMediaState(prev => ({ ...prev, [kind]: track.enabled }));
      }
  };

  const handleScreenShare = async () => {
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (isSharingScreen) {
        // Stop sharing
        const newTrack = localCameraTrackRef.current;
        await videoTrack.stop(); // Stop the screen track
        for (const pc of peerConnections.current.values()) {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) await sender.replaceTrack(newTrack);
        }
        localStreamRef.current.removeTrack(videoTrack);
        localStreamRef.current.addTrack(newTrack);
        setIsSharingScreen(false);
        setMediaState(prev => ({ ...prev, video: true }));
    } else {
        // Start sharing
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const newTrack = screenStream.getVideoTracks()[0];
            localCameraTrackRef.current = videoTrack; // Save camera track
            for (const pc of peerConnections.current.values()) {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) await sender.replaceTrack(newTrack);
            }
            localStreamRef.current.removeTrack(videoTrack);
            localStreamRef.current.addTrack(newTrack);
            setIsSharingScreen(true);
            newTrack.onended = () => handleScreenShare(); // Revert when user stops sharing via browser UI
        } catch (error) {
            console.error("Screen share error:", error);
            toast.error("Could not start screen share.");
        }
    }
  };

  const sendMessage = (message) => {
    const payload = { message, username: user.username, userId: socketRef.current.id, timestamp: new Date().toISOString() };
    socketRef.current.emit('send-chat-message', payload);
    setMessages((prev) => [...prev, payload]);
  };
  
  // RESTORED: All annotation handlers and useEffect
  useEffect(() => {
    const canvas = annotationCanvasRef.current;
    if (!canvas || !isAnnotationActive) return;

    const ctx = canvas.getContext('2d');
    const resizeCanvas = () => {
      if (videoContainerRef.current) {
        canvas.width = videoContainerRef.current.clientWidth;
        canvas.height = videoContainerRef.current.clientHeight;
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const getCoords = (e) => ({
      x: e.clientX - canvas.getBoundingClientRect().left,
      y: e.clientY - canvas.getBoundingClientRect().top,
    });

    const startDrawing = (e) => {
      drawingStateRef.current.isDrawing = true;
      const { x, y } = getCoords(e);
      drawingStateRef.current.startX = x;
      drawingStateRef.current.startY = y;
      if (currentTool === 'pen' || currentTool === 'eraser') {
        ctx.beginPath();
        ctx.moveTo(x, y);
        const relX = x / canvas.width;
        const relY = y / canvas.height;
        socketRef.current.emit('drawing-start', { x: relX, y: relY, color: myColor, size: currentBrushSize, tool: currentTool });
      }
    };

    const draw = (e) => {
      if (!drawingStateRef.current.isDrawing || (currentTool !== 'pen' && currentTool !== 'eraser')) return;
      const { x, y } = getCoords(e);
      ctx.lineWidth = currentBrushSize;
      ctx.strokeStyle = myColor;
      ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.lineCap = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
      const relX = x / canvas.width;
      const relY = y / canvas.height;
      socketRef.current.emit('drawing-move', { x: relX, y: relY });
    };

    const stopDrawing = (e) => {
      if (!drawingStateRef.current.isDrawing) return;
      drawingStateRef.current.isDrawing = false;
      ctx.closePath();
      socketRef.current.emit('drawing-end');
    };

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('mousedown', startDrawing);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', stopDrawing);
      canvas.removeEventListener('mouseleave', stopDrawing);
    };
  }, [isAnnotationActive, myColor, currentBrushSize, currentTool]);

  const clearCanvas = () => {
    const canvas = annotationCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      socketRef.current.emit('clear-canvas');
    }
  };

  if (isLoading) return <div className="h-screen bg-gray-900 flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  return (
    // RESTORED: Original UI structure and class names
    <div className="h-screen bg-gray-900 flex flex-col overflow-hidden">
      <div className="bg-gray-800 text-white p-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Meeting: {roomId}</h1>
        <span>Participants: {participants.length}</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative p-2" ref={videoContainerRef}>
          {/* RESTORED: Annotation toolbar and canvas */}
          <AnnotationToolbar
            isAnnotationActive={isAnnotationActive}
            toggleAnnotations={() => setIsAnnotationActive((prev) => !prev)}
            currentTool={currentTool}
            setCurrentTool={setCurrentTool}
            currentBrushSize={currentBrushSize}
            setCurrentBrushSize={setCurrentBrushSize}
            clearCanvas={clearCanvas}
          />
          <canvas
            ref={annotationCanvasRef}
            className="absolute top-0 left-0"
            style={{ pointerEvents: isAnnotationActive ? 'auto' : 'none', zIndex: 10, width: '100%', height: '100%' }}
          />
          <div className="w-full h-full grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))` }}>
            {memoizedParticipants.map((p) => (
              <VideoPlayer key={p.userId} participant={p} />
            ))}
          </div>
        </div>

        <div className={`bg-gray-800 border-l border-gray-700 transition-all duration-300 ${ isChatOpen || isParticipantsOpen ? 'w-80' : 'w-0' } overflow-hidden`}>
          {isChatOpen && <Chat messages={messages} onSendMessage={sendMessage} currentUser={user} onClose={() => setIsChatOpen(false)} />}
          {isParticipantsOpen && <Participants participants={memoizedParticipants} currentUser={user} onClose={() => setIsParticipantsOpen(false)} roomId={roomId} />}
        </div>
      </div>

      <div className="bg-gray-800 border-t border-gray-700 p-4 flex justify-center gap-4">
        <button onClick={() => toggleMedia('audio')} className="p-2 rounded text-white bg-gray-600">
          {mediaState.audio ? 'Mute 🎤' : 'Unmute 🔇'}
        </button>
        <button onClick={() => toggleMedia('video')} className="p-2 rounded text-white bg-gray-600">
          {mediaState.video && !isSharingScreen ? 'Stop Video 📷' : 'Start Video 📹'}
        </button>
        <button onClick={handleScreenShare} className="p-2 rounded text-white bg-gray-600">
          {isSharingScreen ? 'Stop Sharing' : 'Share Screen 🖥️'}
        </button>
        <button onClick={() => { setIsChatOpen((o) => !o); setIsParticipantsOpen(false); }} className="p-2 rounded text-white bg-gray-600">
          Chat 💬
        </button>
        <button onClick={() => { setIsParticipantsOpen((o) => !o); setIsChatOpen(false); }} className="p-2 rounded text-white bg-gray-600">
          Participants 👥
        </button>
        <button onClick={() => navigate('/home')} className="p-2 rounded text-white bg-red-600">
          Exit Room 📞
        </button>
      </div>
    </div>
  );
};

export default Meeting;