import React from 'react';
import { toast } from 'react-toastify';

const UploadControls = ({ canUpload, selectedImage, setSelectedImage, selectedAudio, setSelectedAudio, hasImageUrl, hasAudioUrl, isMediaDisplayed, onDisplay, onRemove, onAnalyze, isProcessing }) => {
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    setSelectedImage(file || null);
    if (file) {
      const url = URL.createObjectURL(file);
      setSelectedImage((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return file;
      });
    } else {
      setSelectedImage(null);
    }
  };

  const handleAudioChange = (e) => {
    const file = e.target.files[0];
    setSelectedAudio(file || null);
    if (file) {
      const url = URL.createObjectURL(file);
      setSelectedAudio((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return file;
      });
    } else {
      setSelectedAudio(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input type="file" accept="image/*" onChange={handleImageChange} disabled={!canUpload} />
      <input type="file" accept="audio/*" onChange={handleAudioChange} disabled={!canUpload} />
      <button onClick={onDisplay} disabled={!hasImageUrl || !hasAudioUrl || isMediaDisplayed || !canUpload} className="p-2 bg-blue-600 rounded">Display</button>
      <button onClick={onRemove} disabled={!isMediaDisplayed} className="p-2 bg-red-600 rounded">Remove</button>
      <button onClick={onAnalyze} disabled={isProcessing || !hasImageUrl || !hasAudioUrl} className="p-2 bg-green-600 rounded">{isProcessing ? 'Processing...' : 'Analyze with AI'}</button>
    </div>
  );
};

export default UploadControls;