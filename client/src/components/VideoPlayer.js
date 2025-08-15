import React, { useEffect, useRef, useState } from 'react';

const VideoPlayer = ({ participant, isPinned, onPin, localCameraVideoRef, isLocal }) => {
  const videoRef = useRef(null);
  const lastStreamRef = useRef(null);
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

    const playVideo = () => {
      if (videoRef.current && participant.stream) {
        if (videoRef.current.srcObject !== participant.stream) {
          console.log(`Assigning new stream to videoRef for participant: ${participant.userId}`, {
            isLocal: participant.isLocal ?? isLocal,
            hasStream: !!participant.stream,
            videoEnabled: participant.videoEnabled ?? true,
            isScreenSharing: participant.isScreenSharing ?? false,
            unmirrorApplied: participant.isLocal && !participant.isScreenSharing,
            videoTracks: participant.stream.getVideoTracks().map((track) => ({
              id: track.id,
              enabled: track.enabled,
              readyState: track.readyState,
              label: track.label,
            })),
          });
          videoRef.current.srcObject = participant.stream;
          lastStreamRef.current = participant.stream;
        } else {
          console.log(`Stream already assigned for participant: ${participant.userId}`);
        }

        const videoTracks = participant.stream.getVideoTracks();
        if (videoTracks.length === 0 || !videoTracks[0].enabled || videoTracks[0].readyState !== 'live') {
          console.warn('No valid video tracks to play:', {
            userId: participant.userId,
            tracks: videoTracks.map((track) => ({
              id: track.id,
              enabled: track.enabled,
              readyState: track.readyState,
              label: track.label,
            })),
          });
          setIsStreamLoading(false);
          return;
        }

        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
            .then(() => {
              console.log(`Video playing for participant: ${participant.userId}`);
              setIsStreamLoading(false);
            })
            .catch((error) => {
              console.error('Video play error:', error, { userId: participant.userId });
              setIsStreamLoading(false);
            });
        };
      } else {
        console.warn('Cannot play video: missing videoRef or stream', {
          videoRefExists: !!videoRef.current,
          streamExists: !!participant.stream,
          userId: participant.userId,
        });
        setIsStreamLoading(false);
      }
    };

    if (participant.stream && videoRef.current) {
      console.log(`Setting stream for participant: ${participant.userId}`, {
        username: participant.username,
        isLocal: participant.isLocal ?? isLocal,
        hasStream: !!participant.stream,
        videoEnabled: participant.videoEnabled ?? true,
        isScreenSharing: participant.isScreenSharing ?? false,
        videoTracks: participant.stream.getVideoTracks().map((track) => ({
          id: track.id,
          enabled: track.enabled,
          readyState: track.readyState,
          label: track.label,
        })),
        videoRefReadyState: videoRef.current.readyState,
        videoRefSrcObject: !!videoRef.current.srcObject,
      });
      setIsStreamLoading(true);
      playVideo();

      const videoTracks = participant.stream.getVideoTracks();
      const handleTrackChange = () => {
        console.log('Video track changed for participant:', participant.userId, {
          enabled: videoTracks[0]?.enabled,
          readyState: videoTracks[0]?.readyState,
        });
        if (videoRef.current && participant.stream && (participant.videoEnabled || participant.isScreenSharing)) {
          playVideo();
        } else {
          setIsStreamLoading(false);
        }
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
    } else {
      console.log('Stream not available for participant:', participant.userId, {
        username: participant.username,
        isLocal: participant.isLocal ?? isLocal,
        hasStream: !!participant.stream,
        videoEnabled: participant.videoEnabled ?? true,
        isScreenSharing: participant.isScreenSharing ?? false,
        streamDetails: participant.stream ? {
          videoTracks: participant.stream.getVideoTracks().map((track) => ({
            id: track.id,
            enabled: track.enabled,
            readyState: track.readyState,
            label: track.label,
          })),
          audioTracks: participant.stream.getAudioTracks().map((track) => ({
            id: track.id,
            enabled: track.enabled,
            readyState: track.readyState,
            label: track.label,
          })),
        } : 'No stream',
      });
      setIsStreamLoading(false);
    }
  }, [participant, isLocal]);

  return (
    <div className="video-container relative bg-gray-800">
      <style>
        {`
          .unmirror {
            transform: scaleX(-1) !important;
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
            <div className="text-sm">Loading video...</div>
          </div>
        </div>
      ) : (participant.stream && ((participant.videoEnabled ?? true) || (participant.isScreenSharing ?? false))) ? (
        <>
          <video
            ref={videoRef}
            playsInline
            muted={participant.isLocal ?? isLocal}
            className={`w-full h-full object-cover ${isPinned ? 'pinned-video' : ''} ${
              (participant.isLocal ?? isLocal) && !(participant.isScreenSharing ?? false) ? 'unmirror' : ''
            }`}
          />
          {(participant.isLocal ?? isLocal) && (participant.isScreenSharing ?? false) && localCameraVideoRef && (
            <video
              ref={localCameraVideoRef}
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
              {participant.username || 'Participant'} {participant.isLocal ?? isLocal ? '(You)' : ''}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-3">
        <div className="flex items-center justify-between">
          <span className="text-white text-sm font-medium truncate">
            {participant.username || 'Participant'} {participant.isLocal ?? isLocal ? '(You)' : ''}
            {participant.isHost && <span className="host-badge ml-2">Host</span>}
          </span>
          <div className="flex items-center space-x-1">
            {!(participant.audioEnabled ?? true) && (
              <div className="bg-red-500 p-1 rounded-full" title="Microphone muted">
                <span className="text-white text-xs">🔇</span>
              </div>
            )}
            {!(participant.videoEnabled ?? true) && !(participant.isScreenSharing ?? false) && (
              <div className="bg-gray-600 p-1 rounded-full" title="Camera off">
                <span className="text-white text-xs">📷</span>
              </div>
            )}
            {(participant.isScreenSharing ?? false) && (
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