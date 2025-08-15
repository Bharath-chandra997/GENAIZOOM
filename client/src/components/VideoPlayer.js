import React, { useEffect, useRef, useState } from 'react';

const VideoPlayer = ({ participant, isMainView, onPin, isLocal, isHost, localCameraVideoRef, localCameraTrackRef }) => {
  const videoRef = useRef(null);
  const [isParticipantInvalid, setIsParticipantInvalid] = useState(false);

  // This useEffect is simplified to reliably attach the video stream.
  // It relies on the <video> element's autoplay property, which is more robust
  // than manually calling .play() and avoids race conditions on initial load.
  useEffect(() => {
    if (videoRef.current && participant?.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant?.stream]);


  useEffect(() => {
    if (!participant || !participant.userId) {
      console.warn('Invalid participant data:', participant);
      setIsParticipantInvalid(true);
      return;
    }
    setIsParticipantInvalid(false);
  }, [participant]);

  const containerClasses = isMainView
    ? 'w-full h-full'
    : 'w-full h-full';

  const videoClasses = isLocal && !participant.isScreenSharing ? 'unmirror' : '';

  return (
    <div className={`video-container relative bg-gray-800 rounded-lg overflow-hidden ${containerClasses}`}>
      <style>
        {`
          .unmirror { transform: scaleX(-1); }
          .camera-video { position: absolute; bottom: 10px; right: 10px; width: 150px; height: 100px; border: 2px solid white; border-radius: 8px; z-index: 20; }
        `}
      </style>
      {isParticipantInvalid ? (
        <div className="w-full h-full bg-gray-700 flex items-center justify-center text-white">
          Invalid participant data
        </div>
      ) : participant?.stream && (participant.videoEnabled || participant.isScreenSharing) ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className={`w-full h-full object-contain ${videoClasses}`}
          />
          {isLocal && participant.isScreenSharing && localCameraVideoRef && localCameraTrackRef && (
            <video
              ref={localCameraVideoRef}
              autoPlay
              playsInline
              muted
              className="camera-video unmirror"
              srcObject={localCameraTrackRef.current ? new MediaStream([localCameraTrackRef.current]) : null}
            />
          )}
        </>
      ) : (
        <div className="w-full h-full bg-gray-700 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl sm:text-2xl font-bold text-white">
                {participant?.username?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="text-white text-sm font-medium">
              {participant?.username || 'Participant'}
            </div>
          </div>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <div className="flex items-center justify-between">
          <span className="text-white text-sm font-medium truncate">
            {participant?.username || 'Participant'} {isLocal ? '(You)' : ''} {participant?.isHost && '👑'}
          </span>
          <div className="flex items-center space-x-1">
            {!participant?.audioEnabled && (
              <div className="bg-red-500 p-1 rounded-full" title="Microphone muted">
                <span role="img" aria-label="Muted" className="text-white text-xs">🔇</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;