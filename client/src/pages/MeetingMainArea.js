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
  AIAvatar
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
      if (socketRef.current) {
        socketRef.current.emit('unpin-participant');
      }
    } else {
      setLocalPinnedParticipant(participantId);
      if (socketRef.current) {
        socketRef.current.emit('pin-participant', { participantId });
      }
    }
  };

  // Get participants for current grid page
  const getCurrentPageParticipants = () => {
    const startIndex = gridPage * 4;
    const endIndex = startIndex + 4;
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
              ref={video => setVideoRef(participant, video)}
              autoPlay
              muted={participant.isLocal}
              className={`pro-video-element ${
                participant.isLocal && isMirroringBrowser ? 'pro-video-element--mirrored' : ''
              }`}
            />
          ) : isAI ? (
            <div className="pro-ai-visualization">
              <canvas ref={aiCanvasRef} className="pro-ai-canvas" />
              {(aiUploadedImage || aiUploadedAudio || aiResponse) && (
                <div className="pro-ai-content-display">
                  {aiUploadedImage && (
                    <img src={aiUploadedImage} alt="AI processed content" className="pro-ai-uploaded-image" />
                  )}
                  {aiUploadedAudio && (
                    <audio controls src={aiUploadedAudio} className="pro-ai-uploaded-audio" />
                  )}
                  {aiResponse && (
                    <div className="pro-ai-response-display">
                      {aiResponse}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="pro-video-placeholder">
              {getUserAvatar(participant, 80)}
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
            {isAI && (
              <div className="pro-ai-status">
                <div className={`pro-ai-pulse ${aiBotInUse ? 'pro-ai-pulse--busy' : ''}`} />
                <span>
                  {aiBotInUse ? `In use by ${currentAIUser}` : 'Ready to help'}
                </span>
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
    const screenSharer = participants.find(p => p.isScreenSharing);
    const otherParticipants = participants.filter(p => !p.isScreenSharing && p.userId !== screenSharer?.userId);

    if (!screenSharer) return null;

    return (
      <div className="pro-screenshare-view">
        <div className="pro-screenshare-main">
          {renderParticipantVideo(screenSharer, 0)}
        </div>
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
      <div className={`pro-video-grid pro-video-grid--${participantCount}`}>
        {currentParticipants.map((participant, index) => (
          <div
            key={participant.userId}
            className={`pro-video-grid-item pro-video-grid-item--${index + 1}`}
            style={{ gridArea: participantCount === 3 && index === 2 ? 'video3' : undefined }}
          >
            {renderParticipantVideo(participant, index)}
          </div>
        ))}
      </div>
    );
  };

  // Render annotation toolbar
  const renderAnnotationToolbar = () => (
    <div
      className="pro-annotation-toolbar"
      style={{
        left: `${toolbarPosition.x}px`,
        top: `${toolbarPosition.y}px`,
      }}
    >
      <div className="pro-toolbar-handle" onMouseDown={handleToolbarMouseDown}>
        🎨
      </div>
      <div className="pro-toolbar-tools">
        <button
          className={`pro-tool-btn ${currentTool === 'pen' ? 'pro-tool-btn--active' : ''}`}
          title="Pen"
        >
          ✏️
        </button>
        <button
          className={`pro-tool-btn ${currentTool === 'eraser' ? 'pro-tool-btn--active' : ''}`}
          title="Eraser"
        >
          🧹
        </button>
        <button
          className={`pro-tool-btn ${currentTool === 'rectangle' ? 'pro-tool-btn--active' : ''}`}
          title="Rectangle"
        >
          ⬜
        </button>
        <button
          className={`pro-tool-btn ${currentTool === 'circle' ? 'pro-tool-btn--active' : ''}`}
          title="Circle"
        >
          ⭕
        </button>
        <div className="pro-brush-size">
          Size: {currentBrushSize}px
        </div>
      </div>
    </div>
  );

  // Render pagination controls
  const renderPagination = () => {
    if (totalGridPages <= 1) return null;

    return (
      <div className="pro-grid-pagination">
        <button
          onClick={() => handleSwipe(-1)}
          disabled={gridPage === 0}
          className="pro-pagination-btn"
        >
          ← Previous
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
          className="pro-pagination-btn"
        >
          Next →
        </button>
      </div>
    );
  };

  return (
    <div className="pro-mainarea">
      {/* Toolbar Strip */}
      <div className="pro-mainarea-toolbar-strip">
        <div className="pro-toolbar-left">
          <span className="pro-meeting-info">
            {realParticipants.length} {realParticipants.length === 1 ? 'participant' : 'participants'} online
          </span>
        </div>
        
        <div className="pro-toolbar-center">
          <button className="pro-toolbar-btn" title="Raise hand">
            ✋
          </button>
          <button className="pro-toolbar-btn" title="Share screen">
            📺
          </button>
          <button className="pro-toolbar-btn" title="Record meeting">
            ⏺️
          </button>
        </div>
        
        <div className="pro-toolbar-right">
          <button 
            className="pro-exit-meeting-btn"
            onClick={handleExitRoom}
            title="Leave meeting"
          >
            Leave Meeting
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="pro-mainarea-grid">
        <canvas
          ref={annotationCanvasRef}
          className="pro-annotation-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        
        {isSomeoneScreenSharing ? renderScreenShareView() : renderGridView()}
        
        {renderPagination()}
      </div>

      {/* Annotation Toolbar */}
      {renderAnnotationToolbar()}
    </div>
  );
};

export default MeetingMainArea;