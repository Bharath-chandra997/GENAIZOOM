import React, { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import './AIPopup.css';

const AIPopup = ({
  onClose,
  onAIRequest,
  onAIComplete,
  aiResponse,
  aiUploadedImage,
  aiUploadedAudio,
  user,
  isAIProcessing,
  currentUploader,
}) => {
  const [imageFile, setImageFile] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const imageInputRef = useRef(null);
  const audioInputRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
    }
  };

  const handleAudioChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAudioFile(file);
    }
  };

  const handleSubmit = async () => {
    if (!imageFile || !audioFile) {
      toast.error('Please upload both an image and an audio file.', {
        position: 'bottom-center',
      });
      return;
    }
    await onAIRequest(imageFile, audioFile);
    setImageFile(null);
    setAudioFile(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const isUploader = currentUploader === user.userId;

  return (
    <div className="ai-popup">
      <div className="ai-popup-header">
        <h2>AI Assistant</h2>
        <button className="ai-popup-close" onClick={onClose}>
          &times;
        </button>
      </div>
      <div className="ai-popup-content">
        <div className="ai-upload-section">
          <label>Upload Image (JPEG/PNG):</label>
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleImageChange}
            disabled={isAIProcessing || !!currentUploader}
            ref={imageInputRef}
          />
        </div>
        <div className="ai-upload-section">
          <label>Upload Audio (MP3/WAV):</label>
          <input
            type="file"
            accept="audio/mpeg,audio/wav"
            onChange={handleAudioChange}
            disabled={isAIProcessing || !!currentUploader}
            ref={audioInputRef}
          />
        </div>
        <button
          className="ai-submit-button"
          onClick={handleSubmit}
          disabled={isAIProcessing || !imageFile || !audioFile || !!currentUploader}
        >
          {isAIProcessing ? 'Processing...' : 'Process with AI'}
        </button>
        {currentUploader && !isUploader && (
          <p className="ai-locked-message">
            AI is currently locked by another user.
          </p>
        )}
        {aiUploadedImage && (
          <div className="ai-media-section">
            <h3>Uploaded Image:</h3>
            <img src={aiUploadedImage} alt="Uploaded" className="ai-uploaded-image" />
          </div>
        )}
        {aiUploadedAudio && (
          <div className="ai-media-section">
            <h3>Uploaded Audio:</h3>
            <audio controls src={aiUploadedAudio} className="ai-uploaded-audio" />
          </div>
        )}
        {aiResponse && (
          <div className="ai-response-section">
            <h3>AI Response:</h3>
            <p>{aiResponse}</p>
          </div>
        )}
        {isUploader && (aiUploadedImage || aiUploadedAudio || aiResponse) && (
          <button
            className="ai-unlock-button"
            onClick={onAIComplete}
            disabled={isAIProcessing}
          >
            Unlock AI
          </button>
        )}
      </div>
    </div>
  );
};

export default AIPopup;