import React from 'react';

const MeetingHeader = ({ roomId, participants }) => {
  return (
    <div className="pro-meeting-header">
      <div className="pro-header-left">
        <h2 className="pro-room-id">Room: {roomId}</h2>
      </div>
      <div className="pro-header-right">
        <span className="pro-participant-count">
          {participants.length} participants
        </span>
      </div>
    </div>
  );
};

export default MeetingHeader;