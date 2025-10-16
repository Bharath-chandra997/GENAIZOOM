import React from 'react';

// UploadControls: shows image/audio inputs and a Display button when both present
const UploadControls = ({
  canUpload,
  selectedImage,
  setSelectedImage,
  selectedAudio,
  setSelectedAudio,
  hasImageUrl,
  hasAudioUrl,
  onDisplay,
  isMediaDisplayed,
}) => {
  const bothReady = (!!selectedImage || hasImageUrl) && (!!selectedAudio || hasAudioUrl);
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm mb-1">Upload Image</label>
        <input
          type="file"
          accept="image/*"
          disabled={!canUpload || isMediaDisplayed}
          onChange={(e)=> setSelectedImage(e.target.files?.[0] || null)}
          className="w-full text-sm"
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Upload Audio</label>
        <input
          type="file"
          accept="audio/*"
          disabled={!canUpload || isMediaDisplayed}
          onChange={(e)=> setSelectedAudio(e.target.files?.[0] || null)}
          className="w-full text-sm"
        />
      </div>
      <button
        type="button"
        onClick={onDisplay}
        disabled={!bothReady || !canUpload || isMediaDisplayed}
        className={`w-full p-2 rounded ${bothReady && canUpload && !isMediaDisplayed ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-700 text-gray-300 cursor-not-allowed'}`}
      >
        Display
      </button>
    </div>
  );
};

export default UploadControls;


