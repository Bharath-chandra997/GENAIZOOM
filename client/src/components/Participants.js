import React from "react";
import "./Participants.css";

const Participants = ({
  participants = [],
  pendingRequests = [],
  currentUser,
  meetingInfo,
  onClose,
  onAcceptJoin,
  onRejectJoin,
  onPinParticipant,
  roomId,
}) => {
  return (
    <div className="pro-participants-root">
      <div className="pro-participants">
        {/* Header */}
        <div className="pro-participants__header">
          <h3 className="pro-participants__title">
            Participants ({participants.length})
          </h3>
          <button
            onClick={onClose}
            className="pro-participants__close"
            title="Close participants"
          >
            ✕
          </button>
        </div>

        {/* Scrollable List */}
        <div className="pro-participants__list custom-scrollbar">
          {/* Pending Join Requests (Host Only) */}
          {pendingRequests.length > 0 && meetingInfo?.isHost && (
            <div className="pro-participants__pending">
              <h4 className="pro-participants__pending-title">
                Pending Join Requests
              </h4>
              {pendingRequests.map((req) => (
                <div key={req.id} className="pro-participants__pending-card">
                  <span>{req.username}</span>
                  <div className="pro-participants__pending-actions">
                    <button onClick={() => onAcceptJoin(req.id)}>Accept</button>
                    <button onClick={() => onRejectJoin(req.id)}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active Participants */}
          <div className="pro-participants__cards">
            {participants.map((participant) => (
              <div
                key={participant.userId || participant.peerId}
                className="pro-participants-card"
              >
                <div className="pro-participants-card__left">
                  <div className="pro-participants-card__avatar">
                    {participant.username?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                  <div className="pro-participants-card__meta">
                    <span className="pro-participants-card__name">
                      {participant.username}
                    </span>
                    {participant.isLocal && (
                      <span className="pro-participants-card__you">You</span>
                    )}
                    {participant.isHost && " 👑"}
                  </div>
                </div>

                <div className="pro-participants-card__status">
                  <span>{participant.audioEnabled ? "🎤" : "🔇"}</span>
                  <span>{participant.videoEnabled ? "📹" : "🚫"}</span>
                  {onPinParticipant && (
                    <button
                      className="pro-participants-card__pin"
                      onClick={() => onPinParticipant(participant.userId)}
                      title="Pin participant"
                    >
                      📌
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="pro-participants__footer">
          <button className="pro-participants__invite">
            Invite Participant
          </button>
        </div>
      </div>
    </div>
  );
};

export default Participants;
