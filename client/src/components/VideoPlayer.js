// src/components/VideoPlayer.js

import React, { useEffect, useRef, useState } from 'react';
import './VideoPlayer.css'

const VideoPlayer = ({ participant, isPinned, isLocal, isMirroringBrowser, className = '' }) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Handle AI bot frame
  if (participant.isAI) {
    useEffect(() => {
      if (audioRef.current && participant.audioUrl) {
        audioRef.current.src = participant.audioUrl;
      }
    }, [participant.audioUrl]);

    useEffect(() => {
      if (audioRef.current) {
        if (participant.isPlaying) {
          audioRef.current.play().catch(err => console.error('AI audio play error:', err));
        } else {
          audioRef.current.pause();
        }
      }
    }, [participant.isPlaying]);

    const borderColor = participant.isProcessing ? 'border-yellow-400' : 'border-gray-700';

    return (
      <div className={`video-container ${className} relative w-full bg-gray-800 rounded-lg overflow-hidden border-2 ${borderColor} transition-all duration-300`}>
        <div className="flex flex-col h-full p-4 overflow-auto">
          {participant.isBotLocked && participant.currentUploader !== 'your-socket-id' ? (  // Replace 'your-socket-id' with actual socket.id if available
            <div className="text-center text-yellow-400">Locked by {participant.uploaderUsername}</div>
          ) : participant.isProcessing ? (
            <div className="flex-1 flex items-center justify-center">Processing...</div>
          ) : (
            <>
              {participant.imageUrl ? (
                <img src={participant.imageUrl} alt="AI Image" className="max-h-1/2 object-contain mb-4" />
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400">No Image Uploaded</div>
              )}
              <div className="flex-1 overflow-auto bg-gray-900 p-2 rounded">
                {participant.output ? (
                  <p className="text-sm text-white whitespace-pre-wrap">{participant.output}</p>
                ) : (
                  <p className="text-sm text-gray-400">No AI output yet</p>
                )}
              </div>
              {participant.audioUrl && (
                <div className="mt-4 flex justify-center gap-4">
                  <button onClick={participant.handlePlay} disabled={participant.isPlaying} className="p-2 bg-green-500 rounded">
                    Play
                  </button>
                  <button onClick={participant.handlePause} disabled={!participant.isPlaying} className="p-2 bg-red-500 rounded">
                    Pause
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <audio ref={audioRef} loop />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
          <span className="text-white text-sm font-medium truncate">
            {participant.username}
          </span>
        </div>
      </div>
    );
  }

  // Regular video player logic
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

  // Mirroring logic based on browser type
  let videoClass = 'video-element';
  if (isLocal && !participant.isScreenSharing) {
    videoClass += isMirroringBrowser ? '' : ' mirror';
  } else if (!isLocal && !participant.isScreenSharing) {
    videoClass += isMirroringBrowser ? ' mirror' : '';
  }

  return (
    <div className={`video-container ${className} relative w-full bg-gray-800 rounded-lg overflow-hidden border-2 ${borderColor} transition-all duration-300`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={videoClass}
      />
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
        <span className="text-white text-sm font-medium truncate">
          {participant.username} {participant.isHost && '👑'}
        </span>
      </div>
    </div>
  );
};

export default VideoPlayer;