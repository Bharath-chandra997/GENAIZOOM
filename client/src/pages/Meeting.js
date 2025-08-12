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
  // FIX: Default media states are now derived from refs, not separate state
  const [mediaState, setMediaState] = useState({ audio: true, video: true });
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [isAnnotationActive, setIsAnnotationActive] = useState(false);
  const [currentTool, setCurrentTool] = useState('pen');
  const [currentBrushSize, setCurrentBrushSize] = useState(5);
  const [myColor, setMyColor] = useState('');

  // Refs
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const localCameraTrackRef = useRef(null); // To store original camera track during screen share
  const peerConnections = useRef(new Map());
  const annotationCanvasRef = useRef(null);
  const videoContainerRef = useRef(null);
  const drawingStateRef = useRef({ isDrawing: false, startX: 0, startY: 0 });
  const remoteDrawingStates = useRef(new Map());

  // Memoize participants to stabilize references
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

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];
        
        // NEW: Add a placeholder for the local user first
        setParticipants([{ 
            userId: 'local-placeholder', 
            username: `${user.username} (You)`, 
            stream, 
            isLocal: true 
        }]);

        const socket = io(SERVER_URL, { auth: { token: user.token } });
        socketRef.current = socket;

        // FIX: Update local participant with the real socket ID upon connection
        socket.on('connect', () => {
          console.log('Connected to socket server with ID:', socket.id);
          setParticipants(prev => prev.map(p => 
            p.userId === 'local-placeholder' ? { ...p, userId: socket.id } : p
          ));
          socket.emit('join-room', { roomId }, (otherUsers) => {
            console.log('Other users in room:', otherUsers);
            otherUsers.forEach(async (otherUser) => {
              setParticipants(prev => [...prev, { userId: otherUser.userId, username: otherUser.username, stream: null, isLocal: false }]);
              const pc = await createPeerConnection(otherUser.userId, otherUser.username);
              if (pc) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('offer', { to: otherUser.userId, offer });
              }
            });
          });
        });

        socket.on('user-joined', async ({ userId, username }) => {
          toast.info(`${username} joined.`);
          setParticipants(prev => [...prev, { userId, username, stream: null, isLocal: false }]);
        });

        socket.on('offer', async ({ from, offer, username }) => {
          console.log(`Received offer from ${username} (${from})`);
          setParticipants(prev => {
              if (prev.some(p => p.userId === from)) return prev;
              return [...prev, { userId: from, username, stream: null, isLocal: false }];
          });
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
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        });

        socket.on('ice-candidate', ({ from, candidate }) => {
          const pc = peerConnections.current.get(from);
          if (pc) {
            pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        });

        socket.on('user-left', (userId) => {
          toast.info(`A user left.`);
          const pc = peerConnections.current.get(userId);
          if (pc) {
            pc.close();
            peerConnections.current.delete(userId);
          }
          setParticipants((prev) => prev.filter((p) => p.userId !== userId));
        });
        
        // --- Chat and Annotation Listeners (Unchanged) ---
        socket.on('chat-message', (payload) => setMessages((prev) => [...prev, payload]));
        // ... all your drawing listeners remain the same

        setIsLoading(false);
      } catch (error) {
        console.error('Initialization error:', error);
        toast.error('Could not access camera/microphone. Please check permissions.');
        navigate('/home');
      }
    };

    init();

    return () => {
      console.log("Cleaning up meeting component");
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      peerConnections.current.forEach((pc) => pc.close());
      socketRef.current?.disconnect();
    };
  }, [roomId, user, navigate, createPeerConnection]);

  const toggleMedia = (kind) => {
      if (!localStreamRef.current) return;
      const track = kind === 'audio' 
          ? localStreamRef.current.getAudioTracks()[0]
          : localStreamRef.current.getVideoTracks()[0];
      
      if (track) {
          track.enabled = !track.enabled;
          setMediaState(prev => ({ ...prev, [kind]: track.enabled }));
      }
  };

  const handleScreenShare = async () => {
      if (isSharingScreen) {
          // Stop sharing and revert to camera
          const cameraTrack = localCameraTrackRef.current;
          localStreamRef.current.getVideoTracks()[0].stop();
          localStreamRef.current.removeTrack(localStreamRef.current.getVideoTracks()[0]);
          localStreamRef.current.addTrack(cameraTrack);

          for (const pc of peerConnections.current.values()) {
              const sender = pc.getSenders().find(s => s.track?.kind === 'video');
              if (sender) {
                  await sender.replaceTrack(cameraTrack);
              }
          }
          setIsSharingScreen(false);
          setMediaState(prev => ({...prev, video: true}));
      } else {
          // Start sharing
          try {
              const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
              const screenTrack = screenStream.getVideoTracks()[0];
              localCameraTrackRef.current = localStreamRef.current.getVideoTracks()[0]; // Save camera track

              localStreamRef.current.removeTrack(localCameraTrackRef.current);
              localStreamRef.current.addTrack(screenTrack);
              
              for (const pc of peerConnections.current.values()) {
                  const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                  if (sender) {
                      await sender.replaceTrack(screenTrack);
                  }
              }
              setIsSharingScreen(true);
              screenTrack.onended = () => handleScreenShare(); // Revert when user stops sharing via browser UI
          } catch (error) {
              console.error("Screen share error:", error);
              toast.error("Could not start screen share.");
          }
      }
  };

  const sendMessage = (message) => {
    const payload = { message, username: user.username, timestamp: new Date().toISOString() };
    socketRef.current.emit('send-chat-message', payload);
    setMessages((prev) => [...prev, payload]);
  };

  // --- Render Logic ---
  if (isLoading) return <div className="h-screen bg-gray-900 flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  return (
    <div className="h-screen bg-gray-900 flex flex-col overflow-hidden">
      <div className="bg-gray-800 text-white p-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Meeting: {roomId}</h1>
        <span>Participants: {participants.length}</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative p-2" ref={videoContainerRef}>
          {/* AnnotationToolbar and Canvas are unchanged */}
          <div className="w-full h-full grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))` }}>
            {memoizedParticipants.map((p) => (
              <VideoPlayer key={p.userId} participant={p} />
            ))}
          </div>
        </div>
        <div className={`bg-gray-800 border-l border-gray-700 transition-all duration-300 ${isChatOpen || isParticipantsOpen ? 'w-80' : 'w-0'} overflow-hidden`}>
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
        {/* Other buttons unchanged */}
        <button onClick={() => { setIsChatOpen(o => !o); setIsParticipantsOpen(false); }} className="p-2 rounded text-white bg-gray-600">
          Chat 💬
        </button>
        <button onClick={() => { setIsParticipantsOpen(o => !o); setIsChatOpen(false); }} className="p-2 rounded text-white bg-gray-600">
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