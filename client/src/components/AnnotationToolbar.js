// src/components/AnnotationToolbar.js

import React from 'react';
import { FaPen, FaEraser, FaRegCircle, FaRegSquare, FaTrash } from 'react-icons/fa';

const AnnotationToolbar = ({
  isAnnotationActive,
  toggleAnnotations,
  currentTool,
  setCurrentTool,
  currentBrushSize,
  setCurrentBrushSize,
  clearCanvas,
  onMouseDown, // Prop for dragging
}) => {
  const tools = [
    { id: 'pen', icon: <FaPen /> },
    { id: 'eraser', icon: <FaEraser /> },
    { id: 'rectangle', icon: <FaRegSquare /> },
    { id: 'circle', icon: <FaRegCircle /> },
  ];

  return (
    <div
      className="absolute bg-gray-800/80 backdrop-blur-sm text-white p-2 rounded-lg shadow-2xl flex items-center gap-4 cursor-move z-50"
      onMouseDown={onMouseDown} // Attach the drag handler here
    >
      {/* Activate Annotations Button */}
      <button
        onClick={(e) => { e.stopPropagation(); toggleAnnotations(); }}
        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${isAnnotationActive ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-700 hover:bg-gray-600'}`}
      >
        {isAnnotationActive ? 'On' : 'Off'}
      </button>

      {isAnnotationActive && (
        <>
          {/* Tool Selection */}
          <div className="flex items-center gap-1 bg-gray-900/50 p-1 rounded-md">
            {tools.map(tool => (
              <button
                key={tool.id}
                onClick={(e) => { e.stopPropagation(); setCurrentTool(tool.id); }}
                className={`p-2 rounded-md transition-colors ${currentTool === tool.id ? 'bg-blue-500' : 'hover:bg-gray-600'}`}
                title={tool.id.charAt(0).toUpperCase() + tool.id.slice(1)}
              >
                {tool.icon}
              </button>
            ))}
          </div>

          {/* Brush Size Slider */}
          <input
            type="range"
            min="1"
            max="50"
            value={currentBrushSize}
            onChange={(e) => { e.stopPropagation(); setCurrentBrushSize(e.target.value); }}
            className="w-24 cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          />
          
          {/* Clear Button */}
          <button
            onClick={(e) => { e.stopPropagation(); clearCanvas(); }}
            className="p-2 text-red-400 hover:bg-red-500 hover:text-white rounded-md transition-colors"
            title="Clear All"
          >
            <FaTrash />
          </button>
        </>
      )}
    </div>
  );
};

export default AnnotationToolbar;