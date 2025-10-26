import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ScreenShareToolbar = ({ 
  isScreenSharing, 
  onToolSelect, 
  onClearCanvas, 
  onUndo, 
  onRedo,
  currentTool,
  currentColor,
  onColorChange,
  userColor,
  isActiveUser
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const colors = [
    '#ef4444', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#22c55e', // Green
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#6b7280', // Gray
    '#000000', // Black
  ];

  const tools = [
    { id: 'pen', icon: '✏️', name: 'Pen' },
    { id: 'highlighter', icon: '🖍️', name: 'Highlighter' },
    { id: 'eraser', icon: '🧹', name: 'Eraser' },
    { id: 'arrow', icon: '➡️', name: 'Arrow' },
    { id: 'rectangle', icon: '⬜', name: 'Rectangle' },
    { id: 'circle', icon: '⭕', name: 'Circle' },
  ];

  // Only show toolbar when screen sharing is active
  if (!isScreenSharing) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -50 }}
        className="screen-share-toolbar"
        style={{
          position: 'fixed',
          top: '50%',
          left: '20px',
          transform: 'translateY(-50%)',
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(10px)',
          borderRadius: '12px',
          padding: '12px',
          border: `2px solid ${userColor}`,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minWidth: isExpanded ? '200px' : '60px',
          transition: 'all 0.3s ease',
        }}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#e5e7eb',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s ease',
          }}
          onMouseEnter={(e) => e.target.style.background = 'rgba(59, 130, 246, 0.2)'}
          onMouseLeave={(e) => e.target.style.background = 'transparent'}
        >
          {isExpanded ? '◀' : '▶'}
        </button>

        {/* User Color Indicator */}
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: userColor,
            border: '2px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#fff',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
            margin: '0 auto',
          }}
        >
          {isActiveUser ? '✓' : '👤'}
        </div>

        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            {/* Tools */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ color: '#e5e7eb', fontSize: '12px', fontWeight: '600', textAlign: 'center' }}>
                Tools
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                {tools.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => onToolSelect(tool.id)}
                    style={{
                      background: currentTool === tool.id ? userColor : 'rgba(59, 130, 246, 0.1)',
                      border: `1px solid ${currentTool === tool.id ? userColor : 'rgba(59, 130, 246, 0.3)'}`,
                      color: '#e5e7eb',
                      padding: '8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease',
                    }}
                    title={tool.name}
                  >
                    {tool.icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Colors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ color: '#e5e7eb', fontSize: '12px', fontWeight: '600', textAlign: 'center' }}>
                Colors
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                {colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => onColorChange(color)}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: color,
                      border: `2px solid ${currentColor === color ? '#fff' : 'transparent'}`,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    title={`Color: ${color}`}
                  />
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ color: '#e5e7eb', fontSize: '12px', fontWeight: '600', textAlign: 'center' }}>
                Actions
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={onUndo}
                  style={{
                    flex: 1,
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    color: '#e5e7eb',
                    padding: '8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                    transition: 'all 0.2s ease',
                  }}
                >
                  ↶ Undo
                </button>
                <button
                  onClick={onRedo}
                  style={{
                    flex: 1,
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    color: '#e5e7eb',
                    padding: '8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                    transition: 'all 0.2s ease',
                  }}
                >
                  ↷ Redo
                </button>
              </div>
              <button
                onClick={onClearCanvas}
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  padding: '8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                }}
              >
                🗑️ Clear All
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default ScreenShareToolbar;
