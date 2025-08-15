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
import BreakoutRoomPanel from '../components/BreakoutRoomPanel';
import PollPanel from '../components/PollPanel';
import SettingsPanel from '../components/SettingsPanel';
import RecordingIndicator from '../components/RecordingIndicator';

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
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isBreakoutOpen, setIsBreakoutOpen] = useState(false);
  const [isPollOpen, setIsPollOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnnotationActive, setIsAnnotationActive] = useState(false);
  const [currentTool, setCurrentTool] = useState('pen');
  const [currentBrushSize, setCurrentBrushSize] = useState(5);
  const [myColor, setMyColor] = useState('');
  const [pinnedParticipantId, setPinnedParticipantId] = useState(null);
  const [gridSize, setGridSize] = useState(4);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [breakoutRooms, setBreakoutRooms] = useState([]);
  const [activePoll, setActivePoll] = useState(null);
  const [pollResults, setPollResults] = useState({});
  const [videoQuality, setVideoQuality] = useState('high');
  const [hostId, setHostId] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);

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
  const recorderRef = useRef(null);

  // Memoization and Derived State
  const memoizedParticipants = useMemo(() => participants, [participants]);
  
  const pinnedParticipant = useMemo(() => 
    pinnedParticipantId ? memoizedParticipants.find(p => p.userId === pinnedParticipantId) : null,
    [pinnedParticipantId, memoizedParticipants]
  );

  const otherParticipants = useMemo(() => 
    pinnedParticipantId ? memoizedParticipants.filter(p => p.userId !== pinnedParticipantId) : memoizedParticipants,
    [pinnedParticipantId, memoizedParticipants]
  );
  
  const galleryParticipants = pinnedParticipant ? otherParticipants : memoizedParticipants;
  const totalPages = Math.ceil(galleryParticipants.length / gridSize);
  
  const visibleParticipants = useMemo(() => {
    const start = currentOffset * gridSize;
    const end = start + gridSize;
    return galleryParticipants.slice(start, end);
  }, [galleryParticipants, currentOffset, gridSize]);
  
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
        setParticipants((prev) =>
          prev.map((p) =>
            p.userId === remoteSocketId
              ? { ...p, stream: event.streams[0], videoEnabled: event.streams[0].getVideoTracks()[0]?.enabled ?? false, audioEnabled: event.streams[0].getAudioTracks()[0]?.enabled ?? false }
              : p
          )
        );
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
        setParticipants((prev) => {
          if (prev.some((p) => p.userId === userId)) return prev;
          const updatedParticipants = [
            ...prev,
            { userId, username, stream: null, isLocal: false, isHost: isHost && !hostId, videoEnabled: false, audioEnabled: false, isScreenSharing: false, connectionQuality: 'good' },
          ];
          if (prev.length === 0) setHostId(userId); // Set host on first join
          return updatedParticipants;
        });
      });

      socket.on('offer', async ({ from, offer, username, isHost }) => {
        setParticipants((prev) => {
          if (prev.some((p) => p.userId === from)) return prev;
          return [
            ...prev,
            { userId: from, username, stream: null, isLocal: false, isHost: isHost && !hostId, videoEnabled: false, audioEnabled: false, isScreenSharing: false, connectionQuality: 'good' },
          ];
        });
        const pc = await createPeerConnection(from);
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
        if (pc) pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(console.error);
      });

      socket.on('ice-candidate', ({ from, candidate }) => {
        const pc = peerConnections.current.get(from);
        if (pc) pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      });

      socket.on('user-left', (userId) => {
        const pc = peerConnections.current.get(userId);
        if (pc) {
          pc.close();
          peerConnections.current.delete(userId);
        }
        setParticipants((prev) => prev.filter((p) => p.userId !== userId));
        if (pinnedParticipantId === userId) setPinnedParticipantId(null);
      });

      socket.on('chat-message', (payload) => setMessages((prev) => [...prev, payload]));
      socket.on('pin-participant', ({ userId }) => setPinnedParticipantId(userId));
      socket.on('unpin-participant', () => setPinnedParticipantId(null));
      socket.on('screen-share-start', ({ userId }) => {
        setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, isScreenSharing: true } : p)));
      });
      socket.on('screen-share-stop', ({ userId }) => {
        setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, isScreenSharing: false } : p)));
      });
      socket.on('join-request', ({ userId, username }) => {
        if (participants.find((p) => p.userId === hostId)?.isLocal) {
          setPendingRequests((prev) => [...prev, { userId, username }]);
          toast.info(`${username} is requesting to join.`);
        }
      });
      socket.on('approve-join', ({ userId }) => {
        setParticipants((prev) => [...prev, prev.find((p) => p.userId === userId)]);
        setPendingRequests((prev) => prev.filter((p) => p.userId !== userId));
      });
      socket.on('reject-join', ({ userId }) => setPendingRequests((prev) => prev.filter((p) => p.userId !== userId)));
      socket.on('breakout-room-created', ({ roomId, participants }) => setBreakoutRooms((prev) => [...prev, { roomId, participants }]));
      socket.on('poll-created', (poll) => setActivePoll(poll));
      socket.on('poll-vote', (results) => setPollResults(results));
      socket.on('recording-started', () => setIsRecording(true));
      socket.on('recording-stopped', () => setIsRecording(false));
    },
    [createPeerConnection, hostId, participants, pinnedParticipantId]
  );
  
  const replaceTrack = useCallback(
    async (newTrack, isScreenShare = false) => {
      for (const pc of peerConnections.current.values()) {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === newTrack.kind);
        if (sender) {
          await sender.replaceTrack(newTrack).catch(console.error);
        }
      }
      
      if (localStreamRef.current) {
        const oldTrack = localStreamRef.current.getTracks().find((t) => t.kind === newTrack.kind);
        if (oldTrack) {
          localStreamRef.current.removeTrack(oldTrack);
          oldTrack.stop();
        }
        localStreamRef.current.addTrack(newTrack);

        // **FIX:** Create a new MediaStream object to force React to detect the change
        const newStream = new MediaStream(localStreamRef.current.getTracks());
        
        setParticipants((prev) =>
          prev.map((p) =>
            p.isLocal
              ? {
                  ...p,
                  stream: newStream, // Use the new stream object
                  videoEnabled: newTrack.kind === 'video' ? newTrack.enabled : p.videoEnabled,
                  audioEnabled: newTrack.kind === 'audio' ? newTrack.enabled : p.audioEnabled,
                  isScreenSharing: newTrack.kind === 'video' && isScreenShare,
                }
              : p
          )
        );
      }
      
      if (socketRef.current) {
        if (isScreenShare) {
            socketRef.current.emit('screen-share-start', { userId: socketRef.current.id });
        } else {
            socketRef.current.emit('screen-share-stop', { userId: socketRef.current.id });
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!user) {
      navigate('/home');
      return;
    }
    setMyColor(`hsl(${Math.random() * 360}, 80%, 60%)`);

    const initialize = async () => {
      try {
        setIsLoading(true);
        if (!roomId) {
          toast.error('Invalid meeting ID');
          navigate('/home');
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });

        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];
        
        // **FIX:** The first user to join is the host
        const isHost = true; 
        setParticipants([{ userId: 'local', username: `${user.username} (You)`, stream, isLocal: true, isHost, videoEnabled: true, audioEnabled: true, isScreenSharing: false, connectionQuality: 'good' }]);
        setHostId('local');

        const socket = io(SERVER_URL, { auth: { token: user.token }, transports: ['websocket'] });
        socketRef.current = socket;
        setupSocketListeners(socket);

        socket.emit('join-room', { roomId, isHost }, async (otherUsers) => {
          for (const otherUser of otherUsers) {
            setParticipants((prev) => {
              if (prev.some((p) => p.userId === otherUser.userId)) return prev;
              return [...prev, { ...otherUser, stream: null, isLocal: false, isHost: false, connectionQuality: 'good' }];
            });
            const pc = await createPeerConnection(otherUser.userId);
            if (localStreamRef.current) localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { to: otherUser.userId, offer: pc.localDescription, isHost: false });
          }
        });
        
        setIsLoading(false);
      } catch (error) {
        console.error('Initialization error:', error);
        toast.error('Failed to initialize meeting. Please check camera/microphone permissions.');
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
      if (recorderRef.current) recorderRef.current.stop();
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
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
      setParticipants((prev) => prev.map((p) => (p.isLocal ? { ...p, videoEnabled: videoTrack.enabled } : p)));
    }
  };

  const handleScreenShare = async () => {
    if (isSharingScreen) {
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      if (localCameraTrackRef.current) {
        await replaceTrack(localCameraTrackRef.current, false);
        setIsSharingScreen(false);
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        await replaceTrack(screenTrack, true);
        setIsSharingScreen(true);
        
        screenTrack.onended = () => {
          if (localCameraTrackRef.current) {
            replaceTrack(localCameraTrackRef.current, false).then(() => {
              setIsSharingScreen(false);
            });
          }
        };
      } catch (err) {
        console.error('Screen sharing error:', err);
        toast.error('Screen sharing failed.');
      }
    }
  };
  
  // **FIX:** Allow pinning any participant, not just screen sharers
  const handlePin = (userId) => {
    if (pinnedParticipantId === userId) {
        handleUnpin();
    } else {
        setPinnedParticipantId(userId);
        socketRef.current.emit('pin-participant', { userId });
    }
  };

  const handleUnpin = () => {
    setPinnedParticipantId(null);
    socketRef.current.emit('unpin-participant');
  };

  const handleSwipe = (direction) => {
    setCurrentOffset((prev) => Math.max(0, Math.min(prev + direction, totalPages - 1)));
  };

  // ... (other handlers like createBreakoutRoom, createPoll, startRecording remain the same) ...
  const createBreakoutRoom = () => {
    const breakoutRoomId = `breakout-${Date.now()}`;
    const participantsInRoom = participants.filter((p) => !p.isLocal && Math.random() > 0.5); // Random assignment
    socketRef.current.emit('create-breakout-room', { roomId: breakoutRoomId, participants: participantsInRoom.map((p) => p.userId) });
    setBreakoutRooms((prev) => [...prev, { roomId: breakoutRoomId, participants: participantsInRoom }]);
  };
 
  const createPoll = (question, options) => {
    const poll = { id: Date.now(), question, options: options.map((opt, index) => ({ text: opt, votes: 0, index })), totalVotes: 0 };
    socketRef.current.emit('create-poll', poll);
    setActivePoll(poll);
  };
 
  const votePoll = (optionIndex) => {
    socketRef.current.emit('vote-poll', { pollId: activePoll.id, optionIndex });
  };
 
  const startRecording = () => {
    if (!recorderRef.current && localStreamRef.current) {
      const recorder = new MediaRecorder(localStreamRef.current);
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording-${roomId}-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };
      recorder.start();
      recorderRef.current = recorder;
      socketRef.current.emit('recording-started');
      setIsRecording(true);
    }
  };
 
  const stopRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
      socketRef.current.emit('recording-stopped');
      setIsRecording(false);
    }
  };
  // Canvas and annotation handlers remain unchanged
  const resizeCanvas = () => {
    const canvas = annotationCanvasRef.current;
    if (canvas && videoContainerRef.current) {
      const { width, height } = videoContainerRef.current.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
    }
  };
  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);
  const handleMouseDown = (e) => {
    if (!isAnnotationActive) return;
    const canvas = annotationCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    drawingStateRef.current = { isDrawing: true, startX: x, startY: y };
    socketRef.current.emit('drawing-start', { x, y, color: myColor, size: currentBrushSize, tool: currentTool });
    ctx.beginPath();
    ctx.moveTo(x * canvas.width, y * canvas.height);
  };
  const handleMouseMove = (e) => {
    if (!isAnnotationActive || !drawingStateRef.current.isDrawing) return;
    const canvas = annotationCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    ctx.lineWidth = currentBrushSize;
    ctx.strokeStyle = myColor;
    ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.lineCap = 'round';
    ctx.lineTo(x * canvas.width, y * canvas.height);
    ctx.stroke();
    socketRef.current.emit('drawing-move', { x, y });
  };
  const handleMouseUp = () => {
    if (!isAnnotationActive || !drawingStateRef.current.isDrawing) return;
    drawingStateRef.current = { isDrawing: false, startX: 0, startY: 0 };
    socketRef.current.emit('drawing-end');
  };

  if (isLoading) return <div className="h-screen bg-black flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden text-white">
      <div className="bg-gray-900 p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Meeting: {roomId}</h1>
        <div className="flex items-center gap-4">
          <span>Participants: {participants.length}</span>
          <select value={gridSize} onChange={(e) => { setGridSize(Number(e.target.value)); setCurrentOffset(0); }} className="bg-gray-800 text-white p-2 rounded">
            <option value={4}>4 Frames</option>
            <option value={6}>6 Frames</option>
            <option value={9}>9 Frames</option>
          </select>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col relative p-4" ref={videoContainerRef}>
          {/* **FIX:** New layout logic */}
          {pinnedParticipant ? (
            <div className="flex-1 flex flex-col h-full">
              {/* Main Pinned View */}
              <div className="flex-1 w-full h-full relative">
                <VideoPlayer
                  key={pinnedParticipant.userId}
                  participant={pinnedParticipant}
                  isPinned={true}
                  onPin={() => handlePin(pinnedParticipant.userId)}
                  isLocal={pinnedParticipant.isLocal}
                  isHost={hostId === pinnedParticipant.userId}
                />
              </div>
              {/* Swipeable Thumbnails */}
              {otherParticipants.length > 0 && (
                <div className="w-full h-32 mt-4">
                   <div className="flex overflow-x-auto gap-4 p-2 h-full">
                    {visibleParticipants.map((p) => (
                      <div key={p.userId} className="w-1/4 h-full flex-shrink-0">
                        <VideoPlayer
                          participant={p}
                          isPinned={false}
                          onPin={() => handlePin(p.userId)}
                          isLocal={p.isLocal}
                          isHost={hostId === p.userId}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
             // Default Grid View
            <div className={`grid gap-4 w-full h-full grid-cols-2 grid-rows-2`}>
              {visibleParticipants.map((p) => (
                <div key={p.userId} className="w-full h-full">
                   <VideoPlayer
                    participant={p}
                    isPinned={false}
                    onPin={() => handlePin(p.userId)}
                    isLocal={p.isLocal}
                    isHost={hostId === p.userId}
                  />
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} onClick={() => setCurrentOffset(i)} className={`w-3 h-3 rounded-full ${currentOffset === i ? 'bg-white' : 'bg-gray-500'}`} />
              ))}
            </div>
          )}
          {isRecording && <RecordingIndicator />}
        </div>

        <div className={`bg-gray-900 border-l border-gray-700 transition-all duration-300 ${isChatOpen || isParticipantsOpen || isBreakoutOpen || isPollOpen || isSettingsOpen ? 'w-80' : 'w-0'} overflow-hidden`}>
            {isChatOpen && <Chat messages={messages} onSendMessage={(message) => { const payload = { message, username: user.username, timestamp: new Date().toISOString() }; socketRef.current.emit('send-chat-message', payload); setMessages((prev) => [...prev, payload]); }} currentUser={user} onClose={() => setIsChatOpen(false)} />}
            {isParticipantsOpen && <Participants participants={memoizedParticipants} pendingRequests={pendingRequests} currentUser={user} onClose={() => setIsParticipantsOpen(false)} roomId={roomId} hostId={hostId} onApprove={(userId) => socketRef.current.emit('approve-join', { userId })} onReject={(userId) => socketRef.current.emit('reject-join', { userId })} />}
            {isBreakoutOpen && <BreakoutRoomPanel rooms={breakoutRooms} onClose={() => setIsBreakoutOpen(false)} onCreate={createBreakoutRoom} />}
            {isPollOpen && <PollPanel poll={activePoll} results={pollResults} onVote={votePoll} onClose={() => setIsPollOpen(false)} onCreate={createPoll} />}
            {isSettingsOpen && <SettingsPanel videoQuality={videoQuality} setVideoQuality={setVideoQuality} onClose={() => setIsSettingsOpen(false)} />}
        </div>
      </div>

      <div className="bg-gray-900 border-t border-gray-700 p-4 flex justify-center gap-4">
        <button onClick={toggleAudio} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">{isAudioMuted ? 'Unmute 🎤' : 'Mute 🔇'}</button>
        <button onClick={toggleVideo} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">{isVideoEnabled ? 'Stop Video 📷' : 'Start Video 📹'}</button>
        <button onClick={handleScreenShare} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">{isSharingScreen ? 'Stop Sharing' : 'Share Screen 🖥️'}</button>
        <button onClick={() => { setIsChatOpen((o) => !o); setIsParticipantsOpen(false); }} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">Chat 💬</button>
        <button onClick={() => { setIsParticipantsOpen((o) => !o); setIsChatOpen(false); }} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">Participants 👥</button>
        {participants.find((p) => p.isLocal && p.isHost) && (
          <>
            <button onClick={isRecording ? stopRecording : startRecording} className={`p-2 rounded text-white ${isRecording ? 'bg-red-800' : 'bg-red-600 hover:bg-red-500'}`}>{isRecording ? 'Stop Recording' : 'Record'}</button>
          </>
        )}
        <button onClick={() => navigate('/home')} className="p-2 rounded text-white bg-red-600 hover:bg-red-500">Exit 📞</button>
      </div>
    </div>
  );
};

export default Meeting;