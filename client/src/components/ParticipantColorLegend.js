import React from 'react';
import './ParticipantColorLegend.css';

const ParticipantColorLegend = ({ userColors = {}, participants = [], currentUserId }) => {
  const hasColors = userColors && Object.keys(userColors).length > 0;
  if (!hasColors) {
    return null;
  }

  return (
    <div className="participant-color-legend">
      <div className="participant-color-legend-header">
        <span className="participant-color-legend-title">Participants</span>
      </div>
      <div className="participant-color-legend-items">
        {Object.entries(userColors).map(([id, color]) => {
          // id may be socketId; find participant by userId/socketId
          const p = Array.isArray(participants) ? participants.find(x => x?.userId === id) : null;
          const name = p?.username || id.slice(0, 6);
          const isYou = currentUserId && currentUserId === id;
          return (
            <div key={id} className={`participant-color-legend-item ${isYou ? 'is-you' : ''}`}>
              <div 
                className="participant-color-legend-chip" 
                style={{ backgroundColor: color }}
                title={name}
              >
                <div className="participant-color-legend-chip-inner" />
              </div>
              <span className="participant-color-legend-name">{name} {isYou ? '(You)' : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ParticipantColorLegend;

