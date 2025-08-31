// Participants.js
import React from 'react';
import { toast } from 'react-toastify';
import './Participants.css'
const Participants = ({ participants = [], pendingRequests = [], currentUser, meetingInfo, onClose, onAcceptJoin, onRejectJoin, onPinParticipant, roomId }) => {
  return (
    <div className="h-full flex flex-col bg-gray-800">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-white">Participants ({participants.length})</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors duration-200 p-1" title="Close participants">
          <span className="text-lg">✕</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {pendingRequests.length > 0 && meetingInfo?.isHost && (
          <div className="p-4 border-b border-gray-700">
            <h4 className="text-md font-semibold text-white mb-2">Pending Join Requests</h4>
            {/* ... rest of the pending requests logic ... */}
          </div>
        )}
        <div className="p-4 space-y-2">
          {participants.map((participant) => (
            <div
              key={participant.userId || participant.peerId}
              className="flex items-center justify-between p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors duration-200"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                  {participant.username?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div>
                  <span className="text-white font-medium">{participant.username || 'Participant'}</span>
                  {participant.isLocal && (
                    <span className="bg-primary-500 text-white px-2 py-1 rounded text-xs ml-2">You</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={() => {
            const meetingUrl = `${window.location.origin}/join/${roomId}`;
            navigator.clipboard.writeText(meetingUrl);
            toast.success('Invite link copied to clipboard');
          }}
          className="w-full bg-primary-600 text-white py-2 px-3 rounded text-sm hover:bg-primary-700 transition-colors"
        >
          Copy Invite Link
        </button>
      </div>
    </div>
  );
};

export default Participants;