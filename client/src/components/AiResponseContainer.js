import React from 'react';

// AiResponseContainer: scrollable AI response area
const AiResponseContainer = ({ output }) => {
  return (
    <div className="p-3 border-t border-gray-700 h-48 overflow-auto bg-gray-900">
      {output ? (
        <div className="text-sm text-gray-100 whitespace-pre-wrap">{output}</div>
      ) : (
        <div className="text-sm text-gray-400">AI response will appear here…</div>
      )}
    </div>
  );
};

export default AiResponseContainer;


