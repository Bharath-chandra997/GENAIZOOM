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
  const [pinnedParticipantId, setPinnedParticipantId] = useState(null);
  const [gridSize, setGridSize] = useState(4); // Default to 4 frames
  const [currentOffset, setCurrentOffset] = useState(0);

  // Refs
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const localCameraTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnections = useRef(new Map());
  const annotationCanvasRef = useRef(null);
  const videoContainerRef = useRef(null);
  const drawingStateRef = useRef({ isDrawing: false, startX: 0, startY: 0 });
  const remoteDrawingStates = useRef(new Map());
  const localVideoRef = useRef(null); // Ref for local video element to solve Issue #1

  // Memoize participants to prevent unnecessary re-renders
  const memoizedParticipants = useMemo(() => participants, [participants]);
  
  // Memoize local participant for easy access
  const localParticipant = useMemo(() => memoizedParticipants.find(p => p.isLocal), [memoizedParticipants]);


  // Paginated participants with swipe logic
  const totalPages = Math.ceil(memoizedParticipants.length / gridSize);
  const smallParticipants = useMemo(() => 
    pinnedParticipantId ? memoizedParticipants.filter(p => p.userId !== pinnedParticipantId) : [], 
    [pinnedParticipantId, memoizedParticipants]
  );
  const totalSmallPages = Math.ceil(smallParticipants.length / gridSize);
  const gridClass = gridSize === 4 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-3 grid-rows-2';

  const getIceServers = useCallback(async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/ice-servers`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch ICE servers:', error);
      toast.error('Using fallback STUN servers.');
      return [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];
    }
  }, []);

  const createPeerConnection = useCallback(
    async (remoteSocketId) => {
      const iceServers = await getIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      pc.ontrack = (event) => {
        setParticipants((prev) => prev.map((p) =>
          p.userId === remoteSocketId
            ? { ...p, stream: event.streams[0], videoEnabled: event.streams[0].getVideoTracks()[0]?.enabled ?? false, audioEnabled: event.streams[0].getAudioTracks()[0]?.enabled ?? false }
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
      // Set socket ID for local user to fix host assignment and key issues
      socket.on('connect', () => {
        setParticipants(prev => prev.map(p =>
          p.userId === 'local' ? { ...p, userId: socket.id } : p
        ));
      });

      socket.on('user-joined', ({ userId, username, isHost }) => {
        setParticipants((prev) => {
          if (prev.some((p) => p.userId === userId)) return prev;
          return [
            ...prev,
            { userId, username, stream: null, isLocal: false, isHost, videoEnabled: false, audioEnabled: false, isScreenSharing: false, connectionQuality: 'good' },
          ];
        });
      });
      socket.on('offer', async ({ from, offer, username, isHost }) => {
        setParticipants((prev) => {
          if (prev.some((p) => p.userId === from)) return prev;
          return [
            ...prev,
            { userId: from, username, stream: null, isLocal: false, isHost, videoEnabled: false, audioEnabled: false, isScreenSharing: false, connectionQuality: 'good' },
          ];
        });
        const pc = await createPeerConnection(from);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { to: from, answer: pc.localDescription });
      });
      socket.on('answer', ({ from, answer }) => {
        const pc = peerConnections.current.get(from);
        if (pc) {
          pc.setRemoteDescription(new RTCSessionDescription(answer)).catch((err) => console.error(`Failed to set remote description: ${err}`));
        }
      });
      socket.on('ice-candidate', ({ from, candidate }) => {
        const pc = peerConnections.current.get(from);
        if (pc) {
          pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => console.error(`Failed to add ICE candidate: ${err}`));
        }
      });
      socket.on('user-left', (userId) => {
        const pc = peerConnections.current.get(userId);
        if (pc) {
          pc.close();
          peerConnections.current.delete(userId);
        }
        setParticipants((prev) => prev.filter((p) => p.userId !== userId));
        if (pinnedParticipantId === userId) {
          setPinnedParticipantId(null);
        }
      });
      socket.on('chat-message', (payload) => setMessages((prev) => [...prev, payload]));
      
      // ISSUE 2 & 4 FIX: Pinning events handled to sync state across clients.
      socket.on('pin-participant', ({ userId }) => setPinnedParticipantId(userId));
      socket.on('unpin-participant', () => setPinnedParticipantId(null));

      // ISSUE 2 & 4 FIX: Auto-pin screen share for better focus.
      socket.on('screen-share-start', ({ userId }) => {
        setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, isScreenSharing: true } : p)));
        setPinnedParticipantId(userId); // Automatically pin the screen sharer
      });

      socket.on('screen-share-stop', ({ userId }) => {
        setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, isScreenSharing: false } : p)));
        if (pinnedParticipantId === userId) {
            setPinnedParticipantId(null); // Unpin if they were the pinned one
        }
      });
      
      // Drawing and annotation events (unchanged)
      socket.on('drawing-start',({ from, x, y, color, size, tool }) => {/* ... */});
      socket.on('drawing-move', ({ from, x, y }) => {/* ... */});
      socket.on('drawing-end', ({ from }) => {/* ... */});
      socket.on('draw-shape', (data) => {/* ... */});
      socket.on('clear-canvas', () => {/* ... */});
    },
    [createPeerConnection, pinnedParticipantId]
  );
  
  // ISSUE 3 FIX: A robust `replaceTrack` function to update streams for all peers.
  const replaceTrack = useCallback(async (newTrack) => {
    for (const pc of peerConnections.current.values()) {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === newTrack.kind);
      if (sender) {
        await sender.replaceTrack(newTrack).catch((err) => console.error('Failed to replace track:', err));
      }
    }
  }, []);

  useEffect(() => {
    if (pinnedParticipantId) setCurrentOffset(0);
  }, [pinnedParticipantId]);

  useEffect(() => {
    if (!user) {
      navigate('/home');
      return;
    }
    setMyColor(`hsl(${Math.random() * 360}, 80%, 60%)`);
    
    const initialize = async () => {
      try {
        setIsLoading(true);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });

        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];

        // ISSUE 1 FIX: Immediately assign stream to the local participant state.
        // The VideoPlayer component will use this to show the local video preview.
        // The `userId` is temporary and will be updated to the socket.id on connection.
        setParticipants([
          { userId: 'local', username: `${user.username} (You)`, stream, isLocal: true, isHost: false, videoEnabled: true, audioEnabled: true, isScreenSharing: false, connectionQuality: 'good' },
        ]);

        const socket = io(SERVER_URL, { auth: { token: user.token }, transports: ['websocket'] });
        socketRef.current = socket;
        setupSocketListeners(socket);

        socket.emit('join-room', { roomId }, async (otherUsers) => {
          // ISSUE 4 FIX: Host status is determined by the server (first user in room).
          // This logic correctly sets the `isHost` flag on the local participant.
          const isHost = otherUsers.length === 0;
          setParticipants((prev) => prev.map((p) => p.isLocal ? { ...p, isHost } : p));
          
          for (const otherUser of otherUsers) {
            setParticipants((prev) => {
              if (prev.some((p) => p.userId === otherUser.userId)) return prev;
              return [...prev, { userId: otherUser.userId, username: otherUser.username, stream: null, isLocal: false, isHost: otherUser.isHost || false, videoEnabled: false, audioEnabled: false, isScreenSharing: false, connectionQuality: 'good' }];
            });
            const pc = await createPeerConnection(otherUser.userId);
            if (!pc || !localStreamRef.current) continue;
            localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketRef.current.emit('offer', { to: otherUser.userId, offer: pc.localDescription });
          }
        });
        setIsLoading(false);
      } catch (error) {
        console.error('Initialization error:', error);
        toast.error('Failed to initialize meeting. Check camera/microphone permissions.');
        navigate('/home');
      }
    };
    initialize();
    return () => {
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      socketRef.current?.disconnect();
    };
  }, [roomId, user, navigate, createPeerConnection, setupSocketListeners]);

  const toggleAudio = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioMuted(!audioTrack.enabled);
      setParticipants((prev) => prev.map((p) => (p.isLocal ? { ...p, audioEnabled: audioTrack.enabled } : p)));
    }
  };

  const toggleVideo = () => {
    // ISSUE 1 FIX: This function now correctly enables/disables the video track.
    // The initial video visibility is handled in the `initialize` effect.
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
      setParticipants((prev) => prev.map((p) => (p.isLocal ? { ...p, videoEnabled: videoTrack.enabled } : p)));
    }
  };

  const handleScreenShare = async () => {
    if (isSharingScreen) {
      // --- Stop Sharing ---
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      if (localCameraTrackRef.current) {
        await replaceTrack(localCameraTrackRef.current);
        
        // ISSUE 3 FIX: Create a new MediaStream to force React to update the video element's srcObject, preventing a frozen frame.
        const newCameraStream = new MediaStream([localCameraTrackRef.current, ...localStreamRef.current.getAudioTracks()]);
        localStreamRef.current = newCameraStream;

        setParticipants((prev) => prev.map((p) => (p.isLocal ? { ...p, stream: newCameraStream, isScreenSharing: false } : p)));
        setIsSharingScreen(false);
        socketRef.current.emit('screen-share-stop');
      }
    } else {
      // --- Start Sharing ---
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        await replaceTrack(screenTrack);
        
        const newMixedStream = new MediaStream([screenTrack, ...localStreamRef.current.getAudioTracks()]);
        localStreamRef.current = newMixedStream;

        setParticipants((prev) => prev.map((p) => (p.isLocal ? { ...p, stream: newMixedStream, isScreenSharing: true } : p)));
        setIsSharingScreen(true);
        socketRef.current.emit('screen-share-start');
        
        screenTrack.onended = async () => {
          // Triggered by browser's "Stop sharing" button
          if (localCameraTrackRef.current) {
            await replaceTrack(localCameraTrackRef.current);

            // ISSUE 3 FIX: Same logic as above to prevent frozen frame.
            const newCameraStream = new MediaStream([localCameraTrackRef.current, ...localStreamRef.current.getAudioTracks()]);
            localStreamRef.current = newCameraStream;

            setParticipants((prev) => prev.map((p) => (p.isLocal ? { ...p, stream: newCameraStream, isScreenSharing: false } : p)));
            setIsSharingScreen(false);
            socketRef.current.emit('screen-share-stop');
          }
        };
      } catch (err) {
        console.error('Screen sharing error:', err);
        toast.error('Screen sharing failed.');
      }
    }
  };

  // ISSUE 2 FIX: Simplified pinning logic. The host can pin/unpin any participant.
  const handlePin = (userId) => {
    if (pinnedParticipantId === userId) {
      // If already pinned, unpin
      setPinnedParticipantId(null);
      socketRef.current.emit('unpin-participant');
    } else {
      // Otherwise, pin the user
      setPinnedParticipantId(userId);
      socketRef.current.emit('pin-participant', { userId });
    }
  };

  const handleSwipe = (direction, maxPages = totalPages) => {
    setCurrentOffset((prev) => {
      const newOffset = prev + direction;
      return Math.max(0, Math.min(newOffset, maxPages - 1));
    });
  };
  
  // Canvas and drawing functions (unchanged)
  const resizeCanvas = () => {/* ... */};
  useEffect(() => {/* ... */}, []);
  const handleMouseDown = (e) => {/* ... */};
  const handleMouseMove = (e) => {/* ... */};
  const handleMouseUp = () => {/* ... */};
  const handleMouseMoveForShapes = (e) => {/* ... */};

  if (isLoading) return <div className="h-screen bg-black flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden text-white">
      <div className="bg-gray-900 p-4 flex items-center justify-between">{/* Header */}</div>
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 relative p-4" ref={videoContainerRef}>
          <AnnotationToolbar isAnnotationActive={isAnnotationActive} /* ...props */ />
          <canvas ref={annotationCanvasRef} /* ...props */ />

          {/* ISSUE 2 & 4 FIX: Simplified render logic. If a participant is pinned (for any reason), show the pinned layout. */}
          {pinnedParticipantId && participants.find(p => p.userId === pinnedParticipantId) ? (
            // --- Pinned View ---
            <div className="h-full flex flex-col">
              <div className="flex-1">
                <VideoPlayer
                  key={pinnedParticipantId}
                  participant={participants.find((p) => p.userId === pinnedParticipantId)}
                  isPinned={true}
                  onPin={() => handlePin(pinnedParticipantId)}
                  isLocal={participants.find((p) => p.userId === pinnedParticipantId)?.isLocal}
                  isHost={localParticipant?.isHost}
                  localCameraVideoRef={localParticipant?.isScreenSharing ? localVideoRef : null}
                />
              </div>
              {/* Swipeable row of other participants */}
              <div className="h-40 relative mt-4">
                <div className="absolute inset-0 flex transition-transform duration-300" style={{ transform: `translateX(-${currentOffset * 100}%)` }}>
                  {Array.from({ length: totalSmallPages }, (_, i) => (
                    <div key={i} className="flex-shrink-0 w-full flex gap-4">
                      {smallParticipants.slice(i * gridSize, (i + 1) * gridSize).map((p) => (
                        <div key={p.userId} className="flex-1 h-full">
                          <VideoPlayer
                            participant={p}
                            isPinned={false}
                            onPin={() => handlePin(p.userId)}
                            isLocal={p.isLocal}
                            isHost={localParticipant?.isHost}
                            localCameraVideoRef={p.isLocal && p.isScreenSharing ? localVideoRef : null}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                {/* Swipe navigation dots */}
              </div>
            </div>
          ) : (
            // --- Gallery View ---
            <div className="h-full relative">
              <div className="absolute inset-0 flex transition-transform duration-300" style={{ transform: `translateX(-${currentOffset * 100}%)` }}>
                {Array.from({ length: totalPages }, (_, i) => (
                  <div key={i} className={`flex-shrink-0 w-full h-full grid gap-4 ${gridClass}`}>
                    {memoizedParticipants.slice(i * gridSize, (i + 1) * gridSize).map((p) => (
                      <div key={p.userId} className="bg-gray-800 rounded-lg overflow-hidden">
                        <VideoPlayer
                          participant={p}
                          isPinned={false}
                          onPin={() => handlePin(p.userId)}
                          isLocal={p.isLocal}
                          isHost={localParticipant?.isHost}
                          localCameraVideoRef={p.isLocal && p.isScreenSharing ? localVideoRef : null}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {/* Swipe navigation dots */}
            </div>
          )}
        </div>
        
        {/* Chat and Participants Side Panel */}
        <div className={`bg-gray-900 border-l border-gray-700 transition-all duration-300 ${isChatOpen || isParticipantsOpen ? 'w-80' : 'w-0'} overflow-hidden`}>
          {isChatOpen && <Chat /* ...props */ />}
          {isParticipantsOpen && <Participants participants={memoizedParticipants} /* ...props */ />}
        </div>
      </div>
      {/* Control Bar */}
      <div className="bg-gray-900 border-t border-gray-700 p-4 flex justify-center gap-4">
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