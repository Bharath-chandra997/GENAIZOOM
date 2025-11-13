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
        {/* MUTE / UNMUTE BUTTON - FULLY FIXED */}
        <button
          className={`pro-control-btn pro-control-btn--audio ${
            isAudioMuted ? 'is-muted' : 'is-unmuted'
          }`}
          onClick={toggleAudio}
          title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
          aria-label={isAudioMuted ? 'Unmute' : 'Mute'}
        >
          <span className="pro-control-btn__icon" aria-hidden="true">
            {isAudioMuted ? (
              // MUTED: Mic with slash
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              // UNMUTED: Normal mic
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </span>
          <span className="pro-control-btn__label">
            {isAudioMuted ? 'Unmute' : 'Mute'}
          </span>
        </button>

        {/* ALL OTHER BUTTONS - UNCHANGED (EMOJI ICONS) */}
        <button
          className={`pro-control-btn ${!isVideoEnabled ? 'pro-control-btn--disabled' : ''}`}
          onClick={toggleVideo}
          title={isVideoEnabled ? 'Stop Video' : 'Start Video'}
        >
          {isVideoEnabled ? 'Camera' : 'No camera'}
        </button>
        <button
          className={`pro-control-btn ${isSharingScreen ? 'pro-control-btn--active' : ''}`}
          onClick={handleScreenShare}
          title={isSharingScreen ? 'Stop Sharing' : 'Share Screen'}
        >
          TV
        </button>
        <button
          className={`pro-control-btn ${scribbleActive ? 'pro-control-btn--active' : ''}`}
          onClick={onToggleScribble}
          title={scribbleActive ? 'Exit Scribble' : 'Scribble'}
        >
          Pencil
        </button>
      </div>

      <div className="pro-controls-center">
        <button
          className={`pro-control-btn ${isChatOpen ? 'pro-control-btn--active' : ''}`}
          onClick={() => {
            setIsChatOpen(!isChatOpen);
            if (!isChatOpen) setIsParticipantsOpen(false);
          }}
          title="Toggle Chat"
        >
          Chat
        </button>
        <button
          className={`pro-control-btn ${isParticipantsOpen ? 'pro-control-btn--active' : ''}`}
          onClick={() => {
            setIsParticipantsOpen(!isParticipantsOpen);
            if (!isParticipantsOpen) setIsChatOpen(false);
          }}
          title="Toggle Participants"
        >
          People
        </button>
        <button
          className={`pro-control-btn ${isAIPopupOpen ? 'pro-control-btn--active' : ''}`}
          onClick={() => setIsAIPopupOpen(!isAIPopupOpen)}
          title="Toggle AI Popup"
        >
          AI
        </button>
      </div>

      <div className="pro-controls-right">
        <button className="pro-control-btn pro-invite-btn" onClick={onCopyInvite} title="Copy Invite Link">
          Clipboard
        </button>
        <button className="pro-control-btn pro-exit-btn" onClick={handleExitRoom} title="Leave Meeting">
          Door Leave
        </button>
      </div>
    </div>
  );
};

export default MeetingControls;