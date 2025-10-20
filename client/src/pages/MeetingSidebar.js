import React from 'react';
import Chat from '../components/Chat';
import Participants from '../components/Participants';

const MeetingSidebar = ({ isChatOpen, isParticipantsOpen, messages, user, onSendMessage, onCloseChat, participants, onCloseParticipants, roomId }) => {
  return (
    <div
      className={`pro-sidebar ${isChatOpen || isParticipantsOpen ? 'w-[450px]' : 'w-0'}`}
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