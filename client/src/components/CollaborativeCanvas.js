import React, { useEffect, useRef, useState } from 'react';

const CollaborativeCanvas = ({ 
  isScreenSharing, 
  currentTool, 
  currentColor, 
  userColor,
  userId,
  onDrawingData,
  drawingData = []
}) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Set canvas size to cover the entire screen
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Draw all existing drawings
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawingData.forEach(drawing => {
      if (drawing.type === 'path') {
        drawPath(ctx, drawing.points, drawing.color, drawing.tool, drawing.userId);
      } else if (drawing.type === 'shape') {
        drawShape(ctx, drawing.shape, drawing.color, drawing.tool, drawing.userId);
      }
    });
  }, [drawingData]);

  const drawPath = (ctx, points, color, tool, drawingUserId) => {
    if (points.length < 2) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = tool === 'highlighter' ? 20 : tool === 'eraser' ? 30 : 3;
    ctx.globalAlpha = tool === 'highlighter' ? 0.3 : tool === 'eraser' ? 0.1 : 1;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  const drawShape = (ctx, shape, color, tool, drawingUserId) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.globalCompositeOperation = 'source-over';

    if (shape.type === 'rectangle') {
      ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
    } else if (shape.type === 'circle') {
      ctx.beginPath();
      ctx.arc(shape.x, shape.y, shape.radius, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (shape.type === 'arrow') {
      drawArrow(ctx, shape.startX, shape.startY, shape.endX, shape.endY);
    }
  };

  const drawArrow = (ctx, startX, startY, endX, endY) => {
    const headLength = 20;
    const angle = Math.atan2(endY - startY, endX - startX);

    // Draw line
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - headLength * Math.cos(angle - Math.PI / 6), endY - headLength * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - headLength * Math.cos(angle + Math.PI / 6), endY - headLength * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  };

  const getPointFromEvent = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    if (!isScreenSharing) return;
    
    setIsDrawing(true);
    const point = getPointFromEvent(e);
    setLastPoint(point);
    
    if (currentTool === 'pen' || currentTool === 'highlighter' || currentTool === 'eraser') {
      const drawingData = {
        type: 'path',
        points: [point],
        color: currentColor,
        tool: currentTool,
        userId: userId,
        timestamp: Date.now()
      };
      onDrawingData(drawingData);
    }
  };

  const draw = (e) => {
    if (!isDrawing || !isScreenSharing) return;
    
    const point = getPointFromEvent(e);
    
    if (currentTool === 'pen' || currentTool === 'highlighter' || currentTool === 'eraser') {
      const drawingData = {
        type: 'path',
        points: [lastPoint, point],
        color: currentColor,
        tool: currentTool,
        userId: userId,
        timestamp: Date.now()
      };
      onDrawingData(drawingData);
    }
    
    setLastPoint(point);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    setLastPoint(null);
  };

  const saveToHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Remove future history if we're not at the end
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(imageData);
    
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      ctx.putImageData(history[historyIndex - 1], 0, 0);
      setHistoryIndex(historyIndex - 1);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      ctx.putImageData(history[historyIndex + 1], 0, 0);
      setHistoryIndex(historyIndex + 1);
    }
  };

  // Only show canvas when screen sharing is active
  if (!isScreenSharing) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 999,
        pointerEvents: 'auto',
        cursor: currentTool === 'eraser' ? 'crosshair' : 'crosshair',
        backgroundColor: 'transparent',
      }}
      onMouseDown={startDrawing}
      onMouseMove={draw}
      onMouseUp={stopDrawing}
      onMouseLeave={stopDrawing}
      onTouchStart={(e) => {
        e.preventDefault();
        startDrawing(e.touches[0]);
      }}
      onTouchMove={(e) => {
        e.preventDefault();
        draw(e.touches[0]);
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        stopDrawing();
      }}
    />
  );
};

export default CollaborativeCanvas;
