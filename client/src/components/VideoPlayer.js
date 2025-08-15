import React, { useEffect, useRef, useState } from 'react';

const VideoPlayer = ({ participant, isPinned, onPin, isLocal, isHost, localCameraVideoRef, localCameraTrackRef }) => {
  const videoRef = useRef(null);

  // This useEffect reliably attaches the video stream when the component loads or the stream changes.
  // It relies on the <video> element's `autoPlay` property, which is more robust than manually calling .play().
  useEffect(() => {
    if (videoRef.current && participant?.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant?.stream]);

  if (!participant) {
    return <div className="w-full h-full bg-gray-700 flex items-center justify-center text-white">Loading...</div>;
  }

  return (
    <div className="video-container relative w-full h-full bg-gray-800 rounded-lg overflow-hidden">
      <style>
        {`
          .unmirror { transform: scaleX(-1); }
          .camera-video { position: absolute; bottom: 10px; right: 10px; width: 150px; height: 100px; border: 2px solid white; border-radius: 8px; z-index: 20; }
        `}
      </style>
      
      {participant.stream && (participant.videoEnabled || participant.isScreenSharing) ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className={`w-full h-full object-cover ${isLocal && !participant.isScreenSharing ? 'unmirror' : ''}`}
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
            <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl font-bold text-white">
                {participant.username?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="text-white font-medium">{participant.username}</div>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <div className="flex items-center justify-between">
          <span className="text-white text-sm font-medium truncate">
            {participant.username} {participant.isHost && '👑'}
          </span>
          <div className="flex items-center space-x-1.5">
            {!participant.audioEnabled && (
              <div className="bg-red-500 p-1 rounded-full" title="Microphone muted">
                <span role="img" aria-label="Muted" className="text-white text-xs">🔇</span>
              </div>
            )}
            {isPinned && (
              <div className="bg-yellow-500 p-1 rounded-full" title="Pinned">
                 <span role="img" aria-label="Pinned" className="text-black text-xs">📌</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;