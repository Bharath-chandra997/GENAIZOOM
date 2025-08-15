import React, { useEffect, useRef } from 'react';

const VideoPlayer = ({ participant }) => {
  const videoRef = useRef(null);
  // CHANGED: Added a ref to track the ID of the stream currently attached to the video element.
  // This prevents re-attaching the same stream on every re-render.
  const attachedStreamIdRef = useRef(null);

  // CHANGED: This effect is now much more robust.
  // Its dependency is `participant?.stream`, so it only runs when the stream object itself is added or removed.
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // Condition 1: If there is a stream and it's NOT the one we've already attached
    if (participant?.stream && attachedStreamIdRef.current !== participant.stream.id) {
      console.log(`Attaching stream ${participant.stream.id} to ${participant.username}`);
      videoElement.srcObject = participant.stream;
      attachedStreamIdRef.current = participant.stream.id;

      // The play() call is important for autoplay policies in some browsers
      videoElement.play().catch(error => {
        console.error(`Autoplay failed for ${participant.username}:`, error);
      });
    
    // Condition 2: If there is NO stream, clear the srcObject
    } else if (!participant?.stream && attachedStreamIdRef.current) {
      console.log(`Detaching stream for ${participant.username}`);
      videoElement.srcObject = null;
      attachedStreamIdRef.current = null;
    }
  }, [participant?.stream]);

  if (!participant) {
    return <div className="w-full h-full bg-gray-700 flex items-center justify-center text-white">Invalid participant data</div>;
  }

  // Determine if the video should be visible based on stream and enabled tracks.
  const showVideo = participant.stream && (participant.videoEnabled || participant.isScreenSharing);

  return (
    // NOTE: The JSX structure and all class names are identical to your original code.
    // The logic to show/hide elements is now handled by the `showVideo` variable.
    <div className="video-container relative bg-gray-800 w-full h-full">
      <video
        ref={videoRef}
        playsInline
        muted={participant.isLocal}
        className={`w-full h-full object-cover ${participant.isLocal && !participant.isScreenSharing ? 'unmirror' : ''}`}
        style={{ display: showVideo ? 'block' : 'none' }}
      />
      
      {!showVideo && (
        <div className="w-full h-full bg-gray-700 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl sm:text-2xl font-bold text-white">
                {participant.username?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="text-white text-sm font-medium">
              {participant.username || 'Participant'} {participant.isLocal ? '(You)' : ''}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-3">
        <div className="flex items-center justify-between">
          <span className="text-white text-sm font-medium truncate">
            {participant.username || 'Participant'} {participant.isLocal ? '(You)' : ''}
          </span>
          <div className="flex items-center space-x-1">
            {!participant.audioEnabled && (
              <div className="bg-red-500 p-1 rounded-full" title="Microphone muted">
                <span className="text-white text-xs">🔇</span>
              </div>
            )}
          </div>
        </div>
      </div>
        <style jsx>{`
        .unmirror {
          transform: scaleX(-1);
        }
      `}</style>
    </div>
  );
};

export default VideoPlayer;