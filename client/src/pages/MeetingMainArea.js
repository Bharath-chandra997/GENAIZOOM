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
  drawingCanvasComponent,
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
    // Calculate start and end indices for current page
    const startIndex = gridPage * 3;
    const endIndex = startIndex + 3;
    
    // Get the participants for the current page
    const pageParticipants = participants.slice(startIndex, endIndex);
    
    // Ensure we don't exceed 3 participants per page
    if (pageParticipants.length > 3) {
      return pageParticipants.slice(0, 3);
    }
    
    return pageParticipants;
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

    // No mirroring - all videos appear in natural orientation
    let videoClass = 'pro-video-element';

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
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: '8px',
                display: 'block',
                margin: '0',
                padding: '0',
                transform: 'scaleX(-1)'
              }}
            />
          ) : isAI ? (
            <div className="pro-ai-visualization">
              {/* AI Logo/Avatar Display */}
              <div className="pro-ai-logo-container">
                <AIAvatar size={120} />
                <div className="pro-ai-ready-text">
                  Ready to help
                </div>
              </div>
              
              {/* Canvas for animations */}
              <canvas ref={aiCanvasRef} className="pro-ai-canvas" />
              
              {/* Content Display when processing */}
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
                    <div className="pro-ai-response-display"><span style={{fontWeight:'700'}}>AI Answer:</span> {aiResponse}</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="pro-video-placeholder">
              {(() => {
                // Debug: Log participant data
                console.log('Participant data:', {
                  userId: participant.userId,
                  username: participant.username,
                  isLocal: participant.isLocal,
                  profilePicture: participant.profilePicture,
                  hasVideo: hasVideo,
                  videoEnabled: participant.videoEnabled
                });
                
                // Check if participant has a profilePicture URL string
                if (participant.profilePicture && typeof participant.profilePicture === 'string') {
                  return (
                    <img 
                      src={participant.profilePicture} 
                      alt={participant.username}
                      style={{
                        width: '120px',
                        height: '120px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '3px solid rgba(59, 130, 246, 0.5)',
                        display: 'block',
                        margin: '0 auto',
                        padding: '0',
                        transform: 'scaleX(-1)'
                      }}
                    />
                  );
                }
                // Otherwise use the avatar generation function
                return getUserAvatar(participant, 80);
              })()}
            </div>
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
        <div className="pro-screenshare-main">
          {renderParticipantVideo(screenSharer, 0)}
          {drawingCanvasComponent && <div className="drawing-canvas-wrapper">{drawingCanvasComponent}</div>}
        </div>
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

  // Get responsive grid layout based on participant count - Fill entire container
  const getGridLayout = (participantCount) => {
    if (participantCount <= 0) {
      return {
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr',
        width: '100vw',
      };
    } else if (participantCount === 1) {
      return {
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr',
        width: '100vw',
        maxWidth: '100vw',
      };
    } else if (participantCount === 2) {
      return {
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr',
        width: '100vw',
        gap: '4px',
      };
    } else if (participantCount === 3) {
      return {
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: '1fr',
        width: '100vw',
        gap: '4px',
      };
    } else {
      // For 4+ participants, use 3 columns with pagination
      return {
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: '1fr',
        width: '100vw',
        gap: '4px',
      };
    }
  };

  // Render responsive grid view
  const renderGridView = () => {
    const currentPageParticipants = getCurrentPageParticipants();
    
    // Sort participants: AI first (on the left), then real users
    const sortedParticipants = [...currentPageParticipants].sort((a, b) => {
      if (a.userId === 'ai-assistant') return -1; // AI goes first
      if (b.userId === 'ai-assistant') return 1;
      return 0;
    });
    
    // Count total participants including AI for layout
    const totalParticipantCount = sortedParticipants.length;
    const gridLayout = getGridLayout(totalParticipantCount);

    
    return (
      <motion.div 
        className={`pro-video-grid-responsive pro-video-grid--${totalParticipantCount}`}
        style={{
          ...gridLayout,
          display: 'grid',
          width: '100vw',
          height: '100%'
        }}
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <AnimatePresence mode="popLayout">
          {sortedParticipants.map((participant, index) => (
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
              whileTap={{ scale: 0.98 }}
              className="pro-video-grid-item-responsive"
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
      
      {/* Pagination Controls */}
      {!isSomeoneScreenSharing && totalGridPages > 1 && participants.length > 3 && (
        <div className="pro-grid-pagination">
          <button
            className="pro-pagination-btn"
            onClick={() => setGridPage((prev) => Math.max(0, prev - 1))}
            disabled={gridPage === 0}
          >
            ← Previous
          </button>
          <div className="pro-grid-dots">
            {Array.from({ length: totalGridPages }).map((_, index) => (
              <button
                key={index}
                className={`pro-grid-dot ${gridPage === index ? 'pro-grid-dot--active' : ''}`}
                onClick={() => setGridPage(index)}
              />
            ))}
          </div>
          <button
            className="pro-pagination-btn"
            onClick={() => setGridPage((prev) => Math.min(totalGridPages - 1, prev + 1))}
            disabled={gridPage === totalGridPages - 1}
          >
            Next →
          </button>
        </div>
      )}
    </motion.div>
  );
};

export default MeetingMainArea;