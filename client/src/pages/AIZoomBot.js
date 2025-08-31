// src/components/AIZoomBot.js

import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';

const AIZoomBot = ({ onClose, roomId, socket, currentUser }) => {
  const [imageFile, setImageFile] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [output, setOutput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentUploader, setCurrentUploader] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1.0); // Default volume (100%)
  const audioRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    // Handle AI processing start
    socket.on('ai-start-processing', ({ userId }) => {
      setIsProcessing(true);
      setCurrentUploader(userId);
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0; // Reset playback position
      }
    });

    // Handle AI processing finish
    socket.on('ai-finish-processing', ({ response }) => {
      setIsProcessing(false);
      setCurrentUploader(null);
      setOutput(response);
    });

    // Handle image upload broadcast
    socket.on('ai-image-uploaded', ({ imageData, userId }) => {
      setImageUrl(imageData);
      setCurrentUploader(userId);
    });

    // Handle audio upload broadcast
    socket.on('ai-audio-uploaded', ({ audioData, userId }) => {
      setAudioUrl(audioData);
      setCurrentUploader(userId);
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    });

    // Handle audio playback state
    socket.on('ai-audio-play', () => {
      setIsPlaying(true);
      if (audioRef.current) {
        audioRef.current.play().catch((err) => {
          console.error('Audio playback error:', err);
          toast.error('Failed to play audio. Please try again.');
          setIsPlaying(false);
        });
      }
    });

    socket.on('ai-audio-pause', () => {
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.pause();
    });

    return () => {
      socket.off('ai-start-processing');
      socket.off('ai-finish-processing');
      socket.off('ai-image-uploaded');
      socket.off('ai-audio-uploaded');
      socket.off('ai-audio-play');
      socket.off('ai-audio-pause');
    };
  }, [socket]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume; // Update volume when state changes
    }
  }, [volume]);

  const handleImageChange = (e) => {
    if (e.target.files[0] && !isProcessing) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) {
        toast.error('Please upload a valid image file.');
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        socket.emit('ai-image-uploaded', { imageData: reader.result, userId: currentUser.userId });
        setImageUrl(reader.result);
      };
      reader.onerror = () => {
        toast.error('Failed to read image file.');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAudioChange = (e) => {
    if (e.target.files[0] && !isProcessing) {
      const file = e.target.files[0];
      if (!['audio/mpeg', 'audio/wav', 'audio/mp3'].includes(file.type)) {
        toast.error('Please upload a valid audio file (MP3 or WAV).');
        return;
      }
      setAudioFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        socket.emit('ai-audio-uploaded', { audioData: reader.result, userId: currentUser.userId });
        setAudioUrl(reader.result);
      };
      reader.onerror = () => {
        toast.error('Failed to read audio file.');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = () => {
    if (isProcessing || (!imageFile && !audioFile)) return;

    socket.emit('ai-start-processing', { userId: currentUser.userId });

    // Simulate processing with dummy response
    setTimeout(() => {
      const dummyResponse = 'This is a dummy AI response based on the uploaded file(s).';
      socket.emit('ai-finish-processing', { response: dummyResponse });
    }, 3000);
  };

  const handlePlay = () => {
    if (audioRef.current && audioUrl && !isProcessing) {
      socket.emit('ai-audio-play');
      setIsPlaying(true);
      audioRef.current.play().catch((err) => {
        console.error('Audio playback error:', err);
        toast.error('Failed to play audio. Please check the file or browser permissions.');
        setIsPlaying(false);
      });
    }
  };

  const handlePause = () => {
    if (audioRef.current && audioUrl) {
      socket.emit('ai-audio-pause');
      setIsPlaying(false);
      audioRef.current.pause();
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
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
          {imageUrl && (
            <div className="mt-2">
              <img
                src={imageUrl}
                alt="Uploaded"
                className="max-w-full h-auto rounded-lg border border-gray-600"
                style={{ maxHeight: '200px' }}
              />
            </div>
          )}
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
            accept="audio/mpeg,audio/wav,audio/mp3"
            onChange={handleAudioChange}
            className="hidden"
            disabled={isProcessing}
          />
          {audioFile && <p className="text-sm text-gray-300">Selected: {audioFile.name}</p>}
          {audioUrl && (
            <div className="mt-2 flex flex-col gap-2">
              <audio
                ref={audioRef}
                src={audioUrl}
                className="w-full"
                onError={(e) => {
                  console.error('Audio element error:', e);
                  toast.error('Error loading audio file. Please try a different file.');
                }}
              >
                Your browser does not support the audio element.
              </audio>
              <div className="flex gap-2">
                <button
                  onClick={handlePlay}
                  disabled={isProcessing || !audioUrl}
                  className="flex-1 bg-blue-600 text-white py-1 px-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Play ▶️
                </button>
                <button
                  onClick={handlePause}
                  disabled={isProcessing || !audioUrl}
                  className="flex-1 bg-blue-600 text-white py-1 px-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Pause ⏸️
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="volume" className="text-sm text-gray-300">Volume:</label>
                <input
                  id="volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-full"
                  disabled={isProcessing || !audioUrl}
                />
              </div>
            </div>
          )}
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