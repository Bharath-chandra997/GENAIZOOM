import React from 'react';
import Chat from '../components/Chat';
import Participants from '../components/Participants';

const MeetingSidebar = ({ 
  isChatOpen, 
  isParticipantsOpen, 
  messages, 
  user, 
  onSendMessage, 
  onCloseChat, 
  participants, 
  onCloseParticipants, 
  roomId,
  aiParticipant,
  getUserAvatar,
  AIAvatar,
  onPinParticipant
}) => {
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
          aiParticipant={aiParticipant}
          currentUser={user}
          onClose={onCloseParticipants}
          roomId={roomId}
          getUserAvatar={getUserAvatar}
          AIAvatar={AIAvatar}
          onPinParticipant={onPinParticipant}
        />
      )}
    </div>
  );
};

export default MeetingSidebar;