import React from 'react';
const MeetingHeader = ({ 
  roomId, 
  participants = [], 
  realParticipantsCount = 0,
  onCopyInvite 
}) => {
  const meetingTitle = "Team Meeting"; // You can make this dynamic based on room purpose
  
  return (
    <div className="pro-meeting-header">
      <div className="pro-meeting-header__left">
        <div className="pro-meeting-title">
          <h1 className="pro-meeting-title__main">{meetingTitle}</h1>
          <div className="pro-meeting-title__subtitle">
            <span className="pro-room-id">Room: {roomId}</span>
            <span className="pro-participants-count">
              {realParticipantsCount} {realParticipantsCount === 1 ? 'participant' : 'participants'}
            </span>
          </div>
        </div>
      </div>
      
      <div className="pro-meeting-header__right">
        <button 
          className="pro-invite-button"
          onClick={onCopyInvite}
          title="Copy invite link"
        >
          <span className="pro-invite-button__icon">📋</span>
          <span className="pro-invite-button__text">Invite</span>
        </button>
      </div>
    </div>
  );
};

export default MeetingHeader;