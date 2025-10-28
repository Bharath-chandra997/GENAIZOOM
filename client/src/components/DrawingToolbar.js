import React, { useState } from 'react';
import Draggable from 'react-draggable';
import './DrawingToolbar.css';

const DrawingToolbar = ({ 
  currentTool, 
  onToolChange, 
  currentColor, 
  onColorChange,
  onClear,
  onUndo,
  onRedo,
  onSave,
  canUndo,
  canRedo,
  isVisible,
  onToggle,
  username,
  userColor,
  brushSize,
  onBrushSizeChange
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const colors = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080'
  ];

  const tools = [
    { id: 'pen', icon: '✏️', name: 'Pen' },
    { id: 'highlighter', icon: '🖍️', name: 'Highlighter' },
    { id: 'rectangle', icon: '⬛', name: 'Rectangle' },
    { id: 'circle', icon: '⭕', name: 'Circle' },
    { id: 'line', icon: '📏', name: 'Line' },
    { id: 'arrow', icon: '➡️', name: 'Arrow' },
    { id: 'eraser', icon: '🧽', name: 'Eraser' }
  ];

  if (!isVisible) return null;

  return (
    <Draggable handle=".drawing-toolbar-handle">
      <div className={`drawing-toolbar ${!isExpanded ? 'drawing-toolbar--collapsed' : ''}`}>
        <div className="drawing-toolbar-handle" onClick={() => setIsExpanded(!isExpanded)}>
          <span className="drawing-toolbar-handle-icon">⋯</span>
          <span className="drawing-toolbar-handle-text">Drawing Tools</span>
          {username && (
            <span className="drawing-toolbar-user">
              <span className="drawing-toolbar-user-color" style={{ backgroundColor: userColor }} />
              {username}
            </span>
          )}
          <button 
            className="drawing-toolbar-close" 
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            ✕
          </button>
        </div>
        
        {isExpanded && (
          <div className="drawing-toolbar-content">
            {/* Tools */}
            <div className="drawing-toolbar-section">
              <label className="drawing-toolbar-label">Tools</label>
              <div className="drawing-toolbar-tools">
                {tools.map(tool => (
                  <button
                    key={tool.id}
                    className={`drawing-toolbar-btn ${currentTool === tool.id ? 'drawing-toolbar-btn--active' : ''}`}
                    onClick={() => onToolChange(tool.id)}
                    title={tool.name}
                  >
                    {tool.icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Picker */}
            <div className="drawing-toolbar-section">
              <label className="drawing-toolbar-label">Colors</label>
              <div className="drawing-toolbar-colors">
                {colors.map(color => (
                  <button
                    key={color}
                    className="drawing-toolbar-color-btn"
                    style={{ backgroundColor: color }}
                    onClick={() => onColorChange(color)}
                    title={color}
                  />
                ))}
              </div>
            </div>

            {/* Thickness */}
            <div className="drawing-toolbar-section">
              <label className="drawing-toolbar-label">Thickness</label>
              <input
                type="range"
                min="1"
                max="30"
                value={brushSize}
                onChange={(e) => onBrushSizeChange?.(parseInt(e.target.value, 10))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Actions */}
            <div className="drawing-toolbar-section">
              <div className="drawing-toolbar-actions">
                <button 
                  className="drawing-toolbar-btn drawing-toolbar-btn--action"
                  onClick={onUndo}
                  disabled={!canUndo}
                  title="Undo"
                >
                  ↶ Undo
                </button>
                <button 
                  className="drawing-toolbar-btn drawing-toolbar-btn--action"
                  onClick={onRedo}
                  disabled={!canRedo}
                  title="Redo"
                >
                  ↷ Redo
                </button>
                <button 
                  className="drawing-toolbar-btn drawing-toolbar-btn--action drawing-toolbar-btn--danger"
                  onClick={onClear}
                  title="Clear All"
                >
                  🧹 Clear
                </button>
                <button 
                  className="drawing-toolbar-btn drawing-toolbar-btn--action drawing-toolbar-btn--save"
                  onClick={onSave}
                  title="Save Drawing"
                >
                  💾 Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Draggable>
  );
};

export default DrawingToolbar;

