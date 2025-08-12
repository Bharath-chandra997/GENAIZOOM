import React, { useEffect, useRef, useState, useCallback } from 'react';

const VideoPlayer = ({ participant, isPinned, onPin, localCameraVideoRef, isLocal }) => {
  const videoRef = useRef(null);
  const lastStreamRef = useRef(null);
  const [isStreamLoading, setIsStreamLoading] = useState(true);
  const [isParticipantInvalid, setIsParticipantInvalid] = useState(false);

  const playVideo = useCallback(() => {
    if (videoRef.current && participant.stream) {
      if (videoRef.current.srcObject !== participant.stream) {
        console.log(`Assigning new stream to videoRef for participant: ${participant.userId}`, {
          isLocal: participant.isLocal,
          hasStream: !!participant.stream,
          videoEnabled: participant.videoEnabled ?? true,
          isScreenSharing: participant.isScreenSharing ?? false,
          unmirrorApplied: participant.isLocal && !participant.isScreenSharing,
          videoTracks: participant.stream.getVideoTracks().map((t) => ({
            id: t.id,
            enabled: t.enabled,
            readyState: t.readyState,
          })),
          audioTracks: participant.stream.getAudioTracks().map((t) => ({
            id: t.id,
            enabled: t.enabled,
            readyState: t.readyState,
          })),
        });
        videoRef.current.srcObject = participant.stream;
        lastStreamRef.current = participant.stream;
      } else {
        console.log(`Stream already assigned for participant: ${participant.userId}`);
      }

      const videoTracks = participant.stream.getVideoTracks();
      const audioTracks = participant.stream.getAudioTracks();

      if (videoTracks.length === 0 || !videoTracks[0].enabled || videoTracks[0].readyState !== 'live') {
        console.warn('No valid video tracks to play:', {
          userId: participant.userId,
          tracks: videoTracks.map((track) => ({
            id: track.id,
            enabled: track.enabled,
            readyState: track.readyState,
          })),
        });
        setIsStreamLoading(false);
        return;
      }

      if (audioTracks.length === 0 || !audioTracks[0].enabled || audioTracks[0].readyState !== 'live') {
        console.warn('No valid audio tracks:', {
          userId: participant.userId,
          tracks: audioTracks.map((track) => ({
            id: track.id,
            enabled: track.enabled,
            readyState: track.readyState,
          })),
        });
      }

      videoRef.current.play().catch((error) => {
        console.error('Video play error:', error, { userId: participant.userId });
        setIsStreamLoading(false);
      });
    } else {
      console.warn('Cannot play video: missing videoRef or stream', {
        videoRefExists: !!videoRef.current,
        streamExists: !!participant.stream,
        userId: participant.userId,
      });
      setIsStreamLoading(false);
    }
  }, [participant.userId, participant.stream, participant.isLocal]);

  useEffect(() => {
    if (!participant || !participant.userId || participant.isLocal === undefined) {
      console.warn('Invalid participant data:', participant);
      setIsParticipantInvalid(true);
      setIsStreamLoading(false);
      return;
    }
    setIsParticipantInvalid(false);

    if (participant.stream) {
      setIsStreamLoading(true);
      playVideo();

      const videoTracks = participant.stream.getVideoTracks();
      const audioTracks = participant.stream.getAudioTracks();
      const handleTrackChange = () => {
        console.log('Track changed for participant:', participant.userId, {
          videoEnabled: videoTracks[0]?.enabled,
          videoReadyState: videoTracks[0]?.readyState,
          audioEnabled: audioTracks[0]?.enabled,
          audioReadyState: audioTracks[0]?.readyState,
        });
        if (videoRef.current && participant.stream && (participant.videoEnabled || participant.isScreenSharing)) {
          playVideo();
        }
      };

      videoTracks.forEach((track) => {
        track.addEventListener('mute', handleTrackChange);
        track.addEventListener('unmute', handleTrackChange);
        track.addEventListener('ended', handleTrackChange);
      });
      audioTracks.forEach((track) => {
        track.addEventListener('mute', handleTrackChange);
        track.addEventListener('unmute', handleTrackChange);
        track.addEventListener('ended', handleTrackChange);
      });

      const handleLoadedMetadata = () => {
        console.log('Video loadedmetadata event:', participant.userId);
        setIsStreamLoading(false);
      };
      videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);

      return () => {
        videoTracks.forEach((track) => {
          track.removeEventListener('mute', handleTrackChange);
          track.removeEventListener('unmute', handleTrackChange);
          track.removeEventListener('ended', handleTrackChange);
        });
        audioTracks.forEach((track) => {
          track.removeEventListener('mute', handleTrackChange);
          track.removeEventListener('unmute', handleTrackChange);
          track.removeEventListener('ended', handleTrackChange);
        });
        if (videoRef.current) {
          videoRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
          videoRef.current.srcObject = null;
        }
      };
    } else {
      console.log('Stream not available for participant:', participant.userId, {
        username: participant.username,
        isLocal: participant.isLocal,
        hasStream: !!participant.stream,
        videoEnabled: participant.videoEnabled ?? true,
        isScreenSharing: participant.isScreenSharing ?? false,
      });
      setIsStreamLoading(false);
    }
  }, [participant.userId, participant.stream, participant.videoEnabled, participant.isScreenSharing, participant.isLocal, playVideo]);

  return (
    <div className="video-container relative bg-gray-800">
      <style>
        {`
          .unmirror {
            transform: scaleX(-1) !important;
          }
          .camera-video {
            position: absolute;
            bottom: 10px;
            right: 10px;
            width: 150px;
            height: 100px;
            border: 2px solid white;
            border-radius: 8px;
            object-fit: cover;
          }
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
            <div className="text-sm">Loading...</div>
          </div>
        </div>
      ) : participant.stream && (participant.videoEnabled || participant.isScreenSharing) ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={participant.isLocal}
            className={`w-full h-full object-cover ${isPinned ? 'pinned-video' : ''} ${
              participant.isLocal && !participant.isScreenSharing ? 'unmirror' : ''
            }`}
          />
          {participant.isLocal && participant.isScreenSharing && localCameraVideoRef && (
            <video
              ref={localCameraVideoRef}
              autoPlay
              playsInline
              muted
              className="camera-video unmirror"
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
              {participant.username || 'Participant'} {participant.isLocal ? '(You)' : ''}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-3">
        <div className="flex items-center justify-between">
          <span className="text-white text-sm font-medium truncate">
            {participant.username || 'Participant'} {participant.isLocal ? '(You)' : ''}
            {participant.isHost && <span className="host-badge ml-2">Host</span>}
          </span>
          <div className="flex items-center space-x-1">
            {!participant.audioEnabled && (
              <div className="bg-red-500 p-1 rounded-full" title="Microphone muted">
                <span className="text-white text-xs">🔇</span>
              </div>
            )}
            {!(participant.videoEnabled || participant.isScreenSharing) && (
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
            participant.connectionQuality === 'poor'
              ? 'bg-red-400'
              : participant.connectionQuality === 'fair'
              ? 'bg-yellow-400'
              : 'bg-green-400'
          } animate-pulse`}
          title="Connection quality"
        ></div>
      </div>

      {participant.isHost && (
        <div className="absolute top-2 right-2">
          <div className="bg-green-600 text-white px-2 py-1 rounded text-xs font-medium">
            Host
          </div>
        </div>
      )}

      {onPin && (
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