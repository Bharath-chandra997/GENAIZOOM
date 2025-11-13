// src/components/MeetingControls.js
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
        {/* MUTE / UNMUTE BUTTON - FIXED + ICON RESTORED */}
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
              // Mic OFF (muted)
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
              // Mic ON (unmuted)
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

        {/* VIDEO TOGGLE - ICON RESTORED */}
        <button
          className={`pro-control-btn ${!isVideoEnabled ? 'pro-control-btn--disabled' : ''}`}
          onClick={toggleVideo}
          title={isVideoEnabled ? 'Stop Video' : 'Start Video'}
        >
          <span className="pro-control-btn__icon" aria-hidden="true">
            {isVideoEnabled ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="6" width="14" height="12" rx="2" />
                <path d="M18 10l4-3v10l-4-3" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="6" width="14" height="12" rx="2" />
                <path d="M18 10l4-3v10l-4-3" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            )}
          </span>
          <span className="pro-control-btn__label">
            {isVideoEnabled ? 'Stop Video' : 'Start Video'}
          </span>
        </button>

        {/* SCREEN SHARE - ICON RESTORED */}
        <button
          className={`pro-control-btn ${isSharingScreen ? 'pro-control-btn--active' : ''}`}
          onClick={handleScreenShare}
          title={isSharingScreen ? 'Stop Sharing' : 'Share Screen'}
        >
          <span className="pro-control-btn__icon" aria-hidden="true">
            {isSharingScreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="14" rx="2" />
                <path d="M8 21h8" />
                <path d="M12 17v4" />
                <path d="M3 10h18" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="14" rx="2" />
                <path d="M8 21h8" />
                <path d="M12 17v4" />
              </svg>
            )}
          </span>
          <span className="pro-control-btn__label">
            {isSharingScreen ? 'Stop Share' : 'Share'}
          </span>
        </button>

        {/* SCRIBBLE - ICON RESTORED */}
        <button
          className={`pro-control-btn ${scribbleActive ? 'pro-control-btn--active' : ''}`}
          onClick={onToggleScribble}
          title={scribbleActive ? 'Exit Scribble' : 'Scribble'}
        >
          <span className="pro-control-btn__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5l4 4L7 21l-4 1 1-4 13.5-13.5z" />
            </svg>
          </span>
          <span className="pro-control-btn__label">
            {scribbleActive ? 'Exit' : 'Scribble'}
          </span>
        </button>
      </div>

      <div className="pro-controls-center">
        {/* CHAT - ICON RESTORED */}
        <button
          className={`pro-control-btn ${isChatOpen ? 'pro-control-btn--active' : ''}`}
          onClick={() => {
            setIsChatOpen(!isChatOpen);
            if (!isChatOpen) setIsParticipantsOpen(false);
          }}
          title="Toggle Chat"
        >
          <span className="pro-control-btn__icon" aria-hidden="true">Chat</span>
          <span className="pro-control-btn__label">Chat</span>
        </button>

        {/* PARTICIPANTS - ICON RESTORED */}
        <button
          className={`pro-control-btn ${isParticipantsOpen ? 'pro-control-btn--active' : ''}`}
          onClick={() => {
            setIsParticipantsOpen(!isParticipantsOpen);
            if (!isParticipantsOpen) setIsChatOpen(false);
          }}
          title="Toggle Participants"
        >
          <span className="pro-control-btn__icon" aria-hidden="true">People</span>
          <span className="pro-control-btn__label">People</span>
        </button>

        {/* AI - ICON RESTORED */}
        <button
          className={`pro-control-btn ${isAIPopupOpen ? 'pro-control-btn--active' : ''}`}
          onClick={() => setIsAIPopupOpen(!isAIPopupOpen)}
          title="Toggle AI Popup"
        >
          <span className="pro-control-btn__icon" aria-hidden="true">AI</span>
          <span className="pro-control-btn__label">AI</span>
        </button>
      </div>

      <div className="pro-controls-right">
        {/* COPY INVITE - ICON RESTORED */}
        <button
          className="pro-control-btn pro-invite-btn"
          onClick={onCopyInvite}
          title="Copy Invite Link"
        >
          <span className="pro-control-btn__icon" aria-hidden="true">Clipboard</span>
          <span className="pro-control-btn__label">Invite</span>
        </button>

        {/* LEAVE MEETING - ICON RESTORED */}
        <button
          className="pro-control-btn pro-exit-btn"
          onClick={handleExitRoom}
          title="Leave Meeting"
        >
          <span className="pro-control-btn__icon" aria-hidden="true">Door</span>
          <span className="pro-control-btn__label">Leave</span>
        </button>
      </div>
    </div>
  );
};

export default MeetingControls;