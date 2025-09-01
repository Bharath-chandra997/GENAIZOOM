import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import axios from 'axios';

const SERVER_URL = 'https://genaizoomserver-0yn4.onrender.com';
const API_URL = 'https://genaizoom-1.onrender.com';

const AIZoomBot = ({ onClose, roomId, socket, currentUser, participants }) => {
  const [imageFile, setImageFile] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [output, setOutput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentUploader, setCurrentUploader] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [isBotLocked, setIsBotLocked] = useState(false);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [uploaderUsername, setUploaderUsername] = useState('');
  const audioRef = useRef(null);

  // Helper function to get username by userId from participants
  const getUsernameById = (userId) => {
    const participant = participants.find(p => p.userId === userId);
    if (participant) {
      return participant.isLocal ? currentUser.username : participant.username;
    }
    return 'Another user';
  };

  // Socket event listeners
  useEffect(() => {
    if (!socket) {
      console.error('Socket is not initialized');
      return;
    }

    socket.on('ai-start-processing', ({ userId, username }) => {
      console.log(`Received ai-start-processing: userId=${userId}, username=${username}`);
      setIsProcessing(true);
      setCurrentUploader(userId);
      setUploaderUsername(username || getUsernameById(userId));
      setIsPlaying(false);
      setIsAudioReady(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    });

    socket.on('ai-finish-processing', ({ response }) => {
      console.log(`Received ai-finish-processing: response=${response}`);
      setIsProcessing(false);
      setCurrentUploader(null);
      setUploaderUsername('');
      const displayResponse = typeof response === 'object' ? JSON.stringify(response, null, 2) : response;
      setOutput(displayResponse);
      socket.emit('ai-bot-unlocked', { roomId });
    });

    socket.on('ai-image-uploaded', ({ url, userId, username, roomId: eventRoomId }) => {
      console.log(`Received ai-image-uploaded: url=${url}, userId=${userId}, username=${username}, eventRoomId=${eventRoomId}`);
      setImageUrl(url);
      setCurrentUploader(userId);
      setUploaderUsername(username || getUsernameById(userId));
      console.log(`Updated imageUrl for user ${currentUser.userId}: ${url}`);
    });

    socket.on('ai-audio-uploaded', ({ url, userId, username, roomId: eventRoomId }) => {
      console.log(`Received ai-audio-uploaded: url=${url}, userId=${userId}, username=${username}, eventRoomId=${eventRoomId}`);
      setAudioUrl(url);
      setCurrentUploader(userId);
      setUploaderUsername(username || getUsernameById(userId));
      setIsPlaying(false);
      setIsAudioReady(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = url;
        audioRef.current.load();
        console.log(`Updated audioRef.src for user ${currentUser.userId}: ${url}`);
      }
    });

    socket.on('ai-audio-play', () => {
      console.log('Received ai-audio-play');
      if (audioRef.current && audioUrl && isAudioReady) {
        setIsPlaying(true);
        audioRef.current.play().catch((err) => {
          console.error('Audio playback error:', err);
          toast.error('Failed to play audio. Ensure you have interacted with the page (e.g., click Play).');
          setIsPlaying(false);
        });
      } else {
        console.warn('Audio not playable: ', { audioUrl, isAudioReady });
        toast.error('Audio not ready or unavailable.');
      }
    });

    socket.on('ai-audio-pause', () => {
      console.log('Received ai-audio-pause');
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.pause();
    });

    socket.on('ai-bot-locked', ({ userId, username }) => {
      console.log(`Received ai-bot-locked: userId=${userId}, username=${username}`);
      setIsBotLocked(true);
      setCurrentUploader(userId);
      setUploaderUsername(username || getUsernameById(userId));
    });

    socket.on('ai-bot-unlocked', () => {
      console.log('Received ai-bot-unlocked');
      setIsBotLocked(false);
      setCurrentUploader(null);
      setUploaderUsername('');
    });

    return () => {
      socket.off('ai-start-processing');
      socket.off('ai-finish-processing');
      socket.off('ai-image-uploaded');
      socket.off('ai-audio-uploaded');
      socket.off('ai-audio-play');
      socket.off('ai-audio-pause');
      socket.off('ai-bot-locked');
      socket.off('ai-bot-unlocked');
    };
  }, [socket, roomId, audioUrl, currentUser, participants]);

  // Preload audio and handle readiness
  useEffect(() => {
    if (audioRef.current && audioUrl) {
      audioRef.current.src = audioUrl;
      const handleCanPlay = () => {
        setIsAudioReady(true);
        console.log(`Audio is ready to play for user ${currentUser.userId}: ${audioUrl}`);
      };
      audioRef.current.addEventListener('canplaythrough', handleCanPlay);
      audioRef.current.load();
      return () => {
        audioRef.current.removeEventListener('canplaythrough', handleCanPlay);
      };
    }
  }, [audioUrl, currentUser.userId]);

  // Update volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      console.log(`Updated volume for user ${currentUser.userId}: ${volume}`);
    }
  }, [volume, currentUser.userId]);

  const handleImageChange = async (e) => {
    if (e.target.files[0] && !isProcessing && !isBotLocked) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) {
        toast.error('Please upload a valid image file.');
        return;
      }
      setImageFile(file);
      console.log(`Image selected by user ${currentUser.userId}: ${file.name}`);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const { data } = await axios.post(`${SERVER_URL}/upload/image`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${currentUser.token}`,
          },
        });
        setImageUrl(data.url);
        socket.emit('ai-image-uploaded', {
          url: data.url,
          userId: currentUser.userId,
          username: currentUser.username,
          roomId
        });
        console.log(`Image uploaded by user ${currentUser.userId}: ${data.url}`);
      } catch (err) {
        console.error(`Image upload error for user ${currentUser.userId}:`, err);
        toast.error('Image upload failed.');
      }
    } else if (isBotLocked) {
      toast.error('AI Bot is currently in use by another user.');
    }
  };

  const handleAudioChange = async (e) => {
    if (e.target.files[0] && !isProcessing && !isBotLocked) {
      const file = e.target.files[0];
      if (!['audio/mpeg', 'audio/wav', 'audio/mp3'].includes(file.type)) {
        toast.error('Please upload a valid audio file (MP3 or WAV).');
        return;
      }
      setAudioFile(file);
      console.log(`Audio selected by user ${currentUser.userId}: ${file.name}`);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const { data } = await axios.post(`${SERVER_URL}/upload/audio`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${currentUser.token}`,
          },
        });
        setAudioUrl(data.url);
        socket.emit('ai-audio-uploaded', {
          url: data.url,
          userId: currentUser.userId,
          username: currentUser.username,
          roomId
        });
        console.log(`Audio uploaded by user ${currentUser.userId}: ${data.url}`);
      } catch (err) {
        console.error(`Audio upload error for user ${currentUser.userId}:`, err);
        toast.error('Audio upload failed.');
      }
    } else if (isBotLocked) {
      toast.error('AI Bot is currently in use by another user.');
    }
  };

  const handleUpload = async () => {
    if (isProcessing || (!imageFile && !audioFile) || isBotLocked) {
      if (isBotLocked) toast.error('AI Bot is currently in use by another user.');
      return;
    }
    try {
      setIsProcessing(true);
      socket.emit('ai-bot-locked', {
        userId: currentUser.userId,
        username: currentUser.username,
        roomId
      });
      socket.emit('ai-start-processing', {
        userId: currentUser.userId,
        username: currentUser.username
      });
      console.log(`Started AI processing by user ${currentUser.userId}`);

      const formData = new FormData();
      if (imageFile) formData.append('image', imageFile);
      if (audioFile) formData.append('audio', audioFile);

      if (!imageFile && !audioFile) {
        toast.error('Please upload at least one file.');
        socket.emit('ai-bot-unlocked', { roomId });
        setIsProcessing(false);
        return;
      }

      const { data } = await axios.post(`${API_URL}/predict`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 60000,
      });
      const displayResponse = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
      const response = data.result || displayResponse || 'No answer provided by AI.';
      socket.emit('ai-finish-processing', { response });
      setOutput(response);
      console.log(`AI processing finished for user ${currentUser.userId}: ${response}`);
    } catch (err) {
      console.error(`AI prediction error for user ${currentUser.userId}:`, err);
      toast.error(err.response?.data?.detail || 'Failed to get AI answer.');
      socket.emit('ai-bot-unlocked', { roomId });
      setIsProcessing(false);
      setCurrentUploader(null);
      setUploaderUsername('');
    }
  };

  const handlePlay = () => {
    if (audioRef.current && audioUrl && isAudioReady && !isProcessing && !isBotLocked) {
      socket.emit('ai-audio-play');
      setIsPlaying(true);
      audioRef.current.play().catch((err) => {
        console.error(`Audio playback error for user ${currentUser.userId}:`, err);
        toast.error('Failed to play audio. Ensure you have interacted with the page (e.g., click Play).');
        setIsPlaying(false);
      });
    } else if (isBotLocked) {
      toast.error('AI Bot is currently in use by another user.');
    } else if (!isAudioReady) {
      toast.error('Audio is not ready yet. Please wait.');
    }
  };

  const handlePause = () => {
    if (audioRef.current && audioUrl && !isBotLocked) {
      socket.emit('ai-audio-pause');
      setIsPlaying(false);
      audioRef.current.pause();
    } else if (isBotLocked) {
      toast.error('AI Bot is currently in use by another user.');
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };

  return (
    <div className="h-full flex flex-col bg-gray-800">
      <style>
        {`
          .spinner {
            border: 4px solid rgba(255, redactado255, 255, 255, 0.2);
            border-left-color: #ffffff;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            animation: spin 1s linear infinite;
            display: inline-block;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
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
            Processing by {uploaderUsername || (currentUploader === currentUser.userId ? 'You' : 'another user')}...
          </p>
        )}
        {isBotLocked && currentUploader !== currentUser.userId && (
          <p className="text-red-400">
            AI Bot is locked by {uploaderUsername || 'another user'}. Please wait.
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
            disabled={isProcessing || isBotLocked}
          />
          {imageFile && (
            <p className="text-sm text-gray-300">Selected: {imageFile.name}</p>
          )}
          {imageUrl && (
            <div className="mt-2">
              <p className="text-sm text-gray-300">
                Uploaded by: {uploaderUsername || (currentUploader === currentUser.userId ? 'You' : 'Another user')}
              </p>
              <img
                src={imageUrl}
                alt="Uploaded"
                className="max-w-full h-auto rounded-lg border border-gray-600"
                style={{ maxHeight: '200px' }}
                onError={() => {
                  console.error(`Image failed to load for user ${currentUser.userId}: ${imageUrl}`);
                  toast.error('Failed to load image.');
                }}
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
            disabled={isProcessing || isBotLocked}
          />
          {audioFile && (
            <p className="text-sm text-gray-300">Selected: {audioFile.name}</p>
          )}
          {audioUrl && (
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-sm text-gray-300">
                Uploaded by: {uploaderUsername || (currentUploader === currentUser.userId ? 'You' : 'Another user')}
              </p>
              <audio
                ref={audioRef}
                src={audioUrl}
                className="w-full"
                onError={(e) => {
                  console.error(`Audio element error for user ${currentUser.userId}:`, e);
                  toast.error('Error loading audio file. Try a different file.');
                  setIsAudioReady(false);
                }}
              >
                Your browser does not support the audio element.
              </audio>
              <div className="flex gap-2">
                <button
                  onClick={handlePlay}
                  disabled={isProcessing || !audioUrl || !isAudioReady || isBotLocked}
                  className="flex-1 bg-blue-600 text-white py-1 px-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Play ▶️
                </button>
                <button
                  onClick={handlePause}
                  disabled={isProcessing || !audioUrl || !isPlaying || isBotLocked}
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
                  disabled={isProcessing || !audioUrl || isBotLocked}
                />
              </div>
            </div>
          )}
        </div>
        <button
          onClick={handleUpload}
          disabled={(!imageFile && !audioFile) || isProcessing || isBotLocked}
          className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <span className="spinner"></span>
              Processing...
            </>
          ) : (
            'Get AI Answer'
          )}
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