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

  // Memoize participants to stabilize references
  const memoizedParticipants = useMemo(() => participants, [participants]);

  // --- Core Logic ---
  const getIceServers = useCallback(async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/ice-servers`);
      console.log('ICE servers from Twilio:', response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to get ICE servers from Twilio:', error);
      toast.error('Unable to fetch ICE servers from Twilio. Using fallback servers.');
      return [
        { urls: 'stun:stun.l.google.com:19302' }
      ];
    }
  }, []);

  const createPeerConnection = useCallback(
    async (remoteSocketId) => {
      const iceServers = await getIceServers();
      if (iceServers.length === 0) {
        console.error(`No ICE servers available for peer ${remoteSocketId}`);
        toast.error(`Cannot connect to ${remoteSocketId} without ICE servers.`);
        return null;
      }
      const pc = new RTCPeerConnection({
        iceServers,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      });

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
                  isScreenSharing: p.isScreenSharing ?? false,
                }
              : p
          )
        );
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`ICE candidate for ${remoteSocketId}: type=${event.candidate.type}, protocol=${event.candidate.protocol}`);
          socketRef.current.emit('ice-candidate', { to: remoteSocketId, candidate: event.candidate });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`ICE connection state for ${remoteSocketId}: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          console.warn(`ICE connection issue for ${remoteSocketId}, restarting ICE`);
          pc.restartIce();
          toast.warn(`Connection issue with ${remoteSocketId}, attempting to reconnect...`);
        }
      };

      // Monitor connection quality
      const monitorConnection = async () => {
        const stats = await pc.getStats();
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            console.log(`Network stats for ${remoteSocketId}:`, {
              roundTripTime: report.currentRoundTripTime,
              availableOutgoingBitrate: report.availableOutgoingBitrate,
              packetsLost: report.packetsLost,
            });
            setParticipants((prev) =>
              prev.map((p) =>
                p.userId === remoteSocketId
                  ? {
                      ...p,
                      connectionQuality:
                        report.currentRoundTripTime > 0.3 || report.packetsLost > 0 ? 'poor' : 'good',
                    }
                  : p
              )
            );
          }
        });
      };
      setInterval(monitorConnection, 3000);

      peerConnections.current.set(remoteSocketId, pc);
      return pc;
    },
    [getIceServers]
  );

  const setupSocketListeners = useCallback(
    (socket) => {
      socket.on('user-joined', ({ userId, username }) => {
        toast.info(`${username} joined.`);
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
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => {
              pc.addTrack(track, localStreamRef.current);
            });
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('answer', { to: from, answer: pc.localDescription });
          // Set encoding parameters
          pc.getSenders().forEach((sender) => {
            if (sender.track && sender.track.kind === 'video') {
              try {
                const params = sender.getParameters();
                if (!params.encodings) params.encodings = [{}];
                params.encodings[0].maxBitrate = 2000000; // Increased to 2Mbps
                params.encodings[0].scaleResolutionDownBy = 1;
                params.encodings[0].maxFramerate = 30;
                sender.setParameters(params);
              } catch (err) {
                console.error(`Failed to set parameters for sender:`, err);
              }
            }
          });
        } catch (err) {
          console.error(`Error handling offer from ${from}:`, err);
        }
      });

      socket.on('answer', ({ from, answer }) => {
        const pc = peerConnections.current.get(from);
        if (pc) {
          pc.setRemoteDescription(new RTCSessionDescription(answer)).catch((err) =>
            console.error(`Failed to set remote description for ${from}:`, err)
          );
        }
      });

      socket.on('ice-candidate', ({ from, candidate }) => {
        const pc = peerConnections.current.get(from);
        if (pc) {
          pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) =>
            console.error(`Failed to add ICE candidate for ${from}:`, err)
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
        toast.info(`User ${userId} left the meeting.`);
      });

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
        // Validate roomId
        if (!roomId) {
          toast.error('Invalid meeting ID');
          navigate('/home');
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 60 },
            facingMode: 'user',
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 2,
          },
        });
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];
        setParticipants([
          {
            userId: 'local',
            username: `${user.username} (You)`,
            stream,
            isLocal: true,
            videoEnabled: true,
            audioEnabled: true,
            isScreenSharing: false,
            connectionQuality: 'good',
          },
        ]);

        const socket = io(SERVER_URL, { auth: { token: user.token } });
        socketRef.current = socket;
        setupSocketListeners(socket);

        socket.emit('join-room', { roomId }, (otherUsers) => {
          setTimeout(() => {
            otherUsers.forEach(async (otherUser) => {
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
              if (!pc || !localStreamRef.current) return;
              localStreamRef.current.getTracks().forEach((track) => {
                pc.addTrack(track, localStreamRef.current);
              });
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socketRef.current.emit('offer', { to: otherUser.userId, offer: pc.localDescription });
                // Set encoding parameters
                pc.getSenders().forEach((sender) => {
                  if (sender.track && sender.track.kind === 'video') {
                    try {
                      const params = sender.getParameters();
                      if (!params.encodings) params.encodings = [{}];
                      params.encodings[0].maxBitrate = 2000000;
                      params.encodings[0].scaleResolutionDownBy = 1;
                      params.encodings[0].maxFramerate = 30;
                      sender.setParameters(params);
                    } catch (err) {
                      console.error(`Failed to set parameters for sender:`, err);
                    }
                  }
                });
              } catch (err) {
                console.error(`Negotiation error for ${otherUser.userId}:`, err);
              }
            });
          }, 1000);
        });
        setIsLoading(false);
      } catch (error) {
        console.error('Initialization error:', error);
        toast.error('Could not access camera/microphone. Please grant permissions and try again.');
        navigate('/home');
      }
    };
    initialize();

    return () => {
      const connections = peerConnections.current;
      connections.forEach((pc) => pc.close());
      connections.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      socketRef.current?.disconnect();
    };
  }, [roomId, user, navigate, createPeerConnection, setupSocketListeners]);

  // Monitor local stream track changes
  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();

    const handleTrackChange = () => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.isLocal
            ? {
                ...p,
                videoEnabled: videoTracks[0]?.enabled ?? false,
                audioEnabled: audioTracks[0]?.enabled ?? false,
              }
            : p
        )
      );
      if (!audioTracks[0]?.enabled) {
        toast.warn('Microphone is muted or disconnected.');
      }
    };

    videoTracks.forEach((track) => {
      track.addEventListener('mute', handleTrackChange);
      track.addEventListener('unmute', handleTrackChange);
      track.addEventListener('ended', handleTrackChange);
    });
    audioTracks.forEach((track) => {
      track.addEventListener('mute', handleTrackChange);
      track.addEventListener('unmute', handleTrackChange);
      track.addEventListener('ended', handleTrackChange);
    });

    return () => {
      videoTracks.forEach((track) => {
        track.removeEventListener('mute', handleTrackChange);
        track.removeEventListener('unmute', handleTrackChange);
        track.removeEventListener('ended', handleTrackChange);
      });
      audioTracks.forEach((track) => {
        track.removeEventListener('mute', handleTrackChange);
        track.removeEventListener('unmute', handleTrackChange);
        track.removeEventListener('ended', handleTrackChange);
      });
    };
  }, []);

  // --- Media Control Handlers ---
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
          video: {
            cursor: 'always',
            frameRate: { ideal: 30, max: 60 },
            width: { ideal: 1920, max: 2560 },
            height: { ideal: 1080, max: 1440 },
          },
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
        toast.error('Screen sharing failed or was cancelled.');
      }
    }
  };

  // --- Annotation Handlers ---
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
        socketRef.current.emit('drawing-start', {
          x: relX,
          y: relY,
          color: myColor,
          size: currentBrushSize,
          tool: currentTool,
        });
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

      if (currentTool === 'pen' || currentTool === 'eraser') {
        ctx.closePath();
        socketRef.current.emit('drawing-end');
      } else {
        const { x: endX, y: endY } = getCoords(e);
        const relStartX = drawingStateRef.current.startX / canvas.width;
        const relStartY = drawingStateRef.current.startY / canvas.height;
        const relEndX = endX / canvas.width;
        const relEndY = endY / canvas.height;
        const shapeData = {
          tool: currentTool,
          color: myColor,
          size: currentBrushSize,
          startX: relStartX,
          startY: relStartY,
          endX: relEndX,
          endY: relEndY,
        };
        const localShapeData = {
          tool: currentTool,
          color: myColor,
          size: currentBrushSize,
          startX: drawingStateRef.current.startX,
          startY: drawingStateRef.current.startY,
          endX,
          endY,
        };
        drawShape(localShapeData, ctx);
        socketRef.current.emit('draw-shape', shapeData);
      }
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

  const drawShape = (data, ctx) => {
    ctx.lineWidth = data.size;
    ctx.strokeStyle = data.color;
    ctx.globalCompositeOperation = 'source-over';
    const width = data.endX - data.startX;
    const height = data.endY - data.startY;
    ctx.beginPath();
    switch (data.tool) {
      case 'rectangle':
        ctx.rect(data.startX, data.startY, width, height);
        break;
      case 'circle':
        const radius = Math.sqrt(width ** 2 + height ** 2);
        if (radius > 0) {
          ctx.arc(data.startX, data.startY, radius, 0, 2 * Math.PI);
        }
        break;
      default:
        break;
    }
    ctx.stroke();
  };

  const clearCanvas = () => {
    const canvas = annotationCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      socketRef.current.emit('clear-canvas');
    }
  };

  const sendMessage = (message) => {
    const payload = { message, username: user.username, timestamp: new Date().toISOString() };
    socketRef.current.emit('send-chat-message', payload);
    setMessages((prev) => [...prev, payload]);
  };

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
            clearCanvas={clearCanvas}
          />
          <canvas
            ref={annotationCanvasRef}
            className="absolute top-0 left-0"
            style={{ pointerEvents: isAnnotationActive ? 'auto' : 'none', zIndex: 10, width: '100%', height: '100%' }}
          />
          <div className="w-full h-full grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))` }}>
            {memoizedParticipants.map((p) => (
              <div key={p.userId} className="relative w-full h-full">
                {p.stream ? (
                  <VideoPlayer participant={p} isLocal={p.isLocal} />
                ) : (
                  <div className="w-full h-full bg-black flex items-center justify-center text-white">
                    {p.isLocal ? 'Your video loading...' : `Connecting to ${p.username}...`}
                  </div>
                )}
              </div>
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
              onSendMessage={sendMessage}
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