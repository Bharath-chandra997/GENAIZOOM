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
  const [pinnedParticipantId, setPinnedParticipantId] = useState(null);
  const [gridSize, setGridSize] = useState(6);
  const [currentOffset, setCurrentOffset] = useState(0);

  // Annotation & Toolbar State
  const [isAnnotationActive, setIsAnnotationActive] = useState(false);
  const [currentTool, setCurrentTool] = useState('pen');
  const [currentBrushSize, setCurrentBrushSize] = useState(5);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 20, y: 20 });
  
  // Refs
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const localCameraTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnections = useRef(new Map());
  const dragInfo = useRef({ isDragging: false, offsetX: 0, offsetY: 0 });
  const videoContainerRef = useRef(null);

  // Automatically set the main "pinned" view based on who is host or screen-sharing
  useEffect(() => {
    const screenSharer = participants.find(p => p.isScreenSharing);
    if (screenSharer) {
      setPinnedParticipantId(screenSharer.userId);
      return;
    }
    const host = participants.find(p => p.isHost);
    if (host) {
      setPinnedParticipantId(host.userId);
    } else if (participants.length > 0) {
      // Fallback to the first participant if no host
      if (!pinnedParticipantId || !participants.find(p => p.userId === pinnedParticipantId)) {
         setPinnedParticipantId(participants[0].userId);
      }
    } else {
      setPinnedParticipantId(null);
    }
  }, [participants, pinnedParticipantId]);

  const smallParticipants = useMemo(() =>
    pinnedParticipantId ? participants.filter(p => p.userId !== pinnedParticipantId) : [],
    [pinnedParticipantId, participants]
  );
  const totalSmallPages = Math.ceil(smallParticipants.length / gridSize);
  const totalGridPages = Math.ceil(participants.length / (gridSize * 2)); // Grid view can hold more
  const gridLayoutClass = gridSize * 2 === 12 ? 'grid-cols-6 grid-rows-2' : 'grid-cols-4 grid-rows-2';


  const getIceServers = useCallback(async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/ice-servers`);
      return response.data;
    } catch (error) {
      return [{ urls: 'stun:stun.l.google.com:19302' }];
    }
  }, []);

  const createPeerConnection = useCallback(
    async (remoteSocketId) => {
      const iceServers = await getIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      
      pc.ontrack = (event) => {
        setParticipants((prev) => prev.map((p) =>
          p.userId === remoteSocketId ? { ...p, stream: event.streams[0] } : p
        ));
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('ice-candidate', { to: remoteSocketId, candidate: event.candidate });
        }
      };
      peerConnections.current.set(remoteSocketId, pc);
      return pc;
    },
    [getIceServers]
  );

  const setupSocketListeners = useCallback((socket) => {
    socket.on('offer', async ({ from, offer, username }) => {
      setParticipants(prev => {
        if (prev.some(p => p.userId === from)) return prev;
        return [...prev, { userId: from, username, stream: null, isLocal: false, isHost: false, videoEnabled: true, audioEnabled: true, isScreenSharing: false }];
      });

      const pc = await createPeerConnection(from);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
      }
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { to: from, answer });
    });

    socket.on('answer', ({ from, answer }) => {
      peerConnections.current.get(from)?.setRemoteDescription(new RTCSessionDescription(answer));
    });
    
    socket.on('user-joined', ({ userId, username }) => {
       setParticipants(prev => {
          if (prev.some(p => p.userId === userId)) return prev;
          return [...prev, { userId, username, stream: null, isLocal: false, isHost: false, videoEnabled: true, audioEnabled: true, isScreenSharing: false }];
       });
    });

    socket.on('ice-candidate', ({ from, candidate }) => {
      peerConnections.current.get(from)?.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on('user-left', (userId) => {
      peerConnections.current.get(userId)?.close();
      peerConnections.current.delete(userId);
      setParticipants(prev => prev.filter(p => p.userId !== userId));
    });
    
    socket.on('chat-message', (payload) => setMessages(prev => [...prev, payload]));

    socket.on('screen-share-start', ({ userId }) => setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: true } : p)));
    socket.on('screen-share-stop', ({ userId }) => setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: false } : p)));

  }, [createPeerConnection]); // Empty dependency array is crucial here to prevent re-registration

  useEffect(() => {
    let isMounted = true;
    const initialize = async () => {
      if (!user) { navigate('/home'); return; }
      try {
        setIsLoading(true);
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
        if (!isMounted) return;
        
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];

        const socket = io(SERVER_URL, { auth: { token: user.token }, transports: ['websocket'] });
        socketRef.current = socket;
        
        setupSocketListeners(socket);
        
        socket.emit('join-room', { roomId, username: user.username }, async (otherUsers) => {
            const isHost = otherUsers.length === 0;
            const allUsers = [
                { userId: socket.id, username: `${user.username} (You)`, stream, isLocal: true, isHost, videoEnabled: true, audioEnabled: true, isScreenSharing: false },
                ...otherUsers.map(u => ({ userId: u.userId, username: u.username, stream: null, isLocal: false, isHost: false, videoEnabled: true, audioEnabled: true, isScreenSharing: false }))
            ];
            setParticipants(allUsers);

            for (const otherUser of otherUsers) {
                const pc = await createPeerConnection(otherUser.userId);
                stream.getTracks().forEach(track => pc.addTrack(track, stream));
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('offer', { to: otherUser.userId, offer, username: user.username });
            }
        });
        setIsLoading(false);
      } catch (error) {
        toast.error("Failed to access camera. Please check permissions.");
        navigate('/home');
      }
    };
    initialize();
    return () => {
      isMounted = false;
      socketRef.current?.disconnect();
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      peerConnections.current.forEach(pc => pc.close());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user, navigate]);

  const replaceTrack = useCallback(async (newTrack, isScreenShare = false) => {
      for (const pc of peerConnections.current.values()) {
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) await sender.replaceTrack(newTrack);
      }
      const oldTrack = localStreamRef.current.getVideoTracks()[0];
      localStreamRef.current.removeTrack(oldTrack);
      localStreamRef.current.addTrack(newTrack);
      setParticipants((prev) => prev.map((p) => p.isLocal ? { ...p, isScreenSharing: isScreenShare } : p));
      socketRef.current.emit(isScreenShare ? 'screen-share-start' : 'screen-share-stop');
    },[]);

  const toggleAudio = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioMuted(!audioTrack.enabled);
      setParticipants(prev => prev.map(p => p.isLocal ? { ...p, audioEnabled: audioTrack.enabled } : p));
    }
  };

  const toggleVideo = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
      setParticipants(prev => prev.map(p => p.isLocal ? { ...p, videoEnabled: videoTrack.enabled } : p));
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
          if (localCameraTrackRef.current) {
            await replaceTrack(localCameraTrackRef.current, false);
            setIsSharingScreen(false);
          }
        };
      } catch (err) { toast.error('Screen sharing failed.'); }
    }
  };
  
  const handleSwipe = (direction) => {
    const maxPages = pinnedParticipantId ? totalSmallPages : totalGridPages;
    setCurrentOffset((prev) => {
      const newOffset = prev + direction;
      return Math.max(0, Math.min(newOffset, maxPages - 1));
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

  if (isLoading) return <div className="h-screen bg-black flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden text-white">
      <div className="bg-gray-900 p-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Meeting: {roomId}</h1>
        <span>Participants: {participants.length}</span>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 relative p-4" ref={videoContainerRef}>
          <div style={{ position: 'absolute', top: toolbarPosition.y, left: toolbarPosition.x, zIndex: 50 }}>
            <AnnotationToolbar
                onMouseDown={handleToolbarMouseDown}
                isAnnotationActive={isAnnotationActive}
                toggleAnnotations={() => setIsAnnotationActive(p => !p)}
                currentTool={currentTool}
                setCurrentTool={setCurrentTool}
                currentBrushSize={currentBrushSize}
                setCurrentBrushSize={setCurrentBrushSize}
                clearCanvas={() => {/* Implement canvas clearing */}}
            />
          </div>

          {pinnedParticipantId && participants.length > 1 ? (
            <div className="h-full flex flex-col gap-4">
              <div className="flex-1 min-h-0">
                <VideoPlayer
                  key={pinnedParticipantId}
                  participant={participants.find((p) => p.userId === pinnedParticipantId)}
                  isPinned={true}
                  isLocal={participants.find((p) => p.userId === pinnedParticipantId)?.isLocal}
                />
              </div>
              <div className="h-40 relative">
                <div className="absolute inset-0 flex transition-transform duration-300 ease-in-out" style={{ transform: `translateX(-${currentOffset * 100}%)` }}>
                  {Array.from({ length: totalSmallPages }, (_, i) => (
                    <div key={i} className={`flex-shrink-0 w-full h-full grid grid-cols-6 gap-2`}>
                      {smallParticipants.slice(i * gridSize, (i + 1) * gridSize).map((p) => (
                        <div key={p.userId} className="h-full">
                          <VideoPlayer participant={p} isLocal={p.isLocal}/>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full relative" onWheel={(e) => { if (e.deltaY !== 0) { e.preventDefault(); handleSwipe(e.deltaY > 0 ? 1 : -1); } }}>
              <div className="absolute inset-0 flex transition-transform duration-300 ease-in-out" style={{ transform: `translateX(-${currentOffset * 100}%)` }}>
                {Array.from({ length: totalGridPages }, (_, i) => (
                  <div key={i} className={`flex-shrink-0 w-full h-full grid gap-4 ${gridLayoutClass}`}>
                    {participants.slice(i * (gridSize * 2), (i + 1) * (gridSize * 2)).map((p) => (
                      <div key={p.userId} className="bg-gray-800 rounded-lg">
                        <VideoPlayer participant={p} isLocal={p.isLocal} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {totalGridPages > 1 && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                  {Array.from({ length: totalGridPages }, (_, i) => (
                    <button key={i} onClick={() => setCurrentOffset(i)} className={`w-3 h-3 rounded-full ${currentOffset === i ? 'bg-white' : 'bg-gray-500'}`} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className={`bg-gray-900 border-l border-gray-700 transition-all duration-300 ${isChatOpen || isParticipantsOpen ? 'w-80' : 'w-0'} overflow-hidden`}>
          {isChatOpen && <Chat messages={messages} onSendMessage={(message) => {
              const payload = { message, username: user.username, timestamp: new Date().toISOString() };
              socketRef.current.emit('send-chat-message', payload);
              setMessages((prev) => [...prev, payload]);
            }} currentUser={user} onClose={() => setIsChatOpen(false)} />}
          {isParticipantsOpen && <Participants participants={participants} currentUser={user} onClose={() => setIsParticipantsOpen(false)} roomId={roomId} />}
        </div>
      </div>

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