import React, { useEffect, useRef } from 'react';

const VideoPlayer = ({ participant }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const videoNode = videoRef.current;
    if (videoNode && participant.stream) {
      // FIX: Directly assign the stream to the srcObject
      videoNode.srcObject = participant.stream;
      // Attempt to play the video
      videoNode.play().catch(error => {
        console.error("Video play failed:", error);
        // Autoplay is often blocked, user interaction may be required.
        // The 'muted' property helps with autoplay policies.
      });
    }

    // Cleanup function to clear the stream when component unmounts
    return () => {
        if (videoNode) {
            videoNode.srcObject = null;
        }
    };
  }, [participant.stream]); // Re-run only when the stream object itself changes

  if (!participant) return null;

  return (
    <div className="relative w-full h-full bg-gray-800 rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        playsInline
        // FIX: The 'muted' prop is crucial for the local user's video to prevent audio feedback
        muted={participant.isLocal}
        className={`w-full h-full object-cover ${participant.isLocal ? 'transform scale-x-[-1]' : ''}`}
      />
      {/* Display user's initial if video is not available or disabled */}
      {(!participant.stream || !participant.stream.getVideoTracks().some(track => track.enabled)) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-700">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-3xl">
                  {participant.username?.charAt(0)?.toUpperCase() || 'P'}
              </div>
          </div>
      )}
      <div className="absolute bottom-0 left-0 bg-gradient-to-t from-black/50 to-transparent p-2 w-full">
        <span className="text-white text-sm font-medium">{participant.username}</span>
      </div>
    </div>
  );
};

export default VideoPlayer;