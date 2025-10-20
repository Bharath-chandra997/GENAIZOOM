// Participants.js
import React from 'react';
import { toast } from 'react-toastify';
import './Participants.css'
const Participants = ({ participants = [], pendingRequests = [], currentUser, meetingInfo, onClose, onAcceptJoin, onRejectJoin, onPinParticipant, roomId }) => {
  return (
    <div className="pro-participants">
      <div className="pro-participants__header">
        <h3 className="pro-participants__title">Participants ({participants.length})</h3>
        <button onClick={onClose} className="pro-participants__close" title="Close participants">
          <span>✕</span>
        </button>
      </div>
      <div className="pro-participants__list custom-scrollbar">
        {pendingRequests.length > 0 && meetingInfo?.isHost && (
          <div className="pro-participants__pending">
            <h4 className="pro-participants__pending-title">Pending Join Requests</h4>
            {/* ... rest of the pending requests logic ... */}
          </div>
        )}
        <div className="pro-participants__cards">
          {participants.map((participant) => (
            <div
              key={participant.userId || participant.peerId}
              className="pro-participants-card"
            >
              <div className="pro-participants-card__left">
                <div className="pro-participants-card__avatar">
                  {participant.username?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="pro-participants-card__meta">
                  <span className="pro-participants-card__name">{participant.username || 'Participant'}</span>
                  {participant.isLocal && (
                    <span className="pro-participants-card__you">You</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="pro-participants__footer">
        <button
          onClick={() => {
            const meetingUrl = `${window.location.origin}/join/${roomId}`;
            navigator.clipboard.writeText(meetingUrl);
            toast.success('Invite link copied to clipboard');
          }}
          className="pro-participants__invite"
        >
          Copy Invite Link
        </button>
      </div>
    </div>
  );
};

export default Participants;