import React, { useState, useRef, useEffect } from 'react';

/**
 * ImageAudioSection Component
 * Displays uploaded image and audio files side-by-side for all meeting participants
 * Audio is hosted and accessible to all, but playback is individual per participant
 */
const ImageAudioSection = ({ 
  imageUrl, 
  audioUrl, 
  uploaderUsername, 
  isProcessing, 
  onProcessWithAI,
  isBotLocked,
  currentUploader,
  socketId 
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef(null);

  // Handle audio play/pause
  const handlePlay = () => {
    if (audioRef.current) {
      audioRef.current.play()
        .then(() => {
          setIsPlaying(true);
          setAudioError(false);
        })
        .catch(err => {
          console.error('Audio play error:', err);
          setAudioError(true);
          setIsPlaying(false);
        });
    }
  };

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => setIsPlaying(false);
    const handleError = () => {
      setAudioError(true);
      setIsPlaying(false);
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [audioUrl]);

  // Don't render if no files uploaded
  if (!imageUrl && !audioUrl) {
    return null;
  }

  const isOwnUpload = socketId ? currentUploader === socketId : false;
  const canProcess = !isProcessing && (!isBotLocked || isOwnUpload);

  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-white">
          📁 Uploaded Files
        </h3>
        {uploaderUsername && (
          <span className="text-sm text-gray-400">
            Uploaded by: <span className="text-purple-300">{uploaderUsername}</span>
          </span>
        )}
      </div>

      {/* Files Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Image Section */}
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-300 mb-2">📷 Image</label>
          {imageUrl ? (
            <div className="relative bg-gray-900 rounded-lg overflow-hidden">
              <img 
                src={imageUrl} 
                alt="Uploaded content" 
                className="w-full h-48 object-contain bg-gray-900"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="absolute inset-0 hidden items-center justify-center bg-gray-900 text-gray-400">
                <span>Failed to load image</span>
              </div>
            </div>
          ) : (
            <div className="h-48 bg-gray-900 rounded-lg flex items-center justify-center text-gray-400">
              <span>No image uploaded</span>
            </div>
          )}
        </div>

        {/* Audio Section */}
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-300 mb-2">🎵 Audio</label>
          {audioUrl ? (
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="flex flex-col items-center space-y-3">
                {/* Audio Controls */}
                <div className="flex items-center space-x-3">
                  <button
                    onClick={isPlaying ? handlePause : handlePlay}
                    disabled={audioError}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      audioError 
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : isPlaying
                        ? 'bg-red-600 hover:bg-red-500 text-white'
                        : 'bg-green-600 hover:bg-green-500 text-white'
                    }`}
                  >
                    {audioError ? '❌ Error' : isPlaying ? '⏸️ Pause' : '▶️ Play'}
                  </button>
                  
                  {audioError && (
                    <span className="text-red-400 text-sm">
                      Audio playback failed
                    </span>
                  )}
                </div>

                {/* Audio Info */}
                <div className="text-center">
                  <p className="text-sm text-gray-300">
                    {isPlaying ? 'Now Playing' : 'Ready to Play'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Individual playback - only you will hear this
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-32 bg-gray-900 rounded-lg flex items-center justify-center text-gray-400">
              <span>No audio uploaded</span>
            </div>
          )}
        </div>
      </div>

      {/* AI Process Button */}
      <div className="flex justify-center">
        <button
          onClick={onProcessWithAI}
          disabled={!canProcess || !imageUrl || !audioUrl}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            canProcess && imageUrl && audioUrl
              ? 'bg-purple-600 hover:bg-purple-500 text-white'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isProcessing ? (
            <span className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Processing with AI...</span>
            </span>
          ) : (
            '🤖 Process with AI'
          )}
        </button>
      </div>

      {/* Status Messages */}
      {isBotLocked && !isOwnUpload && (
        <div className="mt-3 text-center">
          <span className="text-yellow-400 text-sm">
            🔒 Another user is currently processing. Please wait.
          </span>
        </div>
      )}

      {!imageUrl || !audioUrl ? (
        <div className="mt-3 text-center">
          <span className="text-gray-400 text-sm">
            Upload both image and audio files to enable AI processing
          </span>
        </div>
      ) : null}

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default ImageAudioSection;
