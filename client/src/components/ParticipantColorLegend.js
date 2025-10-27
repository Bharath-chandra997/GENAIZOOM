import React from 'react';
import './ParticipantColorLegend.css';

const ParticipantColorLegend = ({ participantColors }) => {
  if (!participantColors || Object.keys(participantColors).length === 0) {
    return null;
  }

  return (
    <div className="participant-color-legend">
      <div className="participant-color-legend-header">
        <span className="participant-color-legend-title">Participant Colors</span>
      </div>
      <div className="participant-color-legend-items">
        {Object.entries(participantColors).map(([userId, { username, color }]) => (
          <div key={userId} className="participant-color-legend-item">
            <div 
              className="participant-color-legend-chip" 
              style={{ backgroundColor: color }}
            >
              <div className="participant-color-legend-chip-inner" />
            </div>
            <span className="participant-color-legend-name">{username}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ParticipantColorLegend;

