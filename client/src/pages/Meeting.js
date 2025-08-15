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

  // Memoize participants
  const memoizedParticipants = useMemo(() => participants, [participants]);

  // Paginated participants with swipe logic
  const totalPages = Math.ceil(memoizedParticipants.length / gridSize);
  const visibleParticipants = useMemo(() => {
    const start = currentOffset * gridSize;
    const end = start + gridSize;
    return memoizedParticipants.slice(start, end);
  }, [memoizedParticipants, currentOffset, gridSize]);

  const getIceServers = useCallback(async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/ice-servers`);
      console.log('ICE servers:', response.data);
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
        console.log(`Received remote stream for ${remoteSocketId}:`, event.streams[0]);
        setParticipants((prev) =>
          prev.map((p) =>
            p.userId === remoteSocketId
              ? {
                  ...p,
                  stream: event.streams[0],
                  videoEnabled: event.streams[0].getVideoTracks()[0]?.enabled ?? false,
                  audioEnabled: event.streams[0].getAudioTracks()[0]?.enabled ?? false,
                }
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
        console.log(`ICE state for ${remoteSocketId}: ${pc.iceConnectionState}`);
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
            {
              userId,
              username,
              stream: null,
              isLocal: false,
              isHost,
              videoEnabled: false,
              audioEnabled: false,
              isScreenSharing: false,
              connectionQuality: 'good',
            },
          ];
          // Reset offset to show new user in center
          if (prev.length === 1) setCurrentOffset(0);
          return updatedParticipants;
        });
      });

      socket.on('offer', async ({ from, offer, username, isHost }) => {
        setParticipants((prev) => {
          if (prev.some((p) => p.userId === from)) return prev;
          return [
            ...prev,
            {
              userId: from,
              username,
              stream: null,
              isLocal: false,
              isHost,
              videoEnabled: false,
              audioEnabled: false,
              isScreenSharing: false,
              connectionQuality: 'good',
            },
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
          pc.setRemoteDescription(new RTCSessionDescription(answer)).catch((err) =>
            console.error(`Failed to set remote description: ${err}`)
          );
        }
      });

      socket.on('ice-candidate', ({ from, candidate }) => {
        const pc = peerConnections.current.get(from);
        if (pc) {
          pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) =>
            console.error(`Failed to add ICE candidate: ${err}`)
          );
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

      socket.on('pin-participant', ({ userId }) => {
        setPinnedParticipantId(userId);
      });

      socket.on('unpin-participant', () => {
        setPinnedParticipantId(null);
      });

      socket.on('screen-share-start', ({ userId }) => {
        setParticipants((prev) =>
          prev.map((p) => (p.userId === userId ? { ...p, isScreenSharing: true } : p))
        );
      });

      socket.on('screen-share-stop', ({ userId }) => {
        setParticipants((prev) =>
          prev.map((p) => (p.userId === userId ? { ...p, isScreenSharing: false, stream: prev.find((p) => p.userId === userId)?.stream } : p))
        );
        if (pinnedParticipantId === userId) {
          setPinnedParticipantId(null);
        }
      });

      socket.on('drawing-start', ({ from, x, y, color, size, tool }) => {
        remoteDrawingStates.current.set(from, { color, size, tool });
        const canvas = annotationCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && canvas) {
          ctx.beginPath();
          ctx.moveTo(x * canvas.width, y * canvas.height);
        }
      });

      socket.on('drawing-move', ({ from, x, y }) => {
        const state = remoteDrawingStates.current.get(from);
        const canvas = annotationCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!state || !ctx || !canvas) return;
        ctx.lineWidth = state.size;
        ctx.strokeStyle = state.color;
        ctx.globalCompositeOperation = state.tool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.lineCap = 'round';
        ctx.lineTo(x * canvas.width, y * canvas.height);
        ctx.stroke();
      });

      socket.on('drawing-end', ({ from }) => {
        remoteDrawingStates.current.delete(from);
      });

      socket.on('draw-shape', (data) => {
        const canvas = annotationCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && canvas) {
          const absStartX = data.startX * canvas.width;
          const absStartY = data.startY * canvas.height;
          const absEndX = data.endX * canvas.width;
          const absEndY = data.endY * canvas.height;
          const absWidth = absEndX - absStartX;
          const absHeight = absEndY - absStartY;
          ctx.lineWidth = data.size;
          ctx.strokeStyle = data.color;
          ctx.globalCompositeOperation = 'source-over';
          ctx.beginPath();
          switch (data.tool) {
            case 'rectangle':
              ctx.rect(absStartX, absStartY, absWidth, absHeight);
              break;
            case 'circle':
              const radius = Math.sqrt(absWidth ** 2 + absHeight ** 2);
              if (radius > 0) {
                ctx.arc(absStartX, absStartY, radius, 0, 2 * Math.PI);
              }
              break;
            default:
              break;
          }
          ctx.stroke();
        }
      });

      socket.on('clear-canvas', () => {
        const canvas = annotationCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      });
    },
    [createPeerConnection, pinnedParticipantId]
  );

  const replaceTrack = useCallback(
    async (newTrack, isScreenShare = false) => {
      for (const pc of peerConnections.current.values()) {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === newTrack.kind);
        if (sender) {
          await sender.replaceTrack(newTrack).catch((err) => console.error('Failed to replace track:', err));
        }
      }
      if (localStreamRef.current) {
        const oldTrack = localStreamRef.current.getTracks().find((t) => t.kind === newTrack.kind);
        if (oldTrack) {
          localStreamRef.current.removeTrack(oldTrack);
          oldTrack.stop();
        }
        localStreamRef.current.addTrack(newTrack);
        setParticipants((prev) =>
          prev.map((p) =>
            p.isLocal
              ? {
                  ...p,
                  stream: localStreamRef.current,
                  videoEnabled: newTrack.kind === 'video' ? newTrack.enabled : p.videoEnabled,
                  audioEnabled: newTrack.kind === 'audio' ? newTrack.enabled : p.audioEnabled,
                  isScreenSharing: newTrack.kind === 'video' && isScreenShare,
                }
              : p
          )
        );
      }
      if (isScreenShare) {
        socketRef.current.emit('screen-share-start', { userId: 'local' });
      } else {
        socketRef.current.emit('screen-share-stop', { userId: 'local' });
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

    const checkPermissions = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach((track) => track.stop());
        return true;
      } catch (err) {
        console.error('Permission check failed:', err);
        toast.error('Please allow camera and microphone access.');
        return false;
      }
    };

    const initialize = async () => {
      try {
        setIsLoading(true);
        if (!roomId) {
          toast.error('Invalid meeting ID');
          navigate('/home');
          return;
        }

        const hasPermissions = await checkPermissions();
        if (!hasPermissions) {
          navigate('/home');
          return;
        }

        let stream;
        const maxRetries = 3;
        let attempt = 0;
        while (!stream && attempt < maxRetries) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
              },
              audio: true,
            });
            if (stream.getVideoTracks().length > 0) {
              stream.getVideoTracks()[0].onmute = () => console.log('Video track muted');
              stream.getVideoTracks()[0].onunmute = () => console.log('Video track unmuted');
            }
          } catch (err) {
            console.error(`getUserMedia attempt ${attempt + 1} failed:`, err);
            attempt++;
            if (attempt < maxRetries) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        }

        if (!stream) {
          throw new Error('Failed to access media devices');
        }

        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];
        console.log('Local stream initialized:', {
          videoTracks: stream.getVideoTracks().map((t) => ({
            id: t.id,
            enabled: t.enabled,
            readyState: t.readyState,
          })),
          audioTracks: stream.getAudioTracks().map((t) => ({
            id: t.id,
            enabled: t.enabled,
            readyState: t.readyState,
          })),
        });

        const isHost = true; // Adjust based on your logic
        setParticipants([
          {
            userId: 'local',
            username: `${user.username} (You)`,
            stream,
            isLocal: true,
            isHost,
            videoEnabled: true,
            audioEnabled: true,
            isScreenSharing: false,
            connectionQuality: 'good',
          },
        ]);

        const socket = io(SERVER_URL, {
          auth: { token: user.token },
          transports: ['websocket'],
        });
        socketRef.current = socket;
        setupSocketListeners(socket);

        socket.emit('join-room', { roomId, isHost }, async (otherUsers) => {
          console.log('Joined room, other users:', otherUsers);
          for (const otherUser of otherUsers) {
            setParticipants((prev) => {
              if (prev.some((p) => p.userId === otherUser.userId)) return prev;
              return [
                ...prev,
                {
                  userId: otherUser.userId,
                  username: otherUser.username,
                  stream: null,
                  isLocal: false,
                  isHost: otherUser.isHost || false,
                  videoEnabled: false,
                  audioEnabled: false,
                  isScreenSharing: false,
                  connectionQuality: 'good',
                },
              ];
            });
            const pc = await createPeerConnection(otherUser.userId);
            if (!pc || !localStreamRef.current) continue;
            localStreamRef.current.getTracks().forEach((track) => {
              pc.addTrack(track, localStreamRef.current);
            });
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketRef.current.emit('offer', { to: otherUser.userId, offer: pc.localDescription, isHost });
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
      setParticipants((prev) =>
        prev.map((p) => (p.isLocal ? { ...p, audioEnabled: audioTrack.enabled } : p))
      );
    }
  };

  const toggleVideo = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
      setParticipants((prev) =>
        prev.map((p) => (p.isLocal ? { ...p, videoEnabled: videoTrack.enabled } : p))
      );
    }
  };

  const handleScreenShare = async () => {
    if (isSharingScreen) {
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      if (localCameraTrackRef.current) {
        await replaceTrack(localCameraTrackRef.current, false);
        setIsSharingScreen(false);
        setParticipants((prev) =>
          prev.map((p) => (p.isLocal ? { ...p, isScreenSharing: false } : p))
        );
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        await replaceTrack(screenTrack, true);
        setIsSharingScreen(true);
        setParticipants((prev) =>
          prev.map((p) => (p.isLocal ? { ...p, isScreenSharing: true } : p))
        );
        screenTrack.onended = async () => {
          if (localCameraTrackRef.current) {
            await replaceTrack(localCameraTrackRef.current, false);
            setIsSharingScreen(false);
            setParticipants((prev) =>
              prev.map((p) => (p.isLocal ? { ...p, isScreenSharing: false } : p))
            );
          }
        };
      } catch (err) {
        console.error('Screen sharing error:', err);
        toast.error('Screen sharing failed.');
      }
    }
  };

  const handlePin = (userId) => {
    const participant = participants.find((p) => p.userId === userId);
    if (participant && participant.isScreenSharing) {
      setPinnedParticipantId(userId);
      socketRef.current.emit('pin-participant', { userId });
    } else {
      toast.error('Can only pin a participant who is screen sharing.');
    }
  };

  const handleUnpin = () => {
    setPinnedParticipantId(null);
    socketRef.current.emit('unpin-participant');
  };

  const handleSwipe = (direction) => {
    setCurrentOffset((prev) => {
      const newOffset = prev + direction;
      return Math.max(0, Math.min(newOffset, totalPages - 1));
    });
  };

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
    socketRef.current.emit('drawing-start', {
      x,
      y,
      color: myColor,
      size: currentBrushSize,
      tool: currentTool,
    });
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
    const canvas = annotationCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    if (['rectangle', 'circle'].includes(currentTool)) {
      const { startX, startY } = drawingStateRef.current;
      const rect = canvas.getBoundingClientRect();
      const endX = drawingStateRef.current.endX || startX;
      const endY = drawingStateRef.current.endY || startY;
      const absStartX = startX * rect.width;
      const absStartY = startY * rect.height;
      const absEndX = endX * rect.width;
      const absEndY = endY * rect.height;
      const absWidth = absEndX - absStartX;
      const absHeight = absEndY - absStartY;
      ctx.lineWidth = currentBrushSize;
      ctx.strokeStyle = myColor;
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      if (currentTool === 'rectangle') {
        ctx.rect(absStartX, absStartY, absWidth, absHeight);
      } else if (currentTool === 'circle') {
        const radius = Math.sqrt(absWidth ** 2 + absHeight ** 2);
        if (radius > 0) {
          ctx.arc(absStartX, absStartY, radius, 0, 2 * Math.PI);
        }
      }
      ctx.stroke();
      socketRef.current.emit('draw-shape', {
        startX,
        startY,
        endX: endX,
        endY: endY,
        color: myColor,
        size: currentBrushSize,
        tool: currentTool,
      });
    }
    drawingStateRef.current = { isDrawing: false, startX: 0, startY: 0 };
    socketRef.current.emit('drawing-end');
  };

  const handleMouseMoveForShapes = (e) => {
    if (!isAnnotationActive || !drawingStateRef.current.isDrawing || !['rectangle', 'circle'].includes(currentTool)) return;
    const canvas = annotationCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    drawingStateRef.current.endX = x;
    drawingStateRef.current.endY = y;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const absStartX = drawingStateRef.current.startX * canvas.width;
    const absStartY = drawingStateRef.current.startY * canvas.height;
    const absEndX = x * canvas.width;
    const absEndY = y * canvas.height;
    const absWidth = absEndX - absStartX;
    const absHeight = absEndY - absStartY;
    ctx.lineWidth = currentBrushSize;
    ctx.strokeStyle = myColor;
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    if (currentTool === 'rectangle') {
      ctx.rect(absStartX, absStartY, absWidth, absHeight);
    } else if (currentTool === 'circle') {
      const radius = Math.sqrt(absWidth ** 2 + absHeight ** 2);
      if (radius > 0) {
        ctx.arc(absStartX, absStartY, radius, 0, 2 * Math.PI);
      }
    }
    ctx.stroke();
  };

  if (isLoading) return <div className="h-screen bg-black flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden text-white">
      <div className="bg-gray-900 p-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Meeting: {roomId}</h1>
        <div className="flex items-center gap-4">
          <span>Participants: {participants.length}</span>
          <select
            value={gridSize}
            onChange={(e) => {
              setGridSize(Number(e.target.value));
              setCurrentOffset(0);
            }}
            className="bg-gray-800 text-white p-1 rounded"
          >
            <option value={4}>4 Frames</option>
            <option value={6}>6 Frames</option>
          </select>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 relative p-4" ref={videoContainerRef}>
          <AnnotationToolbar
            isAnnotationActive={isAnnotationActive}
            toggleAnnotations={() => setIsAnnotationActive((prev) => !prev)}
            currentTool={currentTool}
            setCurrentTool={setCurrentTool}
            currentBrushSize={currentBrushSize}
            setCurrentBrushSize={setCurrentBrushSize}
            clearCanvas={() => {
              const canvas = annotationCanvasRef.current;
              const ctx = canvas?.getContext('2d');
              if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
              socketRef.current.emit('clear-canvas');
            }}
          />
          <canvas
            ref={annotationCanvasRef}
            className="absolute top-0 left-0"
            style={{ pointerEvents: isAnnotationActive ? 'auto' : 'none', zIndex: 10, width: '100%', height: '100%' }}
            onMouseDown={handleMouseDown}
            onMouseMove={(e) => {
              handleMouseMove(e);
              handleMouseMoveForShapes(e);
            }}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          {pinnedParticipantId && participants.find((p) => p.userId === pinnedParticipantId && p.isScreenSharing) ? (
            <div className="h-full flex flex-col">
              <div className="flex-1">
                <VideoPlayer
                  key={pinnedParticipantId}
                  participant={participants.find((p) => p.userId === pinnedParticipantId)}
                  isPinned={true}
                  onPin={handleUnpin}
                  isLocal={participants.find((p) => p.userId === pinnedParticipantId).isLocal}
                  isHost={participants.find((p) => p.isLocal)?.isHost}
                />
              </div>
              <div className="flex overflow-x-auto gap-4 p-2">
                {visibleParticipants.map((p) => (
                  <div key={p.userId} className="w-1/4 h-32">
                    <VideoPlayer
                      participant={p}
                      isPinned={false}
                      onPin={() => handlePin(p.userId)}
                      isLocal={p.isLocal}
                      isHost={participants.find((p) => p.isLocal)?.isHost}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : participants.length === 1 ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-3/4 h-3/4">
                <VideoPlayer
                  key={participants[0].userId}
                  participant={participants[0]}
                  isPinned={false}
                  onPin={() => handlePin(participants[0].userId)}
                  isLocal={participants[0].isLocal}
                  isHost={participants.find((p) => p.isLocal)?.isHost}
                />
              </div>
            </div>
          ) : (
            <div
              className="h-full overflow-x-auto whitespace-nowrap"
              onWheel={(e) => {
                if (e.deltaY !== 0) {
                  e.preventDefault();
                  handleSwipe(e.deltaY > 0 ? 1 : -1);
                }
              }}
              style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}
            >
              {Array.from({ length: totalPages }, (_, i) => (
                <div
                  key={i}
                  className="inline-flex gap-4"
                  style={{ transform: `translateX(-${currentOffset * 100}%)`, transition: 'transform 0.3s ease' }}
                >
                  {memoizedParticipants.slice(i * gridSize, (i + 1) * gridSize).map((p) => (
                    <div key={p.userId} className="w-1/4 h-1/3 inline-block">
                      <VideoPlayer
                        participant={p}
                        isPinned={false}
                        onPin={() => handlePin(p.userId)}
                        isLocal={p.isLocal}
                        isHost={participants.find((p) => p.isLocal)?.isHost}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {totalPages > 1 && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentOffset(i)}
                  className={`w-3 h-3 rounded-full ${currentOffset === i ? 'bg-white' : 'bg-gray-500'}`}
                />
              ))}
            </div>
          )}
        </div>

        <div
          className={`bg-gray-900 border-l border-gray-700 transition-all duration-300 ${
            isChatOpen || isParticipantsOpen ? 'w-80' : 'w-0'
          } overflow-hidden`}
        >
          {isChatOpen && (
            <Chat
              messages={messages}
              onSendMessage={(message) => {
                const payload = { message, username: user.username, timestamp: new Date().toISOString() };
                socketRef.current.emit('send-chat-message', payload);
                setMessages((prev) => [...prev, payload]);
              }}
              currentUser={user}
              onClose={() => setIsChatOpen(false)}
            />
          )}
          {isParticipantsOpen && (
            <Participants
              participants={memoizedParticipants}
              pendingRequests={[]}
              currentUser={user}
              onClose={() => setIsParticipantsOpen(false)}
              roomId={roomId}
            />
          )}
        </div>
      </div>

      <div className="bg-gray-900 border-t border-gray-700 p-4 flex justify-center gap-4">
        <button onClick={toggleAudio} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">
          {isAudioMuted ? 'Unmute 🎤' : 'Mute 🔇'}
        </button>
        <button onClick={toggleVideo} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">
          {isVideoEnabled ? 'Stop Video 📷' : 'Start Video 📹'}
        </button>
        <button onClick={handleScreenShare} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">
          {isSharingScreen ? 'Stop Sharing' : 'Share Screen 🖥️'}
        </button>
        <button
          onClick={() => {
            setIsChatOpen((o) => !o);
            setIsParticipantsOpen(false);
          }}
          className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600"
        >
          Chat 💬
        </button>
        <button
          onClick={() => {
            setIsParticipantsOpen((o) => !o);
            setIsChatOpen(false);
          }}
          className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600"
        >
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