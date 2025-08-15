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
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [isAnnotationActive, setIsAnnotationActive] = useState(false);
  const [currentTool, setCurrentTool] = useState('pen');
  const [currentBrushSize, setCurrentBrushSize] = useState(5);
  const [myColor, setMyColor] = useState('');
  const [gridSize] = useState(6); // Fixed grid size for the bottom carousel
  const [currentOffset, setCurrentOffset] = useState(0);

  // Refs
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const localCameraTrackRef = useRef(null);
  const localCameraPiPVideoRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnections = useRef(new Map());
  const annotationCanvasRef = useRef(null);
  const videoContainerRef = useRef(null);
  const drawingStateRef = useRef({ isDrawing: false, startX: 0, startY: 0 });
  const remoteDrawingStates = useRef(new Map());

  // --- NEW LOGIC: Determine main view and grid participants automatically ---
  const mainViewParticipant = useMemo(() => {
    const screenSharer = participants.find(p => p.isScreenSharing);
    if (screenSharer) return screenSharer;

    const host = participants.find(p => p.isHost);
    if (host) return host;

    return participants[0] || null; // Fallback to the first user
  }, [participants]);

  const gridParticipants = useMemo(() => {
    if (!mainViewParticipant) return [];
    return participants.filter(p => p.userId !== mainViewParticipant.userId);
  }, [participants, mainViewParticipant]);
  
  const totalPages = Math.ceil(gridParticipants.length / gridSize);
  
  const getIceServers = useCallback(async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/ice-servers`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch ICE servers:', error);
      toast.error('Using fallback STUN servers.');
      return [{ urls: 'stun:stun.l.google.com:19302' }];
    }
  }, []);

  const createPeerConnection = useCallback(
    async (remoteSocketId) => {
      const iceServers = await getIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      pc.ontrack = (event) => {
        setParticipants((prev) => prev.map((p) =>
          p.userId === remoteSocketId
            ? { ...p, stream: event.streams[0] }
            : p
        ));
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('ice-candidate', { to: remoteSocketId, candidate: event.candidate });
        }
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          pc.restartIce();
        }
      };
      peerConnections.current.set(remoteSocketId, pc);
      return pc;
    },
    [getIceServers]
  );
  
  const setupSocketListeners = useCallback(
    (socket) => {
      socket.on('user-joined', ({ userId, username, isHost }) => {
        setParticipants((prev) => [
          ...prev,
          { userId, username, stream: null, isLocal: false, isHost, videoEnabled: true, audioEnabled: true, isScreenSharing: false },
        ]);
      });

      socket.on('offer', async ({ from, offer, username, isHost }) => {
        setParticipants((prev) => {
          if (prev.some((p) => p.userId === from)) return prev;
          return [...prev, { userId: from, username, stream: null, isLocal: false, isHost, videoEnabled: true, audioEnabled: true, isScreenSharing: false }];
        });
        const pc = await createPeerConnection(from);
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { to: from, answer: pc.localDescription });
      });

      socket.on('answer', ({ from, answer }) => {
        const pc = peerConnections.current.get(from);
        pc?.setRemoteDescription(new RTCSessionDescription(answer));
      });

      socket.on('ice-candidate', ({ from, candidate }) => {
        const pc = peerConnections.current.get(from);
        pc?.addIceCandidate(new RTCIceCandidate(candidate));
      });

      socket.on('user-left', (userId) => {
        peerConnections.current.get(userId)?.close();
        peerConnections.current.delete(userId);
        setParticipants((prev) => prev.filter((p) => p.userId !== userId));
      });

      socket.on('chat-message', (payload) => setMessages((prev) => [...prev, payload]));
      
      socket.on('screen-share-start', ({ userId }) => {
        setParticipants((prev) => prev.map((p) => p.userId === userId ? { ...p, isScreenSharing: true } : p));
      });
      
      socket.on('screen-share-stop', ({ userId }) => {
        setParticipants((prev) => prev.map((p) => p.userId === userId ? { ...p, isScreenSharing: false } : p));
      });
      
      // Drawing listeners remain the same...
    },
    [createPeerConnection]
  );
  
  const replaceTrack = useCallback(async (newTrack, isScreenShare = false) => {
      for (const pc of peerConnections.current.values()) {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newTrack);
        }
      }
      const oldTrack = localStreamRef.current.getVideoTracks()[0];
      localStreamRef.current.removeTrack(oldTrack);
      localStreamRef.current.addTrack(newTrack);

      setParticipants((prev) => prev.map((p) => p.isLocal ? { ...p, isScreenSharing: isScreenShare } : p));

      if (isScreenShare) {
        socketRef.current.emit('screen-share-start');
      } else {
        socketRef.current.emit('screen-share-stop');
      }
    },[]);

  useEffect(() => {
    const initialize = async () => {
      if (!user) {
        navigate('/home');
        return;
      }
      try {
        setIsLoading(true);
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true,
        });
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];
        setIsVideoEnabled(true);
        setIsAudioMuted(false);

        const socket = io(SERVER_URL, { auth: { token: user.token }, transports: ['websocket'] });
        socketRef.current = socket;
        setupSocketListeners(socket);
        
        socket.emit('join-room', { roomId }, (otherUsers) => {
            const isHost = otherUsers.length === 0;
            setParticipants([{ userId: socket.id, username: `${user.username} (You)`, stream, isLocal: true, isHost, videoEnabled: true, audioEnabled: true, isScreenSharing: false }]);
            
            otherUsers.forEach(async (otherUser) => {
                const pc = await createPeerConnection(otherUser.userId);
                stream.getTracks().forEach(track => pc.addTrack(track, stream));
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('offer', { to: otherUser.userId, offer, isHost });
            });
        });
        setIsLoading(false);
      } catch (error) {
        toast.error('Failed to access camera/microphone.');
        navigate('/home');
      }
    };
    initialize();

    return () => {
      socketRef.current?.disconnect();
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      peerConnections.current.forEach(pc => pc.close());
    };
  }, [roomId, user, navigate, createPeerConnection, setupSocketListeners]);

  const toggleAudio = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioMuted(!audioTrack.enabled);
      setParticipants(prev => prev.map(p => p.isLocal ? {...p, audioEnabled: audioTrack.enabled} : p));
    }
  };

  const toggleVideo = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        setParticipants(prev => prev.map(p => p.isLocal ? {...p, videoEnabled: videoTrack.enabled} : p));
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
                if(localCameraTrackRef.current){
                    replaceTrack(localCameraTrackRef.current, false);
                    setIsSharingScreen(false);
                }
            };
        } catch (err) {
            toast.error('Screen sharing failed.');
        }
    }
  };

  const handleSwipe = (direction) => {
    setCurrentOffset((prev) => {
      const newOffset = prev + direction;
      return Math.max(0, Math.min(newOffset, totalPages - 1));
    });
  };
  
  // Handlers for annotations remain the same...

  if (isLoading) return <div className="h-screen bg-black flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden text-white">
      <div className="bg-gray-900 p-4 flex items-center justify-between z-20">
        <h1 className="text-lg font-semibold">Meeting: {roomId}</h1>
        <span>Participants: {participants.length}</span>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        <div 
          className="flex-1 flex flex-col relative p-2 gap-2" 
          ref={videoContainerRef}
          onWheel={(e) => {
            if (e.deltaY !== 0) {
              e.preventDefault();
              handleSwipe(e.deltaY > 0 ? 1 : -1);
            }
          }}
        >
          {/* --- Main Video Display --- */}
          <div className="flex-1 w-full h-full relative">
            {mainViewParticipant && (
              <VideoPlayer
                key={mainViewParticipant.userId}
                participant={mainViewParticipant}
                isMainView={true}
                isLocal={mainViewParticipant.isLocal}
                isHost={mainViewParticipant.isHost}
                {...(mainViewParticipant.isLocal && {
                  localCameraVideoRef: localCameraPiPVideoRef,
                  localCameraTrackRef: localCameraTrackRef,
                })}
              />
            )}
          </div>

          {/* --- Bottom Swipeable Grid --- */}
          {gridParticipants.length > 0 && (
            <div className="w-full h-40 relative">
              <div
                className="absolute inset-0 flex transition-transform duration-300 ease-in-out"
                style={{ transform: `translateX(-${currentOffset * 100}%)` }}
              >
                {Array.from({ length: totalPages }, (_, i) => (
                  <div key={i} className="flex-shrink-0 w-full h-full grid grid-cols-6 gap-2">
                    {gridParticipants.slice(i * gridSize, (i + 1) * gridSize).map((p) => (
                      <div key={p.userId} className="h-full">
                        <VideoPlayer
                          participant={p}
                          isMainView={false}
                          isLocal={p.isLocal}
                          isHost={p.isHost}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- Navigation Dots --- */}
          {totalPages > 1 && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentOffset(i)}
                  className={`w-2.5 h-2.5 rounded-full ${currentOffset === i ? 'bg-white' : 'bg-gray-500/50'}`}
                />
              ))}
            </div>
          )}
        </div>
        
        {/* --- Side Panels (Chat/Participants) --- */}
        <div className={`bg-gray-900 border-l border-gray-700 transition-all duration-300 ${isChatOpen || isParticipantsOpen ? 'w-80' : 'w-0'} overflow-hidden`}>
            {/* Chat and Participants components go here */}
        </div>
      </div>
      
      {/* --- Control Bar --- */}
      <div className="bg-gray-900 border-t border-gray-700 p-4 flex justify-center gap-4 z-20">
        <button onClick={toggleAudio} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">
          {isAudioMuted ? 'Unmute 🎤' : 'Mute 🔇'}
        </button>
        <button onClick={toggleVideo} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">
          {isVideoEnabled ? 'Stop Video 📷' : 'Start Video 📹'}
        </button>
        <button onClick={handleScreenShare} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">
          {isSharingScreen ? 'Stop Sharing' : 'Share Screen 🖥️'}
        </button>
        <button onClick={() => { setIsChatOpen(o => !o); setIsParticipantsOpen(false); }} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">
          Chat 💬
        </button>
        <button onClick={() => { setIsParticipantsOpen(o => !o); setIsChatOpen(false); }} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">
          Participants 👥
        </button>
        <button onClick={() => navigate('/home')} className="p-2 rounded text-white bg-red-600 hover:bg-red-500">
          Exit Room 📞
        </button>
      </div>
    </div>
  );
};

export default Meeting;