// MeetingMainArea.jsx
import React from 'react';

const MeetingMainArea = ({
  participants,
  isSomeoneScreenSharing,
  toolbarPosition,
  currentTool,
  currentBrushSize,
  handleToolbarMouseDown,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleSwipe,
  gridPage,
  totalGridPages,
  pinnedParticipantId,
  isMirroringBrowser,
  socketRef,
  handleExitRoom,
  aiCanvasRef
}) => {
  const renderVideoFrame = (participant, index) => {
    const isAI = participant.isAI;
    const isPinned = participant.userId === pinnedParticipantId;
    const isActive = participant.userId === participants[0]?.userId;

    return (
      <div
        key={participant.userId}
        className={`pro-video-frame ${isPinned ? 'pro-video-frame--pinned' : ''} ${isActive ? 'pro-video-frame--active' : ''} ${isAI ? 'pro-video-frame--ai' : ''}`}
      >
        <div className="pro-video-container">
          {isAI ? (
            // AI Visualization
            <div className="pro-ai-visualization">
              <div className="pro-ai-animation">
                {/* AI animation will be handled by the canvas in parent */}
              </div>
              <div className="pro-ai-status">
                <div className="pro-ai-pulse"></div>
                <span>AI Ready</span>
              </div>
            </div>
          ) : participant.stream ? (
            // Regular participant video
            <video
              className={`pro-video-element ${isMirroringBrowser && participant.isLocal ? 'pro-video-element--mirrored' : ''}`}
              autoPlay
              playsInline
              muted={participant.isLocal}
              ref={videoEl => {
                if (videoEl && participant.stream) {
                  videoEl.srcObject = participant.stream;
                }
              }}
            />
          ) : (
            // No video available
            <div className="pro-no-video">
              <div 
                className="pro-avatar"
                style={{ backgroundColor: getColorForId(participant.userId) }}
              >
                {participant.username.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
        </div>

        <div className="pro-participant-info">
          <span className="pro-participant-name">
            {participant.username}
            {participant.isLocal && ' (You)'}
          </span>
          <div className="pro-participant-badges">
            {participant.isHost && <span className="pro-participant-badge pro-participant-badge--host">Host</span>}
            {participant.isLocal && <span className="pro-participant-badge pro-participant-badge--you">You</span>}
            {isAI && <span className="pro-participant-badge pro-participant-badge--ai">AI</span>}
          </div>
        </div>

        <div className="pro-status-indicators">
          {!participant.audioEnabled && (
            <div className="pro-status-icon pro-status-icon--muted" title="Audio Muted">
              🔊
            </div>
          )}
          {!participant.videoEnabled && (
            <div className="pro-status-icon pro-status-icon--video-off" title="Video Off">
              📹
            </div>
          )}
          {participant.isScreenSharing && (
            <div className="pro-status-icon pro-status-icon--screen-share" title="Sharing Screen">
              🖥️
            </div>
          )}
        </div>
      </div>
    );
  };

  const getGridClass = () => {
    const count = participants.length;
    if (count === 1) return 'pro-video-grid--1';
    if (count === 2) return 'pro-video-grid--2';
    if (count === 3) return 'pro-video-grid--3';
    if (count === 4) return 'pro-video-grid--4';
    return 'pro-video-grid--5-plus';
  };

  const visibleParticipants = participants.slice(gridPage * 4, (gridPage + 1) * 4);

  return (
    <div className="pro-mainarea">
      <div className="pro-mainarea-toolbar-strip">
        <div className="pro-meeting-info">
          <span>Meeting in progress</span>
          <span className="pro-participant-count">{participants.length} participants</span>
        </div>
        <div className="pro-toolbar-controls">
          <button onClick={() => handleSwipe(-1)} disabled={gridPage === 0}>
            Previous
          </button>
          <button onClick={() => handleSwipe(1)} disabled={gridPage >= totalGridPages - 1}>
            Next
          </button>
        </div>
      </div>

      <div className="pro-mainarea-grid">
        <div className={`pro-video-grid ${getGridClass()}`}>
          {visibleParticipants.map((participant, index) => 
            renderVideoFrame(participant, index)
          )}
        </div>

        {totalGridPages > 1 && (
          <div className="pro-grid-pagination">
            <button onClick={() => handleSwipe(-1)} disabled={gridPage === 0}>
              ‹
            </button>
            <div className="pro-grid-dots">
              {Array.from({ length: totalGridPages }, (_, i) => (
                <div
                  key={i}
                  className={`pro-grid-dot ${i === gridPage ? 'pro-grid-dot--active' : ''}`}
                  onClick={() => setGridPage(i)}
                />
              ))}
            </div>
            <button onClick={() => handleSwipe(1)} disabled={gridPage >= totalGridPages - 1}>
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MeetingMainArea;