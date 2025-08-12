import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import io from 'socket.io-client';
import axios from 'axios';
import debounce from 'lodash/debounce';

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
  const localCameraVideoRef = useRef(null);
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
      toast.error('Unable to fetch ICE servers. Using fallback servers.');
      return [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
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
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayprojectsecret',
        },
      ];
    }
  }, []);

  const createPeerConnection = useCallback(
    async (remoteSocketId, username) => {
      if (!localStreamRef.current) {
        console.warn('No local stream available for peer connection');
        return null;
      }
      const iceServers = await getIceServers();
      if (iceServers.length === 0) {
        console.error(`No ICE servers available for peer ${remoteSocketId}`);
        toast.error(`Cannot connect to ${remoteSocketId} without ICE servers.`);
        return null;
      }
      const pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: 'all' });

      localStreamRef.current.getTracks().forEach((track) => {
        console.log(`Adding track to peer connection for ${remoteSocketId}:`, {
          kind: track.kind,
          id: track.id,
          enabled: track.enabled,
          readyState: track.readyState,
        });
        pc.addTrack(track, localStreamRef.current);
      });

      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socketRef.current.emit('offer', {
            to: remoteSocketId,
            offer: pc.localDescription,
            username: user.username,
          });
          pc.getSenders().forEach((sender) => {
            if (sender.track && sender.track.kind === 'video') {
              try {
                const params = sender.getParameters();
                params.encodings = params.encodings || [{}];
                params.encodings[0].maxBitrate = 800000;
                sender.setParameters(params);
              } catch (err) {
                console.error(`Failed to set parameters for sender:`, err);
              }
            }
          });
        } catch (err) {
          console.error(`Negotiation error for ${remoteSocketId}:`, err);
        }
      };

      pc.ontrack = (event) => {
        console.log(`Received remote stream for ${remoteSocketId}:`, event.streams[0], {
          videoTracks: event.streams[0].getVideoTracks().map((t) => ({
            id: t.id,
            enabled: t.enabled,
            readyState: t.readyState,
          })),
          audioTracks: event.streams[0].getAudioTracks().map((t) => ({
            id: t.id,
            enabled: t.enabled,
            readyState: t.readyState,
          })),
        });
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
          console.log(
            `ICE candidate for ${remoteSocketId}: type=${event.candidate.type}, protocol=${event.candidate.protocol}`
          );
          socketRef.current.emit('ice-candidate', { to: remoteSocketId, candidate: event.candidate });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`ICE connection state for ${remoteSocketId}: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'failed') {
          console.warn(`ICE failed for ${remoteSocketId}, restarting ICE`);
          pc.restartIce();
        } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
          setParticipants((prev) => prev.filter((p) => p.userId !== remoteSocketId));
          peerConnections.current.delete(remoteSocketId);
        }
      };

      const monitorConnection = async () => {
        try {
          const stats = await pc.getStats();
          stats.forEach((report) => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              console.log(`Network stats for ${remoteSocketId}:`, {
                roundTripTime: report.currentRoundTripTime,
                availableOutgoingBitrate: report.availableOutgoingBitrate,
              });
              setParticipants((prev) =>
                prev.map((p) =>
                  p.userId === remoteSocketId
                    ? {
                        ...p,
                        connectionQuality: report.currentRoundTripTime > 0.3 ? 'poor' : 'good',
                      }
                    : p
                )
              );
            }
          });
        } catch (err) {
          console.error(`Failed to get stats for ${remoteSocketId}:`, err);
        }
      };
      setInterval(monitorConnection, 5000);

      peerConnections.current.set(remoteSocketId, pc);
      return pc;
    },
    [getIceServers, user]
  );

  const setupSocketListeners = useCallback(
    (socket) => {
      socket.on('user-joined', ({ userId, username }) => {
        console.log(`User joined: ${userId} (${username})`);
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
        createPeerConnection(userId, username);
      });

      socket.on('offer', async ({ from, offer, username }) => {
        console.log(`Received offer from ${from} (${username})`);
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
        const pc = await createPeerConnection(from, username);
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('answer', { to: from, answer: pc.localDescription });
        } catch (err) {
          console.error(`Failed to handle offer from ${from}:`, err);
        }
      });

      socket.on('answer', async ({ from, answer }) => {
        const pc = peerConnections.current.get(from);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          } catch (err) {
            console.error(`Failed to set remote description for ${from}:`, err);
          }
        }
      });

      socket.on('ice-candidate', async ({ from, candidate }) => {
        const pc = peerConnections.current.get(from);
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error(`Failed to add ICE candidate for ${from}:`, err);
          }
        }
      });

      socket.on('user-left', (userId) => {
        console.log(`User left: ${userId}`);
        const pc = peerConnections.current.get(userId);
        if (pc) {
          pc.close();
          peerConnections.current.delete(userId);
        }
        setParticipants((prev) => prev.filter((p) => p.userId !== userId));
        toast.info(`User ${userId} left the meeting.`);
      });

      socket.on('chat-message', (payload) => {
        setMessages((prev) => [...prev, payload]);
      });

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
    [createPeerConnection, user]
  );

  const replaceTrack = useCallback(
    async (newTrack, isScreenShare = false, dontStopOld = false) => {
      console.log('Replacing track:', {
        kind: newTrack.kind,
        id: newTrack.id,
        enabled: newTrack.enabled,
        readyState: newTrack.readyState,
        isScreenShare,
      });
      for (const [remoteSocketId, pc] of peerConnections.current) {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === newTrack.kind);
        if (sender) {
          try {
            await sender.replaceTrack(newTrack);
          } catch (err) {
            console.error(`Failed to replace track for ${remoteSocketId}:`, err);
          }
        }
      }
      if (localStreamRef.current) {
        const oldTrack = localStreamRef.current.getTracks().find((t) => t.kind === newTrack.kind);
        if (oldTrack) {
          localStreamRef.current.removeTrack(oldTrack);
          if (!dontStopOld) oldTrack.stop();
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
        if (!roomId) {
          toast.error('Invalid meeting ID');
          navigate('/home');
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 360, ideal: 720, max: 1080 },
            frameRate: { min: 15, ideal: 24, max: 30 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 44100,
            channelCount: 1,
          },
        });
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

        const socket = io(SERVER_URL, {
          auth: { token: user.token },
          transports: ['websocket'],
          reconnectionAttempts: 5,
        });
        socketRef.current = socket;
        setupSocketListeners(socket);

        socket.on('connect', () => {
          console.log('Socket connected:', socket.id);
          socket.emit('join-room', { roomId }, (otherUsers) => {
            console.log('Joined room, other users:', otherUsers);
            otherUsers.forEach((otherUser) => {
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
              createPeerConnection(otherUser.userId, otherUser.username);
            });
          });
        });

        socket.on('connect_error', (err) => {
          console.error('Socket connection error:', err);
          toast.error('Failed to connect to server. Retrying...');
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

  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();

    const handleTrackChange = () => {
      console.log('Local track changed:', {
        videoEnabled: videoTracks[0]?.enabled,
        videoReadyState: videoTracks[0]?.readyState,
        audioEnabled: audioTracks[0]?.enabled,
        audioReadyState: audioTracks[0]?.readyState,
      });
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

  useEffect(() => {
    if (isSharingScreen && localCameraVideoRef.current && localCameraTrackRef.current) {
      localCameraVideoRef.current.srcObject = new MediaStream([localCameraTrackRef.current]);
      localCameraVideoRef.current.play().catch((err) => console.error('Failed to play local camera preview:', err));
    } else if (!isSharingScreen && localCameraVideoRef.current) {
      localCameraVideoRef.current.srcObject = null;
    }
  }, [isSharingScreen]);

  const toggleAudio = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioMuted(!audioTrack.enabled);
      setParticipants((prev) =>
        prev.map((p) => (p.isLocal ? { ...p, audioEnabled: audioTrack.enabled } : p))
      );
      console.log('Toggled audio:', { enabled: audioTrack.enabled });
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
      console.log('Toggled video:', { enabled: videoTrack.enabled });
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
            frameRate: { min: 10, ideal: 15, max: 20 },
            width: { max: 1280 },
            height: { max: 720 },
          },
          audio: true, // Enable audio sharing if available
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        await replaceTrack(screenTrack, true, true);
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

  const debouncedDrawingMove = useCallback(
    debounce((data) => {
      socketRef.current.emit('drawing-move', data);
    }, 50),
    []
  );

  useEffect(() => {
    const canvas = annotationCanvasRef.current;
    if (!canvas || !isAnnotationActive) return;

    const ctx = canvas.getContext('2d');
    let previewImage = null;

    const resizeCanvas = () => {
      if (videoContainerRef.current) {
        canvas.width = videoContainerRef.current.clientWidth;
        canvas.height = videoContainerRef.current.clientHeight;
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const getCoords = (e) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const startDrawing = (e) => {
      drawingStateRef.current.isDrawing = true;
      const { x, y } = getCoords(e);
      drawingStateRef.current.startX = x;
      drawingStateRef.current.startY = y;
      previewImage = null;
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
      if (!drawingStateRef.current.isDrawing) return;
      const { x, y } = getCoords(e);
      if (currentTool === 'pen' || currentTool === 'eraser') {
        ctx.lineWidth = currentBrushSize;
        ctx.strokeStyle = myColor;
        ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.lineCap = 'round';
        ctx.lineTo(x, y);
        ctx.stroke();
        const relX = x / canvas.width;
        const relY = y / canvas.height;
        debouncedDrawingMove({ x: relX, y: relY });
      } else {
        if (previewImage) {
          ctx.putImageData(previewImage, 0, 0);
        } else {
          previewImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
        const localShapeData = {
          tool: currentTool,
          color: myColor,
          size: currentBrushSize,
          startX: drawingStateRef.current.startX,
          startY: drawingStateRef.current.startY,
          endX: x,
          endY: y,
        };
        drawShape(localShapeData, ctx);
      }
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
        socketRef.current.emit('draw-shape', shapeData);
        previewImage = null;
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
  }, [isAnnotationActive, myColor, currentBrushSize, currentTool, debouncedDrawingMove]);

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
                <VideoPlayer participant={p} isLocal={p.isLocal} localCameraVideoRef={localCameraVideoRef} />
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