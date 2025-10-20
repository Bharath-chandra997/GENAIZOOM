import React from 'react';

const MeetingHeader = ({ roomId, participants }) => {
  return (
    <div className="bg-gray-900 px-2 py-1 flex items-center justify-between z-20">
      <h1 className="text-lg font-semibold">Meeting: {roomId}</h1>
      <span>Participants: {participants.length}</span>
    </div>
  );
};

export default MeetingHeader;