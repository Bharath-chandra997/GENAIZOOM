import React, { useState, useRef } from 'react';
import { toast } from 'react-toastify';
const AIPopup = ({ 
  onClose, 
  onAIRequest, 
  onAIComplete, 
  aiBotInUse, 
  currentAIUser, 
  aiResponse, 
  aiUploadedImage, 
  aiUploadedAudio,
  user 
}) => {
  const [imageFile, setImageFile] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);
  const audioInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
    }
  };

  const handleAudioUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('audio/')) {
      setAudioFile(file);
    }
  };

  const handleSubmit = async () => {
    if (aiBotInUse && currentAIUser !== user.username) {
      toast.error('AI Bot is currently in use by another user', {
        position: "bottom-center"
      });
      return;
    }

    if (!imageFile && !audioFile) {
      alert('Please upload an image or audio file');
      return;
    }

    setIsProcessing(true);
    await onAIRequest(imageFile, audioFile);
    setIsProcessing(false);
  };

  const handleComplete = () => {
    setImageFile(null);
    setAudioFile(null);
    onAIComplete();
  };

  const removeImage = () => {
    setImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAudio = () => {
    setAudioFile(null);
    if (audioInputRef.current) {
      audioInputRef.current.value = '';
    }
  };

  return (
    <div className="pro-sidebar">
      <div className="pro-sidebar-header">
        <h3 className="pro-sidebar-title">AI Assistant</h3>
        <button className="pro-sidebar-close" onClick={onClose}></button>
      </div>

      <div className="pro-sidebar-content">
        <div className="pro-ai-popup-content">
          {/* Status Section */}
          <div className="pro-ai-status-section">
            <div className={`pro-ai-status-indicator ${aiBotInUse ? 'in-use' : 'available'}`}>
              <div className="pro-ai-status-dot"></div>
              <span>
                {aiBotInUse 
                  ? `In use by ${currentAIUser}`
                  : 'Available'
                }
              </span>
            </div>
          </div>

          {/* Upload Section */}
          {!aiBotInUse && (
            <div className="pro-ai-upload-section">
              <div className="pro-ai-upload-area">
                <h4>Upload Image</h4>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="pro-ai-file-input"
                />
                {imageFile && (
                  <div className="pro-ai-upload-preview">
                    <img src={URL.createObjectURL(imageFile)} alt="Preview" />
                    <button onClick={removeImage} className="pro-ai-remove-btn">Remove</button>
                  </div>
                )}
              </div>

              <div className="pro-ai-upload-area">
                <h4>Upload Audio</h4>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioUpload}
                  className="pro-ai-file-input"
                />
                {audioFile && (
                  <div className="pro-ai-upload-preview">
                    <audio controls src={URL.createObjectURL(audioFile)} />
                    <button onClick={removeAudio} className="pro-ai-remove-btn">Remove</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submit Button - Always visible when not in use */}
          {!aiBotInUse && (
            <div className="pro-ai-submit-bar">
              <button 
                onClick={handleSubmit}
                disabled={isProcessing || (!imageFile && !audioFile)}
                className="pro-ai-submit-btn"
              >
                {isProcessing ? 'Processing...' : 'Process with AI'}
              </button>
            </div>
          )}

          {/* Response Section */}
          {aiBotInUse && aiResponse && (
            <div className="pro-ai-response-section">
              <h4>AI Response</h4>
              <div className="pro-ai-response-content">
                <div className="pro-ai-user-info">
                  Requested by: <strong>{currentAIUser}</strong>
                </div>
                
                {aiUploadedImage && (
                  <div className="pro-ai-uploaded-media">
                    <img src={aiUploadedImage} alt="Uploaded" />
                  </div>
                )}
                
                {aiUploadedAudio && (
                  <div className="pro-ai-uploaded-media">
                    <audio controls src={aiUploadedAudio} />
                  </div>
                )}
                
                <div className="pro-ai-response-text">
                  {aiResponse}
                </div>

                {currentAIUser === user.username && (
                  <button 
                    onClick={handleComplete}
                    className="pro-ai-complete-btn"
                  >
                    Complete Session
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Waiting Section */}
          {aiBotInUse && !aiResponse && (
            <div className="pro-ai-waiting-section">
              <div className="pro-ai-loading">
                <div className="pro-ai-spinner"></div>
                <p>AI is processing the request from {currentAIUser}...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIPopup;