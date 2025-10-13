// src/components/VideoPlayer.js

import React, { useEffect, useRef, useState } from 'react';
import './VideoPlayer.css'
const VideoPlayer = ({ participant, isPinned, isLocal, className = '' }) => {
  const videoRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && participant?.stream) {
      videoRef.current.srcObject = participant.stream;
    }

    // Speaking detection logic
    if (participant?.stream && !isLocal && participant.audioEnabled) {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(participant.stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        source.connect(analyser);
        
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const checkSpeaking = () => {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
            setIsSpeaking(average > 10); // Threshold for speaking
          }
          animationFrameRef.current = requestAnimationFrame(checkSpeaking);
        };
        checkSpeaking();
      } catch (error) {
        console.error("Failed to initialize audio analyser:", error);
      }
    }

    return () => {
      // Cleanup
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      setIsSpeaking(false);
    };
  }, [participant?.stream, isLocal, participant?.audioEnabled]);

  if (!participant) return null;

  const borderColor = isSpeaking ? 'border-green-400 shadow-lg shadow-green-400/50' : 'border-gray-700';

  return (
    <div className={`video-container ${className} relative w-full bg-gray-800 rounded-lg overflow-hidden border-2 ${borderColor} transition-all duration-300`}>
       {/* ... (rest of the VideoPlayer JSX is the same as the last version) ... */}
      <video
         ref={videoRef}
         autoPlay
         playsInline
         muted={isLocal}
         className={`video-element ${isLocal && !participant.isScreenSharing ? 'mirror' : ''}`}
       />
       {/* ... name overlay etc ... */}
       <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
        <span className="text-white text-sm font-medium truncate">
          {participant.username} {participant.isHost && '👑'}
        </span>
       </div>
    </div>
  );
};

export default VideoPlayer;