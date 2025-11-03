import React from 'react';
import './ParticipantColorLegend.css';

const ParticipantColorLegend = ({ userColors, participants, currentUserId }) => {
  if (!userColors || Object.keys(userColors).length === 0) return null;

  const activeUsers = participants
    .filter(p => userColors[p.socketId])
    .map(p => ({
      id: p.socketId,
      username: p.isLocal ? 'You' : p.username,
      color: userColors[p.socketId] || '#999',
    }));

  if (activeUsers.length === 0) return null;

  return (
    <div className="color-legend">
      <div className="color-legend-title">Drawing Colors</div>
      <div className="color-legend-items">
        {activeUsers.map(user => (
          <div key={user.id} className="color-legend-item">
            <div
              className="color-swatch"
              style={{ backgroundColor: user.color }}
            />
            <span className="color-username">
              {user.username} {user.id === currentUserId && '(You)'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ParticipantColorLegend;