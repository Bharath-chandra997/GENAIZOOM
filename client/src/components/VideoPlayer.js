import React, { useEffect, useRef } from 'react';

const VideoPlayer = ({ participant, isPinned, onPin, isLocal, isHost }) => {
  const videoRef = useRef(null);

  // **FIX:** Simplified and more robust useEffect to handle stream attachment
  useEffect(() => {
    const videoNode = videoRef.current;
    if (videoNode) {
      if (participant && participant.stream) {
        // Attach the stream if it doesn't match the current source
        if (videoNode.srcObject !== participant.stream) {
            videoNode.srcObject = participant.stream;
        }
        // Attempt to play the video. This is safe to call multiple times.
        videoNode.play().catch(error => console.error(`Video play error for ${participant.userId}:`, error));
      } else {
        // If there's no stream, clear the source
        videoNode.srcObject = null;
      }
    }
  }, [participant, participant?.stream]); // Depend on the stream object itself

  if (!participant) {
    return (
        <div className="w-full h-full bg-gray-700 flex items-center justify-center text-white">
            Participant data is missing.
        </div>
    );
  }

  const showVideo = participant.stream && (participant.videoEnabled || participant.isScreenSharing);

  return (
    <div className="video-container w-full h-full relative bg-gray-800 rounded-lg overflow-hidden">
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isLocal}
          className={`w-full h-full object-cover ${participant.isLocal && !participant.isScreenSharing ? 'transform scale-x-[-1]' : ''}`}
        />
      ) : (
        <div className="w-full h-full bg-gray-700 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl font-bold text-white">
                {participant.username?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="text-white font-medium">
              {participant.username}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
        <div className="flex items-center justify-between">
          <span className="text-white text-sm font-medium truncate">
            {participant.username} {participant.isLocal ? '(You)' : ''}
            {participant.isHost && <span className="ml-1">👑</span>}
          </span>
          <div className="flex items-center space-x-2">
            {!participant.audioEnabled && <span title="Muted">🔇</span>}
          </div>
        </div>
      </div>
      
      {/* Pin button for Host */}
      {!participant.isLocal && participants.find(p => p.isLocal && p.isHost) && (
        <div className="absolute top-2 right-2">
            <button
              onClick={onPin}
              className="bg-black/50 hover:bg-black/75 p-2 rounded-full text-white text-xs transition-all"
              title={isPinned ? 'Unpin' : 'Pin'}
            >
              <span>{isPinned ? '📌' : '📌'}</span>
            </button>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;