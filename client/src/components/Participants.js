import React from "react";
import "./Participants.css";

const Participants = ({
  participants = [],
  aiParticipant = null,
  pendingRequests = [],
  currentUser,
  meetingInfo,
  onClose,
  onAcceptJoin,
  onRejectJoin,
  onPinParticipant,
  roomId,
  getUserAvatar,
  AIAvatar,
}) => {
  // Combine real participants with AI if it exists
  const allDisplayParticipants = aiParticipant 
    ? [aiParticipant, ...participants] 
    : participants;

  return (
    <div className="pro-participants-container">
      <div className="pro-participants-sidebar">
        {/* Header */}
        <div className="pro-participants__header">
          <h3 className="pro-participants__title">
            Participants ({participants.length})
            {aiParticipant && <span className="pro-ai-indicator"> + AI</span>}
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
            {allDisplayParticipants.map((participant) => {
              const isAI = participant.userId === 'ai-assistant';
              
              return (
                <div
                  key={participant.userId || participant.peerId}
                  className={`pro-participants-card ${isAI ? 'pro-participants-card--ai' : ''}`}
                  data-user-id={participant.userId}
                >
                  <div className="pro-participants-card__left">
                    <div className="pro-participants-card__avatar">
                      {isAI ? (
                        <AIAvatar size={32} />
                      ) : (
                        getUserAvatar(participant, 32)
                      )}
                    </div>
                    <div className="pro-participants-card__meta">
                      <span className="pro-participants-card__name">
                        {participant.username}
                        {isAI && <span className="pro-ai-badge">AI</span>}
                      </span>
                      {participant.isLocal && !isAI && (
                        <span className="pro-participants-card__you">You</span>
                      )}
                      {participant.isHost && " 👑"}
                    </div>
                  </div>

                  <div className="pro-participants-card__status">
                    <span title={participant.audioEnabled ? "Audio on" : "Audio off"}>
                      {participant.audioEnabled ? "🎤" : "🔇"}
                    </span>
                    <span title={participant.videoEnabled ? "Video on" : "Video off"}>
                      {participant.videoEnabled ? "📹" : "🚫"}
                    </span>
                    {onPinParticipant && !isAI && (
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
              );
            })}
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