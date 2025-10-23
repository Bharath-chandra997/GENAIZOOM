import React, { useState, useEffect, useRef } from 'react';
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
    if (element && participant.stream) {
      videoRefs.current.set(participant.userId, element);
      element.srcObject = participant.stream;
    }
  };

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
      <div
        key={participant.userId || `participant-${index}`}
        className={`pro-video-frame ${
          isPinned ? 'pro-video-frame--pinned' : ''
        } ${isAI ? 'pro-video-frame--ai' : ''} ${
          isScreenSharing ? 'pro-video-frame--screen-share' : ''
        }`}
        onClick={() => !isAI && handlePinParticipant(participant.userId)}
      >
        <div className="pro-video-container">
          {hasVideo && !isAI ? (
            <video
              ref={(video) => setVideoRef(participant, video)}
              autoPlay
              muted={participant.isLocal}
              className={videoClass}
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
      </div>
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
          <div className="pro-screenshare-participants">
            {otherParticipants.slice(0, 4).map((participant, index) => (
              <div key={participant.userId} className="pro-screenshare-participant">
                {renderParticipantVideo(participant, index)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render grid view
  const renderGridView = () => {
    const currentParticipants = getCurrentPageParticipants();
    const participantCount = currentParticipants.length;

    return (
      <div className="pro-video-grid-container" style={{ transform: `translateX(-${gridPage * 100}%)` }}>
        {Array.from({ length: totalGridPages }, (_, pageIndex) => {
          const pageParticipants = participants.slice(pageIndex * 3, (pageIndex + 1) * 3);
          return (
            <div key={pageIndex} className="pro-video-grid-page">
              {pageParticipants.map((participant, index) => (
                <div
                  key={participant.userId}
                  className={`pro-video-grid-item pro-video-grid-item--${index + 1}`}
                >
                  {renderParticipantVideo(participant, index)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  };

  // Render pagination controls
  const renderPagination = () => {
    if (totalGridPages <= 1) return null;

    return (
      <div className="pro-grid-pagination">
        <button
          onClick={() => handleSwipe(-1)}
          disabled={gridPage === 0}
          className="pro-pagination-btn pro-pagination-btn--left"
          title="Previous page"
        >
          ←
        </button>

        <div className="pro-grid-dots">
          {Array.from({ length: totalGridPages }, (_, i) => (
            <button
              key={i}
              onClick={() => setGridPage(i)}
              className={`pro-grid-dot ${gridPage === i ? 'pro-grid-dot--active' : ''}`}
              title={`Page ${i + 1}`}
            />
          ))}
        </div>

        <button
          onClick={() => handleSwipe(1)}
          disabled={gridPage === totalGridPages - 1}
          className="pro-pagination-btn pro-pagination-btn--right"
          title="Next page"
        >
          →
        </button>
      </div>
    );
  };

  return (
    <div className="pro-mainarea">
      <div className="pro-mainarea-grid">
        {isSomeoneScreenSharing ? renderScreenShareView() : renderGridView()}
        {renderPagination()}
      </div>
    </div>
  );
};

export default MeetingMainArea;