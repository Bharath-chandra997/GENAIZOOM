import React, { useRef, useEffect } from 'react';

const AnnotationCanvas = ({ toolbarPosition, isSomeoneScreenSharing, currentTool, currentBrushSize, getColorForId, socketId, onMouseDown, onMouseMove, onMouseUp, onMouseLeave }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const resizeCanvas = () => {
      if (canvas) {
        canvas.width = canvas.parentElement?.clientWidth || 0;
        canvas.height = canvas.parentElement?.clientHeight || 0;
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0"
      style={{ pointerEvents: isSomeoneScreenSharing ? 'auto' : 'none', zIndex: 10, touchAction: 'none' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    />
  );
};

export default AnnotationCanvas;