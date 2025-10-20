import React from 'react';

const MediaPanel = ({ imageUrl, audioUrl, uploaderUsername, output }) => (
  <div className="h-full bg-gray-800 p-4 overflow-auto">
    {imageUrl && <img src={imageUrl} alt="Shared" className="w-full h-auto mb-2" />}
    {audioUrl && <audio src={audioUrl} controls className="w-full mb-2" />}
    {output && <div className="bg-gray-700 p-2 rounded">{output}</div>}
    {uploaderUsername && <p className="text-sm text-gray-400">Uploaded by: {uploaderUsername}</p>}
  </div>
);

export default MediaPanel;
