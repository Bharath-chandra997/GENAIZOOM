import React, { useEffect, useRef } from 'react';

const VideoPlayer = ({ participant }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const videoNode = videoRef.current;
    if (videoNode && participant.stream) {
      videoNode.srcObject = participant.stream;
      videoNode.play().catch(error => {
        console.error("Video play failed:", error);
      });
    }
    return () => {
        if (videoNode) {
            videoNode.srcObject = null;
        }
    };
  }, [participant.stream]);

  if (!participant) return null;

  return (
    <div className="relative w-full h-full bg-gray-800 rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        playsInline
        muted={participant.isLocal}
        className={`w-full h-full object-cover ${participant.isLocal ? 'transform scale-x-[-1]' : ''}`}
      />
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