import React, { useEffect, useRef, useState } from 'react';

const VideoPlayer = ({ participant, isPinned, onPin, isLocal, isHost, localCameraVideoRef }) => {
  const internalVideoRef = useRef(null);
  const videoRef = isLocal ? localCameraVideoRef : internalVideoRef;
  const [isStreamLoading, setIsStreamLoading] = useState(true);
  const [isParticipantInvalid, setIsParticipantInvalid] = useState(false);

  useEffect(() => {
    if (!participant || !participant.userId || participant.isLocal === undefined) {
      console.warn('Invalid participant data:', participant);
      setIsParticipantInvalid(true);
      setIsStreamLoading(false);
      return;
    }
    setIsParticipantInvalid(false);

    const playVideo = async () => {
      if (videoRef.current && participant.stream && (participant.videoEnabled || participant.isScreenSharing)) {
        console.log(`VideoPlayer: Assigning stream for ${participant.userId}, videoRef exists: ${!!videoRef.current}, stream exists: ${!!participant.stream}`);
        videoRef.current.srcObject = participant.stream;
        try {
          await videoRef.current.play();
          console.log(`Video playing for participant: ${participant.userId}`);
          setIsStreamLoading(false);
        } catch (error) {
          console.error('Video play error:', error, { userId: participant.userId });
          setIsStreamLoading(false);
        }
      } else {
        console.warn(`VideoPlayer: Cannot play video for ${participant.userId}`, {
          videoRefExists: !!videoRef.current,
          streamExists: !!participant.stream,
          videoEnabled: participant.videoEnabled,
          isScreenSharing: participant.isScreenSharing,
          userId: participant.userId,
        });
        setIsStreamLoading(false);
      }
    };

    playVideo();

    if (participant.stream) {
      const videoTracks = participant.stream.getVideoTracks();
      const handleTrackChange = () => {
        console.log('Video track changed for participant:', participant.userId, {
          enabled: videoTracks[0]?.enabled,
          readyState: videoTracks[0]?.readyState,
        });
        playVideo();
      };
      videoTracks.forEach((track) => {
        track.addEventListener('mute', handleTrackChange);
        track.addEventListener('unmute', handleTrackChange);
        track.addEventListener('ended', handleTrackChange);
      });
      return () => {
        videoTracks.forEach((track) => {
          track.removeEventListener('mute', handleTrackChange);
          track.removeEventListener('unmute', handleTrackChange);
          track.removeEventListener('ended', handleTrackChange);
        });
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      };
    }
  }, [participant.stream, participant.videoEnabled, participant.isScreenSharing, participant.userId, videoRef, isLocal]);

  return (
    <div className={`video-container relative bg-gray-800 ${isPinned ? 'pinned-video' : ''}`}>
      <style>
        {`
          .unmirror { transform: scaleX(-1) !important; }
          .camera-video { position: absolute; bottom: 10px; right: 10px; width: 150px; height: 100px; border: 2px solid white; border-radius: 8px; }
          .pinned-video { width: 100%; height: 80vh; margin-bottom: 10px; }
          .host-logo { margin-left: 8px; font-size: 16px; }
        `}
      </style>
      {isParticipantInvalid ? (
        <div className="w-full h-full bg-gray-700 flex items-center justify-center text-white">
          Invalid participant data
        </div>
      ) : isStreamLoading ? (
        <div className="w-full h-full bg-gray-700 flex items-center justify-center">
          <div className="text-center text-white">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <div className="text-sm">Loading video...</div>
          </div>
        </div>
      ) : participant.stream && (participant.videoEnabled || participant.isScreenSharing) ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className={`w-full h-full object-cover ${isPinned ? 'pinned-video' : ''} ${isLocal && !participant.isScreenSharing ? 'unmirror' : ''}`}
          />
          {isLocal && participant.isScreenSharing && localCameraVideoRef && (
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
                {participant.username?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="text-white text-sm font-medium">
              {participant.username || 'Participant'} {isLocal ? '(You)' : ''}
            </div>
          </div>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-3">
        <div className="flex items-center justify-between">
          <span className="text-white text-sm font-medium truncate">
            {participant.username || 'Participant'} {isLocal ? '(You)' : ''} {participant.isHost && <span className="host-logo">👑</span>}
          </span>
          <div className="flex items-center space-x-1">
            {!participant.audioEnabled && (
              <div className="bg-red-500 p-1 rounded-full" title="Microphone muted">
                <span className="text-white text-xs">🔇</span>
              </div>
            )}
            {!participant.videoEnabled && !participant.isScreenSharing && (
              <div className="bg-gray-600 p-1 rounded-full" title="Camera off">
                <span className="text-white text-xs">📷</span>
              </div>
            )}
            {participant.isScreenSharing && (
              <div className="bg-blue-500 p-1 rounded-full" title="Screen sharing">
                <span className="text-white text-xs">🖥</span>
              </div>
            )}
            {isPinned && (
              <div className="bg-yellow-500 p-1 rounded-full" title="Pinned">
                <span className="text-black text-xs">📌</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="absolute top-2 left-2">
        <div
          className={`w-2 h-2 rounded-full ${
            participant.connectionQuality === 'poor' ? 'bg-red-400' : participant.connectionQuality === 'fair' ? 'bg-yellow-400' : 'bg-green-400'
          } animate-pulse`}
          title="Connection quality"
        ></div>
      </div>
      {participant.isHost && (
        <div className="absolute top-2 right-2">
          <div className="bg-green-600 text-white px-2 py-1 rounded text-xs font-medium">Host</div>
        </div>
      )}
      {isHost && onPin && (
        <div className="absolute top-2 right-10">
          <button
            onClick={onPin}
            className="bg-gray-600 hover:bg-gray-500 p-1 rounded-full text-white text-xs"
            title={isPinned ? 'Unpin' : 'Pin'}
          >
            <span>{isPinned ? '📌 Unpin' : '📌 Pin'}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;