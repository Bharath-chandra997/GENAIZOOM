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
          className={`pro-control-btn ${isAudioMuted ? 'pro-control-btn--muted' : ''}`}
          onClick={toggleAudio}
          title={isAudioMuted ? 'Unmute' : 'Mute'}
        >
          {isAudioMuted ? '🔇' : '🎤'}
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