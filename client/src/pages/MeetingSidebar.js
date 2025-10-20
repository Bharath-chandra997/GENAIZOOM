import React from 'react';
import Chat from '../components/Chat';
import Participants from '../components/Participants';

const MeetingSidebar = ({ isChatOpen, isParticipantsOpen, messages, user, onSendMessage, onCloseChat, participants, onCloseParticipants, roomId }) => {
  return (
    <div
      className={`bg-gray-900 border-l border-gray-700 transition-all duration-300 ${isChatOpen || isParticipantsOpen ? 'w-80' : 'w-0'} overflow-hidden`}
    >
      {isChatOpen && (
        <Chat
          messages={messages}
          onSendMessage={(message) => {
            const payload = { message, username: user.username, timestamp: new Date().toISOString() };
            onSendMessage(payload);
          }}
          currentUser={user}
          onClose={onCloseChat}
        />
      )}
      {isParticipantsOpen && (
        <Participants
          participants={participants}
          currentUser={user}
          onClose={onCloseParticipants}
          roomId={roomId}
        />
      )}
    </div>
  );
};

export default MeetingSidebar;