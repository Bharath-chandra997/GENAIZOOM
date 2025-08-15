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
  const [gridSize, setGridSize] = useState(4);
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

  // Memoized values for performance
  const memoizedParticipants = useMemo(() => participants, [participants]);
  
  // This useEffect AUTOMATICALLY sets the main "pinned" view based on current state
  useEffect(() => {
    const screenSharer = memoizedParticipants.find(p => p.isScreenSharing);
    if (screenSharer) {
      setPinnedParticipantId(screenSharer.userId);
      return;
    }
    const host = memoizedParticipants.find(p => p.isHost);
    if (host) {
      setPinnedParticipantId(host.userId);
      return;
    }
    // Fallback if no host is present for some reason
    if (memoizedParticipants.length > 0) {
      setPinnedParticipantId(memoizedParticipants[0].userId)
    } else {
      setPinnedParticipantId(null);
    }
  }, [memoizedParticipants]);
  

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
      return [{ urls: 'stun:stun.l.google.com:19302' }];
    }
  }, []);

  const createPeerConnection = useCallback(
    async (remoteSocketId, remoteUsername) => {
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

  const setupSocketListeners = useCallback(
    (socket) => {
      // Existing users get this event when a new user joins
      socket.on('user-joined', async ({ userId, username, isHost }) => {
        // Add new user to state to render their video tile
        setParticipants(prev => [...prev, { userId, username, stream: null, isLocal: false, isHost, videoEnabled: true, audioEnabled: true, isScreenSharing: false }]);
        
        // Existing user creates an offer TO the new user
        const pc = await createPeerConnection(userId, username);
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
        }
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { to: userId, offer, username: user.username });
      });

      // A user receives an offer (either the new user or an existing one)
      socket.on('offer', async ({ from, offer, username, isHost }) => {
        setParticipants(prev => {
          if (prev.find(p => p.userId === from)) return prev;
          return [...prev, { userId: from, username, stream: null, isLocal: false, isHost, videoEnabled: true, audioEnabled: true, isScreenSharing: false }];
        });

        const pc = await createPeerConnection(from, username);
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { to: from, answer });
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
      
      socket.on('screen-share-start', ({ userId }) => setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: true } : p)));
      socket.on('screen-share-stop', ({ userId }) => setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isScreenSharing: false } : p)));
    },
    [createPeerConnection, user.username]
  );
  
  useEffect(() => {
    const initialize = async () => {
      if (!user) { navigate('/home'); return; }
      try {
        setIsLoading(true);
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        localCameraTrackRef.current = stream.getVideoTracks()[0];

        const socket = io(SERVER_URL, { auth: { token: user.token }, transports: ['websocket'] });
        socketRef.current = socket;
        
        socket.on('connect', () => {
          const localParticipant = { userId: socket.id, username: `${user.username} (You)`, stream, isLocal: true, isHost: false, videoEnabled: true, audioEnabled: true, isScreenSharing: false };
          setParticipants([localParticipant]);
          setupSocketListeners(socket);
          socket.emit('join-room', { roomId, username: user.username });
        });

        setIsLoading(false);
      } catch (error) {
        toast.error("Failed to access camera. Please check permissions.");
        navigate('/home');
      }
    };
    initialize();
    return () => {
      socketRef.current?.disconnect();
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      peerConnections.current.forEach(pc => pc.close());
    };
  }, [roomId, user, navigate, setupSocketListeners]);


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
    const maxPages = pinnedParticipantId ? totalSmallPages : totalPages;
    setCurrentOffset((prev) => {
      const newOffset = prev + direction;
      return Math.max(0, Math.min(newOffset, maxPages - 1));
    });
  };

  if (isLoading) return <div className="h-screen bg-black flex items-center justify-center"><LoadingSpinner size="large" /></div>;

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden text-white">
      <div className="bg-gray-900 p-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Meeting: {roomId}</h1>
        <div className="flex items-center gap-4">
          <span>Participants: {participants.length}</span>
          <select value={gridSize} onChange={(e) => { setGridSize(Number(e.target.value)); setCurrentOffset(0); }} className="bg-gray-800 text-white p-1 rounded">
            <option value={4}>4 Frames</option>
            <option value={6}>6 Frames</option>
          </select>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 relative p-4" ref={videoContainerRef}>
          {/* Annotation Toolbar and Canvas would go here */}

          {pinnedParticipantId && participants.length > 1 ? (
             // Pinned View
            <div className="h-full flex flex-col">
              <div className="flex-1">
                <VideoPlayer
                  key={pinnedParticipantId}
                  participant={participants.find((p) => p.userId === pinnedParticipantId)}
                  isPinned={true}
                  isLocal={participants.find((p) => p.userId === pinnedParticipantId)?.isLocal}
                />
              </div>
              <div className="h-40 relative mt-4">
                <div className="absolute inset-0 flex transition-transform duration-300 ease-in-out" style={{ transform: `translateX(-${currentOffset * 100}%)` }}>
                  {Array.from({ length: totalSmallPages }, (_, i) => (
                    <div key={i} className="flex-shrink-0 w-full flex gap-4">
                      {smallParticipants.slice(i * gridSize, (i + 1) * gridSize).map((p) => (
                        <div key={p.userId} className="flex-1 h-full">
                          <VideoPlayer participant={p} isLocal={p.isLocal}/>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : participants.length === 1 ? (
             // Single User View
            <div className="w-full h-full flex items-center justify-center">
              <VideoPlayer participant={participants[0]} isLocal={participants[0].isLocal}/>
            </div>
          ) : (
             // Grid View
            <div className="h-full relative" onWheel={(e) => { if (e.deltaY !== 0) { e.preventDefault(); handleSwipe(e.deltaY > 0 ? 1 : -1); } }}>
              <div className="absolute inset-0 flex transition-transform duration-300 ease-in-out" style={{ transform: `translateX(-${currentOffset * 100}%)` }}>
                {Array.from({ length: totalPages }, (_, i) => (
                  <div key={i} className={`flex-shrink-0 w-full h-full grid gap-4 ${gridClass}`}>
                    {memoizedParticipants.slice(i * gridSize, (i + 1) * gridSize).map((p) => (
                      <div key={p.userId} className="bg-gray-800 rounded-lg">
                        <VideoPlayer participant={p} isLocal={p.isLocal} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button key={i} onClick={() => setCurrentOffset(i)} className={`w-3 h-3 rounded-full ${currentOffset === i ? 'bg-white' : 'bg-gray-500'}`} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Chat and Participants Panels */}
        <div className={`bg-gray-900 border-l border-gray-700 transition-all duration-300 ${isChatOpen || isParticipantsOpen ? 'w-80' : 'w-0'} overflow-hidden`}>
          {isChatOpen && <Chat messages={messages} onSendMessage={(msg) => { /* ... */ }} currentUser={user} onClose={() => setIsChatOpen(false)} />}
          {isParticipantsOpen && <Participants participants={memoizedParticipants} currentUser={user} onClose={() => setIsParticipantsOpen(false)} roomId={roomId} />}
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