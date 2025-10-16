import React from 'react';

/**
 * AiResultDisplay Component
 * Displays AI processing results in a styled container
 */
const AiResultDisplay = ({ 
  output, 
  isProcessing, 
  uploaderUsername,
  isVisible = true 
}) => {
  if (!isVisible) return null;

  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-white">
          🤖 AI Analysis Result
        </h3>
        {uploaderUsername && (
          <span className="text-sm text-gray-400">
            Processed by: <span className="text-purple-300">{uploaderUsername}</span>
          </span>
        )}
      </div>

      <div className="bg-gray-900 rounded-lg p-4 min-h-[120px]">
        {isProcessing ? (
          <div className="flex items-center justify-center h-24">
            <div className="flex items-center space-x-3 text-yellow-400">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-400"></div>
              <span className="text-lg font-medium">AI is analyzing your files...</span>
            </div>
          </div>
        ) : output ? (
          <div className="prose prose-invert max-w-none">
            <div className="text-white whitespace-pre-wrap leading-relaxed">
              {output}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-24 text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-2">🤖</div>
              <p className="text-lg">AI result will appear here</p>
              <p className="text-sm mt-1">Upload files and click "Process with AI" to get started</p>
            </div>
          </div>
        )}
      </div>

      {/* Processing indicator */}
      {isProcessing && (
        <div className="mt-3 text-center">
          <div className="inline-flex items-center space-x-2 text-yellow-400 text-sm">
            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
            <span>Processing may take a few moments...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiResultDisplay;
