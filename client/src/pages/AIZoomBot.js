import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FiUpload, FiX, FiPlay, FiPause, FiTrash2 } from 'react-icons/fi';

const SERVER_URL = 'https://genaizoomserver-0yn4.onrender.com';
const AI_MODEL_API_URL = 'https://genaizoom-1.onrender.com/predict'; // FastAPI predict endpoint

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
  // Clear output when component mounts to ensure fresh state
  useEffect(() => {
    if (!isProcessing && !output) {
      setOutput('');
    }
  }, [isProcessing, setOutput, output]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedAudio, setSelectedAudio] = useState(null);
  const audioRef = useRef(null);

  // Check if AI processing is available
  const canProcessAI = selectedImage || imageUrl || selectedAudio || audioUrl;
  
  // Handle image file selection
  const handleImageChange = (e) => {
    if (isBotLocked) {
      if (currentUploader === socket.id) {
        toast.error('You are already uploading or processing. Please wait.');
      } else {
        toast.error(`${uploaderUsername || 'Another user'} is currently uploading or processing. Please wait.`);
      }
      return;
    }
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
    }
  };

  // Handle audio file selection
  const handleAudioChange = (e) => {
    if (isBotLocked) {
      if (currentUploader === socket.id) {
        toast.error('You are already uploading or processing. Please wait.');
      } else {
        toast.error(`${uploaderUsername || 'Another user'} is currently uploading or processing. Please wait.`);
      }
      return;
    }
    const file = e.target.files[0];
    if (file) {
      setSelectedAudio(file);
    }
  };

  // Clear selected files
  const handleClearFiles = () => {
    setSelectedImage(null);
    setSelectedAudio(null);
    toast.info('Selected files cleared.');
  };

  // Handle file upload
  const handleUpload = useCallback(async (file, type) => {
    if (!file) {
      toast.error(`Please select an ${type} file to upload.`);
      return;
    }
    
    // Check if anyone is currently uploading or processing
    if (isBotLocked) {
      if (currentUploader === socket.id) {
        toast.error('You are already uploading or processing. Please wait.');
      } else {
        toast.error(`${uploaderUsername || 'Another user'} is currently uploading or processing. Please wait.`);
      }
      return;
    }

    try {
      // Lock the bot immediately to prevent others from uploading
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
        socket.emit('ai-image-uploaded', { 
          url, 
          userId: socket.id, 
          username: currentUser.username, 
          roomId,
          filename: file.name,
          size: file.size
        });
      } else {
        setAudioUrl(url);
        socket.emit('ai-audio-uploaded', { 
          url, 
          userId: socket.id, 
          username: currentUser.username, 
          roomId,
          filename: file.name,
          size: file.size
        });
      }

      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} uploaded successfully!`);
    } catch (error) {
      console.error(`Upload ${type} error:`, error.response || error.message);
      toast.error(`Failed to upload ${type}: ${error.message}`);
    } finally {
      setIsBotLocked(false);
      socket.emit('ai-bot-unlocked', { roomId });
    }
  }, [isBotLocked, currentUploader, socket, currentUser, roomId, setImageUrl, setAudioUrl, setIsBotLocked, uploaderUsername]);

  // Handle AI processing
  const handleProcess = async () => {
    // Check if we have files to process (either selected or already uploaded)
    const hasImage = selectedImage || imageUrl;
    const hasAudio = selectedAudio || audioUrl;
    
    if (!hasImage || !hasAudio) {
      toast.error('Please ensure both an image and an audio file are available for processing.');
      return;
    }
    
    if (isBotLocked && currentUploader !== socket.id) {
      toast.error('Another user is currently uploading or processing.');
      return;
    }

    try {
      // Clear previous output before starting new processing
      setOutput('');
      
      setIsBotLocked(true);
      socket.emit('ai-bot-locked', { userId: socket.id, username: currentUser.username, roomId });
      setIsProcessing(true);
      socket.emit('ai-start-processing', { userId: socket.id, username: currentUser.username, roomId });

      console.log('Sending AI request to:', AI_MODEL_API_URL);
      const formData = new FormData();
      
      // Use selected files if available, otherwise use uploaded URLs
      if (selectedImage) {
        formData.append('image', selectedImage);
      } else if (imageUrl) {
        // Download the image from URL and convert to file
        const imageResponse = await fetch(imageUrl);
        const imageBlob = await imageResponse.blob();
        const imageFile = new File([imageBlob], 'uploaded_image.jpg', { type: 'image/jpeg' });
        formData.append('image', imageFile);
      }
      
      if (selectedAudio) {
        formData.append('audio', selectedAudio);
      } else if (audioUrl) {
        // Download the audio from URL and convert to file
        const audioResponse = await fetch(audioUrl);
        const audioBlob = await audioResponse.blob();
        const audioFile = new File([audioBlob], 'uploaded_audio.mp3', { type: 'audio/mpeg' });
        formData.append('audio', audioFile);
      }

      const response = await axios.post(AI_MODEL_API_URL, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('AI response:', response.data);
      const modelOutput = response.data.result || response.data;
      
      // Extract only the answer from the response, not the full JSON
      let displayOutput = '';
      if (typeof modelOutput === 'object') {
        // Try to find common answer fields
        if (modelOutput.answer) {
          displayOutput = modelOutput.answer;
        } else if (modelOutput.response) {
          displayOutput = modelOutput.response;
        } else if (modelOutput.text) {
          displayOutput = modelOutput.text;
        } else if (modelOutput.result) {
          displayOutput = modelOutput.result;
        } else if (modelOutput.data && modelOutput.data.answer) {
          displayOutput = modelOutput.data.answer;
        } else if (modelOutput.data && modelOutput.data.response) {
          displayOutput = modelOutput.data.response;
        } else {
          // If no specific answer field, show the first string value
          const firstStringValue = Object.values(modelOutput).find(val => typeof val === 'string');
          displayOutput = firstStringValue || JSON.stringify(modelOutput, null, 2);
        }
      } else {
        displayOutput = String(modelOutput);
      }
      
      console.log('Display output:', displayOutput);
      setOutput(displayOutput);
      socket.emit('ai-finish-processing', { response: modelOutput, roomId });
      setIsProcessing(false);
    } catch (error) {
      console.error('AI processing error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      toast.error(`Failed to process with AI: ${error.response?.statusText || error.message}`);
      setIsProcessing(false);
    } finally {
      setIsBotLocked(false);
      socket.emit('ai-bot-unlocked', { roomId });
    }
  };

  // Synchronize audio playback with isPlaying state
  useEffect(() => {
    if (audioRef.current && audioUrl) {
      console.log('Audio playback state:', { isPlaying, audioUrl });
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

  // Clear output when processing starts
  useEffect(() => {
    if (isProcessing) {
      setOutput('');
    }
  }, [isProcessing]);

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
        {imageUrl && (
          <div className="mb-2 p-2 bg-green-600 text-white rounded text-sm">
            ✓ Image file restored from session
          </div>
        )}
        {audioUrl && (
          <div className="mb-2 p-2 bg-green-600 text-white rounded text-sm">
            ✓ Audio file restored from session
          </div>
        )}
        <div className="mb-4">
          <h3 className="text-md font-medium mb-2">Upload Image</h3>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            disabled={isBotLocked}
            className="w-full p-2 bg-gray-800 rounded text-white"
          />
          <button
            onClick={() => handleUpload(selectedImage, 'image')}
            disabled={isProcessing || !selectedImage || isBotLocked}
            className="mt-2 w-full p-2 bg-blue-600 hover:bg-blue-500 rounded flex items-center justify-center disabled:bg-gray-600"
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
            disabled={isBotLocked}
            className="w-full p-2 bg-gray-800 rounded text-white"
          />
          <button
            onClick={() => handleUpload(selectedAudio, 'audio')}
            disabled={isProcessing || !selectedAudio || isBotLocked}
            className="mt-2 w-full p-2 bg-blue-600 hover:bg-blue-500 rounded flex items-center justify-center disabled:bg-gray-600"
          >
            <FiUpload className="mr-2" /> Upload Audio
          </button>
        </div>
        {(selectedImage || selectedAudio) && (
          <div className="mb-4">
            <button
              onClick={handleClearFiles}
              className="w-full p-2 bg-red-600 hover:bg-red-500 rounded flex items-center justify-center"
            >
              <FiTrash2 className="mr-2" /> Clear Selected Files
            </button>
          </div>
        )}
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
                disabled={isProcessing || !audioUrl}
                className="p-2 bg-green-600 hover:bg-green-500 rounded flex items-center disabled:bg-gray-600"
              >
                <FiPlay className="mr-2" /> Play
              </button>
              <button
                onClick={handlePauseAudio}
                disabled={isProcessing || !audioUrl}
                className="p-2 bg-red-600 hover:bg-red-500 rounded flex items-center disabled:bg-gray-600"
              >
                <FiPause className="mr-2" /> Pause
              </button>
            </div>
            <p className="text-sm text-gray-400">Uploaded by: {uploaderUsername}</p>
          </div>
        )}
        <button
          onClick={handleProcess}
          disabled={isProcessing || !canProcessAI || isBotLocked}
          className="w-full p-2 bg-purple-600 hover:bg-purple-500 rounded disabled:bg-gray-600"
        >
          {isProcessing ? 'Processing...' : 'Process with AI'}
        </button>
        {output && (
          <div className="mt-4">
            <h3 className="text-md font-medium">AI Answer</h3>
            <pre className="bg-gray-800 p-3 rounded text-lg overflow-auto">AI Answer: {output}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIZoomBot;