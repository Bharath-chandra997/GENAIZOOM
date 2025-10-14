// src/components/VideoPlayer.js

import React, { useEffect, useRef, useState } from 'react';
import './VideoPlayer.css'

const VideoPlayer = ({ 
  participant, 
  isPinned, 
  isLocal, 
  isMirroringBrowser, 
  className = '',
  socketId 
}) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  // ✅ ALL HOOKS CALLED UNCONDITIONALLY AT TOP LEVEL

  // Set video srcObject (only for non-AI)
  useEffect(() => {
    if (videoRef.current && participant?.stream && !participant.isAI) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant?.stream, participant.isAI]);

  // AI Audio URL setup
  useEffect(() => {
    if (participant.isAI && audioRef.current && participant.audioUrl) {
      audioRef.current.src = participant.audioUrl;
    }
  }, [participant.isAI, participant.audioUrl]);

  // AI Play/Pause control
  useEffect(() => {
    if (participant.isAI && audioRef.current) {
      if (participant.isPlaying) {
        audioRef.current.play().catch(err => console.error('AI audio play error:', err));
      } else {
        audioRef.current.pause();
      }
    }
  }, [participant.isAI, participant.isPlaying]);

  // Speaking detection (only for non-AI, remote users)
  useEffect(() => {
    if (!participant?.stream || isLocal || !participant.audioEnabled || participant.isAI) {
      return;
    }

    let cancelled = false;
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(participant.stream);
      const analyser = audioContext.createAnalyser();
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      let lastCheck = 0;
      const checkSpeaking = (timestamp) => {
        if (cancelled) return;
        
        if (timestamp - lastCheck > 100) {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            const voiceFrequencies = dataArray.slice(0, Math.floor(dataArray.length * 0.3));
            const average = voiceFrequencies.reduce((sum, value) => sum + value, 0) / voiceFrequencies.length;
            setIsSpeaking(average > 15);
          }
          lastCheck = timestamp;
        }
        animationFrameRef.current = requestAnimationFrame(checkSpeaking);
      };
      checkSpeaking(0);

      return () => {
        cancelled = true;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
        setIsSpeaking(false);
      };
    } catch (error) {
      console.error("Failed to initialize audio analyser:", error);
      return () => {};
    }
  }, [participant?.stream, isLocal, participant?.audioEnabled, participant.isAI]);

  if (!participant) return null;

  // AI Bot Frame
  if (participant.isAI) {
    const borderColor = participant.isProcessing ? 'border-yellow-400' : 'border-purple-500';
    const isOwnUpload = socketId ? participant.currentUploader === socketId : false;

    return (
      <div className={`video-container ${className} relative w-full bg-gray-900 rounded-lg overflow-hidden border-2 ${borderColor} transition-all duration-300`}>
        <div className="flex flex-col h-full p-4">
          {participant.isBotLocked && !isOwnUpload ? (
            <div className="mb-2 text-center text-yellow-400 bg-yellow-900/50 p-2 rounded">
              🔒 Locked by <strong>{participant.uploaderUsername}</strong>
            </div>
          ) : participant.isProcessing ? (
            <div className="flex-1 flex items-center justify-center text-yellow-400">
              🤖 AI Processing...
            </div>
          ) : (
            <>
              {participant.imageUrl ? (
                <img 
                  src={participant.imageUrl} 
                  alt="AI Processed Image" 
                  className="max-h-1/2 w-full object-contain mb-4 rounded border border-purple-500" 
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  📷 Upload Image to Start
                </div>
              )}
              <div className="flex-1 overflow-auto bg-gray-800 p-3 rounded mb-4">
                {participant.output ? (
                  <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">
                    {participant.output}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 italic">AI output will appear here...</p>
                )}
              </div>
              {participant.audioUrl && (
                <div className="flex justify-center gap-4 p-2 bg-gray-800 rounded">
                  <button 
                    onClick={participant.handlePlay} 
                    disabled={participant.isPlaying}
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded transition-colors"
                  >
                    ▶️ Play
                  </button>
                  <button 
                    onClick={participant.handlePause}
                    disabled={!participant.isPlaying}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 rounded transition-colors"
                  >
                    ⏸️ Pause
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <audio ref={audioRef} loop />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
          <span className="text-purple-300 text-sm font-semibold">
            🤖 {participant.username}
          </span>
        </div>
      </div>
    );
  }

  // Regular Video Player
  const borderColor = isSpeaking ? 'border-green-400 shadow-lg shadow-green-400/50' : 'border-gray-700';

  // ✅ Fixed Mirroring Logic
  let videoClass = 'video-element';
  
  // Local camera: ALWAYS mirror (user expects to see themselves mirrored)
  if (isLocal && !participant.isScreenSharing) {
    videoClass += ' mirror';
  }
  // Remote camera: NEVER mirror (they should appear natural)
  // Screen shares: NEVER mirror
  
  // Browser-specific override for iOS Safari (it mirrors front camera tracks automatically)
  if (isMirroringBrowser) {
    if (isLocal && !participant.isScreenSharing) {
      videoClass = videoClass.replace(' mirror', ''); // Safari already mirrors local
    } else {
      videoClass += ' mirror'; // Mirror remote to correct Safari's behavior
    }
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
      {isSpeaking && (
        <div className="absolute top-2 right-2 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
        <span className="text-white text-sm font-medium truncate">
          {participant.username} {participant.isHost && '👑'}
        </span>
      </div>
    </div>
  );
};

export default VideoPlayer;