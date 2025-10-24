import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './MeetingMainArea.css';

const MeetingMainArea = ({
  participants = [],
  realParticipants = [],
  isSomeoneScreenSharing = false,
  toolbarPosition = { x: 20, y: 20 },
  currentTool = 'pen',
  currentBrushSize = 5,
  handleToolbarMouseDown,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleSwipe,
  gridPage = 0,
  totalGridPages = 1,
  pinnedParticipantId = null,
  isMirroringBrowser = false,
  socketRef,
  handleExitRoom,
  aiCanvasRef,
  setGridPage,
  aiBotInUse = false,
  currentAIUser = null,
  aiResponse = '',
  aiUploadedImage = null,
  aiUploadedAudio = null,
  getUserAvatar,
  AIAvatar,
  onPinParticipant,
  onUnpinParticipant,
  onAIReset,
}) => {
  const [localPinnedParticipant, setLocalPinnedParticipant] = useState(pinnedParticipantId);
  const annotationCanvasRef = useRef(null);
  const videoRefs = useRef(new Map());

  // Update local pinned participant when prop changes
  useEffect(() => {
    setLocalPinnedParticipant(pinnedParticipantId);
  }, [pinnedParticipantId]);

  // Handle pin/unpin participant
  const handlePinParticipant = (participantId) => {
    if (localPinnedParticipant === participantId) {
      setLocalPinnedParticipant(null);
      onUnpinParticipant();
    } else {
      setLocalPinnedParticipant(participantId);
      onPinParticipant(participantId);
    }
  };

  // Get participants for current grid page
  const getCurrentPageParticipants = () => {
    const startIndex = gridPage * 3; // Changed from 4 to 3
    const endIndex = startIndex + 3; // Changed from 4 to 3
    return participants.slice(startIndex, endIndex);
  };

  // Handle video element reference
  const setVideoRef = (participant, element) => {
    if (element) {
      videoRefs.current.set(participant.userId, element);
      if (participant.stream) {
        element.srcObject = participant.stream;
      }
    }
  };

  // Update video streams when participants change
  useEffect(() => {
    participants.forEach(participant => {
      const videoElement = videoRefs.current.get(participant.userId);
      if (videoElement && participant.stream && videoElement.srcObject !== participant.stream) {
        videoElement.srcObject = participant.stream;
      }
    });
  }, [participants]);

  // Render participant video frame
  const renderParticipantVideo = (participant, index) => {
    const isAI = participant.userId === 'ai-assistant';
    const isPinned = localPinnedParticipant === participant.userId;
    const hasVideo = participant.videoEnabled && participant.stream;
    const isScreenSharing = participant.isScreenSharing;

    // Fixed mirroring logic: Always mirror local (unless iOS Safari already does), never mirror remote
    let videoClass = 'pro-video-element';
    if (participant.isLocal && !isMirroringBrowser) {
      videoClass += ' pro-video-element--mirrored';
    }

    return (
      <motion.div
        key={participant.userId || `participant-${index}`}
        className={`pro-video-frame ${
          isPinned ? 'pro-video-frame--pinned' : ''
        } ${isAI ? 'pro-video-frame--ai' : ''} ${
          isScreenSharing ? 'pro-video-frame--screen-share' : ''
        }`}
        onClick={() => !isAI && handlePinParticipant(participant.userId)}
        layout
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="pro-video-container">
          {hasVideo && !isAI ? (
            <video
              ref={(video) => setVideoRef(participant, video)}
              autoPlay
              muted={participant.isLocal}
              playsInline
              className={videoClass}
              key={`video-${participant.userId}-${participant.stream ? 'stream' : 'no-stream'}`}
            />
          ) : isAI ? (
            <div className="pro-ai-visualization">
              <canvas ref={aiCanvasRef} className="pro-ai-canvas" />
              {(aiUploadedImage || aiUploadedAudio || aiResponse) && (
                <div className="pro-ai-content-display">
                  <button
                    className="pro-ai-reset-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAIReset && onAIReset();
                    }}
                    title="Clear AI results"
                  >
                    ×
                  </button>
                  {aiUploadedImage && (
                    <img src={aiUploadedImage} alt="AI processed content" className="pro-ai-uploaded-image" />
                  )}
                  {aiUploadedAudio && (
                    <audio controls src={aiUploadedAudio} className="pro-ai-uploaded-audio" />
                  )}
                  {aiResponse && (
                    <div className="pro-ai-response-display">{aiResponse}</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="pro-video-placeholder">{getUserAvatar(participant, 80)}</div>
          )}
        </div>

        <div className="pro-participant-info">
          <div className="pro-participant-name">
            {participant.username}
            {participant.isLocal && !isAI && ' (You)'}
            {participant.isHost && ' 👑'}
            {isAI && ' 🤖'}
            {isScreenSharing && ' 📺'}
          </div>

          <div className="pro-status-indicators">
            {!participant.audioEnabled && !isAI && (
              <div className="pro-status-icon pro-status-icon--muted" title="Audio muted">
                🔇
              </div>
            )}
            {!participant.videoEnabled && !isAI && (
              <div className="pro-status-icon pro-status-icon--video-off" title="Video off">
                🚫
              </div>
            )}
            {isAI && (
              <div className="pro-ai-status">
                <div className={`pro-ai-pulse ${aiBotInUse ? 'pro-ai-pulse--busy' : ''}`} />
                <span>{aiBotInUse ? `In use by ${currentAIUser}` : 'Ready to help'}</span>
              </div>
            )}
            {isPinned && !isAI && (
              <div className="pro-status-icon pro-status-icon--pinned" title="Pinned">
                📌
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  // Render screen share view
  const renderScreenShareView = () => {
    const screenSharer = participants.find((p) => p.isScreenSharing);
    const otherParticipants = participants.filter((p) => !p.isScreenSharing && p.userId !== screenSharer?.userId);

    if (!screenSharer) return null;

    return (
      <div className="pro-screenshare-view">
        <div className="pro-screenshare-main">{renderParticipantVideo(screenSharer, 0)}</div>
        {otherParticipants.length > 0 && (
          <motion.div 
            className="pro-screenshare-participants"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {otherParticipants.slice(0, 4).map((participant, index) => (
              <motion.div 
                key={participant.userId} 
                className="pro-screenshare-participant"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                {renderParticipantVideo(participant, index)}
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    );
  };

  // Get responsive grid layout based on participant count
  const getGridLayout = (participantCount) => {
    if (participantCount === 1) {
      return {
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr',
        maxWidth: '600px',
        maxHeight: '400px'
      };
    } else if (participantCount === 2) {
      return {
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr',
        maxWidth: '800px',
        maxHeight: '400px'
      };
    } else if (participantCount === 3) {
      return {
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gridTemplateAreas: '"video1 video2" "video3 video3"',
        maxWidth: '800px',
        maxHeight: '600px'
      };
    } else if (participantCount === 4) {
      return {
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        maxWidth: '800px',
        maxHeight: '600px'
      };
    } else {
      // 5+ participants - use a responsive grid
      const cols = Math.ceil(Math.sqrt(participantCount));
      const rows = Math.ceil(participantCount / cols);
      return {
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        maxWidth: '100%',
        maxHeight: '100%'
      };
    }
  };

  // Render responsive grid view
  const renderGridView = () => {
    const participantCount = participants.length;
    const gridLayout = getGridLayout(participantCount);

    return (
      <motion.div 
        className="pro-video-grid-responsive"
        style={gridLayout}
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <AnimatePresence mode="popLayout">
          {participants.map((participant, index) => (
            <motion.div
              key={participant.userId}
              layout
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -20 }}
              transition={{ 
                duration: 0.4, 
                delay: index * 0.1,
                ease: "easeOut"
              }}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="pro-video-grid-item-responsive"
              style={participantCount === 3 && index === 2 ? { gridArea: 'video3' } : {}}
            >
              {renderParticipantVideo(participant, index)}
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <motion.div 
      className="pro-mainarea"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div 
        className="pro-mainarea-grid"
        layout
        transition={{ duration: 0.3 }}
      >
        {isSomeoneScreenSharing ? renderScreenShareView() : renderGridView()}
      </motion.div>
    </motion.div>
  );
};

export default MeetingMainArea;