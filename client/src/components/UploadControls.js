import React from 'react';

// UploadControls: shows image/audio inputs and Display/Remove/Analyze buttons when ready
const UploadControls = ({
  canUpload,
  selectedImage,
  setSelectedImage,
  selectedAudio,
  setSelectedAudio,
  hasImageUrl,
  hasAudioUrl,
  onDisplay,
  onRemove,
  onAnalyze,
  isMediaDisplayed,
  isProcessing,
}) => {
  const hasAny = (!!selectedImage || hasImageUrl) || (!!selectedAudio || hasAudioUrl);
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
      {hasAny && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDisplay}
            disabled={!bothReady || !canUpload || isMediaDisplayed}
            className={`px-3 py-2 rounded ${bothReady && canUpload && !isMediaDisplayed ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-700 text-gray-300 cursor-not-allowed'}`}
          >
            Display
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={!hasAny}
            className={`px-3 py-2 rounded ${hasAny ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-gray-700 text-gray-300 cursor-not-allowed'}`}
          >
            Remove
          </button>
          <button
            type="button"
            onClick={onAnalyze}
            disabled={!bothReady || isProcessing}
            className={`px-3 py-2 rounded ${bothReady && !isProcessing ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-gray-700 text-gray-300 cursor-not-allowed'}`}
          >
            {isProcessing ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
      )}
    </div>
  );
};

export default UploadControls;


