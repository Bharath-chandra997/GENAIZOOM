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
      socket.on('user-joined', ({ userId, username }) => {
        setParticipants((prev) => {
          if (prev.some((p) => p.userId === userId)) return prev;
          return [
            ...prev,
            {
              userId,
              username,
              stream: null,
              isLocal: false,
              videoEnabled: false,
              audioEnabled: false,
              isScreenSharing: false,
              connectionQuality: 'good',
            },
          ];
        });
      });

      socket.on('offer', async ({ from, offer, username }) => {
        setParticipants((prev) => {
          if (prev.some((p) => p.userId === from)) return prev;
          return [
            ...prev,
            {
              userId: from,
              username,
              stream: null,
              isLocal: false,
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
      });

      socket.on('chat-message', (payload) => setMessages((prev) => [...prev, payload]));
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
    [createPeerConnection]
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

        setParticipants([
          {
            userId: 'local',
            username: `${user.username} (You)`,
            stream,
            isLocal: true,
            videoEnabled: stream.getVideoTracks()[0]?.enabled ?? false,
            audioEnabled: stream.getAudioTracks()[0]?.enabled ?? false,
            isScreenSharing: false,
            connectionQuality: 'good',
          },
        ]);

        const socket = io(SERVER_URL, {
          auth: { token: user.token },
          transports: ['websocket'], // Force WebSocket to avoid polling issues
        });
        socketRef.current = socket;
        setupSocketListeners(socket);

        socket.emit('join-room', { roomId }, async (otherUsers) => {
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

  // Annotation handlers remain unchanged for brevity

  if (isLoading) return <div className="h-screen bg-gray-900 flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  return (
    <div className="h-screen bg-gray-900 flex flex-col overflow-hidden">
      <div className="bg-gray-800 text-white p-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Meeting: {roomId}</h1>
        <span>Participants: {participants.length}</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative p-2" ref={videoContainerRef}>
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
          />
          <div className="w-full h-full grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))` }}>
            {memoizedParticipants.map((p) => (
              <VideoPlayer key={p.userId} participant={p} isLocal={p.isLocal} />
            ))}
          </div>
        </div>

        <div
          className={`bg-gray-800 border-l border-gray-700 transition-all duration-300 ${
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

      <div className="bg-gray-800 border-t border-gray-700 p-4 flex justify-center gap-4">
        <button onClick={toggleAudio} className="p-2 rounded text-white bg-gray-600">
          {isAudioMuted ? 'Unmute 🎤' : 'Mute 🔇'}
        </button>
        <button onClick={toggleVideo} className="p-2 rounded text-white bg-gray-600">
          {isVideoEnabled ? 'Stop Video 📷' : 'Start Video 📹'}
        </button>
        <button onClick={handleScreenShare} className="p-2 rounded text-white bg-gray-600">
          {isSharingScreen ? 'Stop Sharing' : 'Share Screen 🖥️'}
        </button>
        <button
          onClick={() => {
            setIsChatOpen((o) => !o);
            setIsParticipantsOpen(false);
          }}
          className="p-2 rounded text-white bg-gray-600"
        >
          Chat 💬
        </button>
        <button
          onClick={() => {
            setIsParticipantsOpen((o) => !o);
            setIsChatOpen(false);
          }}
          className="p-2 rounded text-white bg-gray-600"
        >
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