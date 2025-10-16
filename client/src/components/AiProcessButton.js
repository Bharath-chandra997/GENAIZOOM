import React from 'react';

/**
 * AiProcessButton Component
 * Handles AI processing with proper state management and error handling
 */
const AiProcessButton = ({ 
  isProcessing, 
  isBotLocked, 
  canProcess, 
  hasImage, 
  hasAudio, 
  onProcess,
  uploaderUsername 
}) => {
  const getButtonText = () => {
    if (isProcessing) {
      return (
        <span className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          <span>Processing with AI...</span>
        </span>
      );
    }
    return '🤖 Process with AI';
  };

  const getDisabledReason = () => {
    if (isProcessing) return 'AI is currently processing';
    if (isBotLocked && !canProcess) return `Another user (${uploaderUsername}) is processing`;
    if (!hasImage) return 'Please upload an image first';
    if (!hasAudio) return 'Please upload an audio file first';
    return null;
  };

  const disabledReason = getDisabledReason();
  const isDisabled = isProcessing || isBotLocked || !hasImage || !hasAudio;

  return (
    <div className="flex flex-col items-center space-y-3">
      <button
        onClick={onProcess}
        disabled={isDisabled}
        className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
          isDisabled
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
        }`}
        title={disabledReason || 'Click to process with AI'}
      >
        {getButtonText()}
      </button>

      {/* Status Messages */}
      {disabledReason && (
        <div className="text-center">
          <span className="text-sm text-gray-400">
            {disabledReason}
          </span>
        </div>
      )}

      {isBotLocked && !canProcess && uploaderUsername && (
        <div className="text-center">
          <span className="text-sm text-yellow-400">
            🔒 {uploaderUsername} is currently processing. Please wait.
          </span>
        </div>
      )}
    </div>
  );
};

export default AiProcessButton;
