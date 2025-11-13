import React from 'react';

const MeetingControls = ({
  isAudioMuted,
  toggleAudio,
  isVideoEnabled,
  toggleVideo,
  isSharingScreen,
  handleScreenShare,
  isChatOpen,
  setIsChatOpen,
  isParticipantsOpen,
  setIsParticipantsOpen,
  isAIPopupOpen,
  setIsAIPopupOpen,
  handleExitRoom,
  onCopyInvite,
  scribbleActive,
  onToggleScribble,
}) => {
  return (
    <div className="pro-meeting-controls">
      <div className="pro-controls-left">
        <button
          className={`pro-control-btn pro-control-btn--audio ${isAudioMuted ? 'is-muted' : 'is-unmuted'}`}
          onClick={toggleAudio}
          title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          <span className="pro-control-btn__icon" aria-hidden="true">
            {isAudioMuted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                <path d="M15 10v-1a3 3 0 1 0-6 0v2" />
                <path d="M12 19v3" />
                <line x1="8" y1="19" x2="16" y2="19" />
                <line x1="5" y1="5" x2="19" y2="19" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
                <path d="M19 10a7 7 0 0 1-14 0" />
                <line x1="12" y1="17" x2="12" y2="21" />
                <line x1="8" y1="21" x2="16" y2="21" />
              </svg>
            )}
          </span>
          <span className="pro-control-btn__label">
            {isAudioMuted ? 'Unmute' : 'Mute'}
          </span>
        </button>
        <button
          className={`pro-control-btn ${!isVideoEnabled ? 'pro-control-btn--disabled' : ''}`}
          onClick={toggleVideo}
          title={isVideoEnabled ? 'Stop Video' : 'Start Video'}
        >
          {isVideoEnabled ? '📷' : '🚫'}
        </button>
        <button
          className={`pro-control-btn ${isSharingScreen ? 'pro-control-btn--active' : ''}`}
          onClick={handleScreenShare}
          title={isSharingScreen ? 'Stop Sharing' : 'Share Screen'}
        >
          📺
        </button>
        <button
          className={`pro-control-btn ${scribbleActive ? 'pro-control-btn--active' : ''}`}
          onClick={onToggleScribble}
          title={scribbleActive ? 'Exit Scribble' : 'Scribble'}
        >
          ✏️
        </button>
      </div>
      <div className="pro-controls-center">
        <button
          className={`pro-control-btn ${isChatOpen ? 'pro-control-btn--active' : ''}`}
          onClick={() => {
            setIsChatOpen(!isChatOpen);
            if (!isChatOpen) {
              setIsParticipantsOpen(false); // Close participants when opening chat
            }
          }}
          title="Toggle Chat"
        >
          💬
        </button>
        <button
          className={`pro-control-btn ${isParticipantsOpen ? 'pro-control-btn--active' : ''}`}
          onClick={() => {
            setIsParticipantsOpen(!isParticipantsOpen);
            if (!isParticipantsOpen) {
              setIsChatOpen(false); // Close chat when opening participants
            }
          }}
          title="Toggle Participants"
        >
          👥
        </button>
        <button
          className={`pro-control-btn ${isAIPopupOpen ? 'pro-control-btn--active' : ''}`}
          onClick={() => setIsAIPopupOpen(!isAIPopupOpen)}
          title="Toggle AI Popup"
        >
          🤖
        </button>
      </div>
      <div className="pro-controls-right">
        <button className="pro-control-btn pro-invite-btn" onClick={onCopyInvite} title="Copy Invite Link">
          📋
        </button>
        <button className="pro-control-btn pro-exit-btn" onClick={handleExitRoom} title="Leave Meeting">
          🚪 Leave
        </button>
      </div>
    </div>
  );
};

export default MeetingControls;