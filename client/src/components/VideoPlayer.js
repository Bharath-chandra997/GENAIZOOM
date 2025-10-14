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

    // Optimized speaking detection with reduced CPU usage
    if (participant?.stream && !isLocal && participant.audioEnabled) {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(participant.stream);
        const analyser = audioContext.createAnalyser();
        
        // Optimized settings for better performance
        analyser.fftSize = 256; // Reduced from 512
        analyser.smoothingTimeConstant = 0.8; // Smoother detection
        analyser.minDecibels = -90;
        analyser.maxDecibels = -10;
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        source.connect(analyser);
        
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        let lastCheck = 0;
        const checkSpeaking = (timestamp) => {
          // Throttle to 10fps instead of 60fps for better performance
          if (timestamp - lastCheck > 100) {
            if (analyserRef.current) {
              analyserRef.current.getByteFrequencyData(dataArray);
              // Only check lower frequencies for voice detection
              const voiceFrequencies = dataArray.slice(0, Math.floor(dataArray.length * 0.3));
              const average = voiceFrequencies.reduce((sum, value) => sum + value, 0) / voiceFrequencies.length;
              setIsSpeaking(average > 15); // Slightly higher threshold
            }
            lastCheck = timestamp;
          }
          animationFrameRef.current = requestAnimationFrame(checkSpeaking);
        };
        checkSpeaking(0);
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