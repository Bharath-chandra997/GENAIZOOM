// src/components/AIZoomBot.js

import React, { useState, useEffect } from 'react';

const AIZoomBot = ({ onClose, roomId, socket, currentUser }) => {
  const [imageFile, setImageFile] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [output, setOutput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentUploader, setCurrentUploader] = useState(null);

  useEffect(() => {
    if (!socket) return;

    socket.on('ai-start-processing', ({ userId }) => {
      setIsProcessing(true);
      setCurrentUploader(userId);
    });

    socket.on('ai-finish-processing', ({ response }) => {
      setIsProcessing(false);
      setCurrentUploader(null);
      setOutput(response);
    });

    return () => {
      socket.off('ai-start-processing');
      socket.off('ai-finish-processing');
    };
  }, [socket]);

  const handleUpload = () => {
    if (isProcessing || (!imageFile && !audioFile)) return;

    socket.emit('ai-start-processing', { userId: currentUser.userId });

    // Simulate processing with dummy response
    setTimeout(() => {
      const dummyResponse = 'This is a dummy AI response based on the uploaded file(s).';
      socket.emit('ai-finish-processing', { response: dummyResponse });
    }, 3000);
  };

  const handleImageChange = (e) => {
    if (e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  const handleAudioChange = (e) => {
    if (e.target.files[0]) {
      setAudioFile(e.target.files[0]);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-800">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-white">AI Zoom Bot</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors duration-200 p-1"
          title="Close AI Bot"
        >
          <span className="text-lg">✕</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {isProcessing && (
          <p className="text-yellow-400">
            Processing by {currentUploader === currentUser.userId ? 'You' : 'another user'}...
          </p>
        )}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="image-upload"
            className="bg-primary-600 text-white py-2 px-4 rounded cursor-pointer hover:bg-primary-700 text-center"
          >
            Upload Image 📸
          </label>
          <input
            id="image-upload"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="hidden"
            disabled={isProcessing}
          />
          {imageFile && <p className="text-sm text-gray-300">Selected: {imageFile.name}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor="audio-upload"
            className="bg-primary-600 text-white py-2 px-4 rounded cursor-pointer hover:bg-primary-700 text-center"
          >
            Upload Audio 🎤
          </label>
          <input
            id="audio-upload"
            type="file"
            accept="audio/*"
            onChange={handleAudioChange}
            className="hidden"
            disabled={isProcessing}
          />
          {audioFile && <p className="text-sm text-gray-300">Selected: {audioFile.name}</p>}
        </div>
        <button
          onClick={handleUpload}
          disabled={(!imageFile && !audioFile) || isProcessing}
          className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Get AI Answer
        </button>
        {output && (
          <div className="bg-gray-700 p-4 rounded-lg">
            <h4 className="text-white font-medium mb-2">AI Response:</h4>
            <p className="text-gray-300 break-words">{output}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIZoomBot;