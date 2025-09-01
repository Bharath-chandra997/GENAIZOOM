import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FiUpload, FiX, FiPlay, FiPause } from 'react-icons/fi';

const SERVER_URL = 'https://genaizoomserver-0yn4.onrender.com';

const AIZoomBot = ({
  onClose,
  roomId,
  socket,
  currentUser,
  participants,
  imageUrl,
  setImageUrl,
  audioUrl,
  setAudioUrl,
  output,
  setOutput,
  isProcessing,
  setIsProcessing,
  currentUploader,
  isBotLocked,
  setIsBotLocked,
  uploaderUsername,
  isPlaying,
  handlePlayAudio,
  handlePauseAudio,
}) => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedAudio, setSelectedAudio] = useState(null);
  const audioRef = useRef(null);

  // Handle image file selection
  const handleImageChange = (e) => {
    if (isBotLocked && currentUploader !== socket.id) {
      toast.error('Another user is currently uploading or processing.');
      return;
    }
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
    }
  };

  // Handle audio file selection
  const handleAudioChange = (e) => {
    if (isBotLocked && currentUploader !== socket.id) {
      toast.error('Another user is currently uploading or processing.');
      return;
    }
    const file = e.target.files[0];
    if (file) {
      setSelectedAudio(file);
    }
  };

  // Handle file upload
  const handleUpload = useCallback(async (file, type) => {
    if (!file) {
      toast.error(`Please select an ${type} file to upload.`);
      return;
    }
    if (isBotLocked && currentUploader !== socket.id) {
      toast.error('Another user is currently uploading or processing.');
      return;
    }

    try {
      setIsBotLocked(true);
      socket.emit('ai-bot-locked', { userId: socket.id, username: currentUser.username, roomId });

      const formData = new FormData();
      formData.append('file', file);
      const endpoint = type === 'image' ? '/upload/image' : '/upload/audio';
      const response = await axios.post(`${SERVER_URL}${endpoint}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${currentUser.token}`,
        },
      });

      const { url } = response.data;
      if (type === 'image') {
        setImageUrl(url);
        socket.emit('ai-image-uploaded', { url, userId: socket.id, username: currentUser.username, roomId });
      } else {
        setAudioUrl(url);
        socket.emit('ai-audio-uploaded', { url, userId: socket.id, username: currentUser.username, roomId });
      }

      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} uploaded successfully!`);
      if (type === 'image') {
        setSelectedImage(null);
      } else {
        setSelectedAudio(null);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(`Failed to upload ${type}.`);
    } finally {
      setIsBotLocked(false);
      socket.emit('ai-bot-unlocked', { roomId });
    }
  }, [isBotLocked, currentUploader, socket, currentUser, roomId, setImageUrl, setAudioUrl, setIsBotLocked]);

  // Handle AI processing
  const handleProcess = async () => {
    if (!imageUrl || !audioUrl) {
      toast.error('Please upload both an image and an audio file to process.');
      return;
    }
    if (isBotLocked && currentUploader !== socket.id) {
      toast.error('Another user is currently processing.');
      return;
    }

    try {
      setIsBotLocked(true);
      socket.emit('ai-bot-locked', { userId: socket.id, username: currentUser.username, roomId });
      setIsProcessing(true);
      socket.emit('ai-start-processing', { userId: socket.id, username: currentUser.username, roomId });

      // Simulate AI processing with both image and audio (replace with actual AI API call)
      const response = await new Promise((resolve) => {
        setTimeout(() => {
          resolve({ message: 'Processed image and audio successfully!' });
        }, 2000);
      });

      setOutput(JSON.stringify(response, null, 2));
      socket.emit('ai-finish-processing', { response, roomId });
      setIsProcessing(false);
    } catch (error) {
      console.error('Processing error:', error);
      toast.error('Failed to process with AI.');
      setIsProcessing(false);
    } finally {
      setIsBotLocked(false);
      socket.emit('ai-bot-unlocked', { roomId });
    }
  };

  // Synchronize audio playback with isPlaying state
  useEffect(() => {
    if (audioRef.current && audioUrl) {
      if (isPlaying) {
        audioRef.current.play().catch((error) => {
          console.error('Audio play error:', error);
          toast.error('Failed to play audio.');
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, audioUrl]);

  return (
    <div className="bg-gray-900 h-full flex flex-col text-white p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">AI Zoom Bot</h2>
        <button onClick={onClose} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600">
          <FiX size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isBotLocked && currentUploader !== socket.id && (
          <div className="mb-4 p-2 bg-yellow-600 text-white rounded">
            {uploaderUsername} is currently uploading or processing.
          </div>
        )}
        <div className="mb-4">
          <h3 className="text-md font-medium mb-2">Upload Image</h3>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            disabled={isBotLocked && currentUploader !== socket.id}
            className="w-full p-2 bg-gray-800 rounded text-white"
          />
          <button
            onClick={() => handleUpload(selectedImage, 'image')}
            disabled={isProcessing || !selectedImage || (isBotLocked && currentUploader !== socket.id)}
            className="mt-2 w-full p-2 bg-blue-600 hover:bg-blue-500 rounded flex items-center justify-center"
          >
            <FiUpload className="mr-2" /> Upload Image
          </button>
        </div>
        <div className="mb-4">
          <h3 className="text-md font-medium mb-2">Upload Audio</h3>
          <input
            type="file"
            accept="audio/*"
            onChange={handleAudioChange}
            disabled={isBotLocked && currentUploader !== socket.id}
            className="w-full p-2 bg-gray-800 rounded text-white"
          />
          <button
            onClick={() => handleUpload(selectedAudio, 'audio')}
            disabled={isProcessing || !selectedAudio || (isBotLocked && currentUploader !== socket.id)}
            className="mt-2 w-full p-2 bg-blue-600 hover:bg-blue-500 rounded flex items-center justify-center"
          >
            <FiUpload className="mr-2" /> Upload Audio
          </button>
        </div>
        {imageUrl && (
          <div className="mb-4">
            <h3 className="text-md font-medium">Uploaded Image</h3>
            <img
              src={imageUrl}
              alt="Uploaded"
              className="w-full h-auto max-h-64 object-contain rounded"
              onError={(e) => {
                console.error('Image load error:', e);
                toast.error('Failed to load image.');
              }}
            />
            <p className="text-sm text-gray-400">Uploaded by: {uploaderUsername}</p>
          </div>
        )}
        {audioUrl && (
          <div className="mb-4">
            <h3 className="text-md font-medium">Uploaded Audio</h3>
            <audio
              ref={audioRef}
              src={audioUrl}
              className="w-full"
              onError={(e) => {
                console.error('Audio load error:', e);
                toast.error('Failed to load audio.');
              }}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handlePlayAudio}
                disabled={isProcessing || !audioUrl || isPlaying}
                className="p-2 bg-green-600 hover:bg-green-500 rounded flex items-center"
              >
                <FiPlay className="mr-2" /> Play
              </button>
              <button
                onClick={handlePauseAudio}
                disabled={isProcessing || !audioUrl || !isPlaying}
                className="p-2 bg-red-600 hover:bg-red-500 rounded flex items-center"
              >
                <FiPause className="mr-2" /> Pause
              </button>
            </div>
            <p className="text-sm text-gray-400">Uploaded by: {uploaderUsername}</p>
          </div>
        )}
        <button
          onClick={handleProcess}
          disabled={isProcessing || !imageUrl || !audioUrl || (isBotLocked && currentUploader !== socket.id)}
          className="w-full p-2 bg-purple-600 hover:bg-purple-500 rounded"
        >
          {isProcessing ? 'Processing...' : 'Process with AI'}
        </button>
        {output && (
          <div className="mt-4">
            <h3 className="text-md font-medium">AI Output</h3>
            <pre className="bg-gray-800 p-2 rounded text-sm overflow-auto">{output}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIZoomBot;