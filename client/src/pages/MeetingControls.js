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
  handleExitRoom,
}) => {
  return (
    <div className="bg-gray-900 border-t border-gray-700 px-2 py-1 flex justify-center gap-1 z-20 sticky bottom-0">
      <button onClick={toggleAudio} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">
        {isAudioMuted ? 'Unmute 🎤' : 'Mute 🔇'}
      </button>
      <button onClick={toggleVideo} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">
        {isVideoEnabled ? 'Stop Video 📷' : 'Start Video 📹'}
      </button>
      <button onClick={handleScreenShare} className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600">
        {isSharingScreen ? 'Stop Sharing' : 'Share Screen 🖥️'}
      </button>
      <button
        onClick={() => { setIsChatOpen(!isChatOpen); setIsParticipantsOpen(false); }}
        className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600"
      >
        Chat 💬
      </button>
      <button
        onClick={() => { setIsParticipantsOpen(!isParticipantsOpen); setIsChatOpen(false); }}
        className="p-2 rounded text-white bg-gray-700 hover:bg-gray-600"
      >
        Participants 👥
      </button>
      <button onClick={handleExitRoom} className="p-2 rounded text-white bg-red-600 hover:bg-red-500">
        Exit Room 📞
      </button>
    </div>
  );
};

export default MeetingControls;