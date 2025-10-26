import React, { useState, useEffect, useRef } from 'react';
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
  const [showColorPicker, setShowColorPicker] = useState(false);
  
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

  // Temporarily show toolbar for debugging
  // if (!isScreenSharing) return null;

  console.log('ScreenShareToolbar rendering:', { isScreenSharing, isExpanded, userColor, isActiveUser });

  // Simple test toolbar that should always be visible
  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        left: '20px',
        width: '200px',
        height: '100px',
        backgroundColor: 'red',
        zIndex: 9999,
        border: '2px solid yellow',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: '16px',
        fontWeight: 'bold',
      }}
    >
      TOOLBAR TEST - {isScreenSharing ? 'SCREEN SHARING' : 'NOT SHARING'}
    </div>
  );

};

export default ScreenShareToolbar;
