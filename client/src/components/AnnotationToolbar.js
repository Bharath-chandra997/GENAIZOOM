// src/components/AnnotationToolbar.js

import React from 'react';

const AnnotationToolbar = ({ currentTool, setCurrentTool, currentBrushSize, setCurrentBrushSize, clearCanvas, isAnnotationActive, toggleAnnotations }) => {
    const tools = ['pen', 'rectangle', 'circle', 'eraser'];

    if (!isAnnotationActive) {
        return (
             <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
                <button 
                    onClick={toggleAnnotations} 
                    title="Start Annotating"
                    style={{ background: '#3c4043', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 15px', cursor: 'pointer' }}
                >
                   ✏️ Annotate
                </button>
            </div>
        )
    }

    return (
        <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(44, 45, 48, 0.9)', padding: '8px 15px', borderRadius: '8px', zIndex: 20, display: 'flex', gap: '10px', alignItems: 'center', color: 'white' }}>
            <button onClick={toggleAnnotations} title="Stop Annotating" style={{border: 'none', background: 'transparent', color: 'white', cursor: 'pointer'}}>✕</button>
            {tools.map(tool => (
                <button
                    key={tool}
                    onClick={() => setCurrentTool(tool)}
                    title={tool.charAt(0).toUpperCase() + tool.slice(1)}
                    style={{ background: currentTool === tool ? '#8ab4f8' : '#3c4043', color: currentTool === tool ? '#202124' : 'white', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', textTransform: 'capitalize' }}
                >
                    {tool}
                </button>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                Size:
                <input
                    type="range"
                    min="2"
                    max="50"
                    value={currentBrushSize}
                    onChange={(e) => setCurrentBrushSize(e.target.value)}
                    title="Brush Size"
                />
            </label>
            <button onClick={clearCanvas} title="Clear All" style={{ background: '#3c4043', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer' }}>
                Clear
            </button>
        </div>
    );
};

export default AnnotationToolbar;