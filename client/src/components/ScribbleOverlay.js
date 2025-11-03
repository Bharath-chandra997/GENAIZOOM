import React, { useRef, useEffect, useState, useCallback } from 'react';
import './ScribbleOverlay.css';

const ScribbleOverlay = ({
  socketRef,
  roomId,
  onClose,
  participants,
  currentUser,
  aiResponse,
}) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#FF0000');
  const [brushSize, setBrushSize] = useState(5);
  const [strokes, setStrokes] = useState([]);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedBy, setLockedBy] = useState(null);

  const userColor = participants.find(p => p.socketId === currentUser.id)?.color || '#FFFFFF';

  // === FETCH BACKGROUND IMAGE FROM SERVER ===
  useEffect(() => {
    const fetchState = () => {
      socketRef.current?.emit('scribble:request-state', { roomId });
    };
    fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, [socketRef, roomId]);

  // === SOCKET LISTENERS ===
  useEffect(() => {
    if (!socketRef.current) return;

    const handleImage = (img) => {
      setImageUrl(img);
    };
    const handleDrawings = (drawings) => {
      setStrokes(drawings);
    };
    const handleStroke = (stroke) => {
      setStrokes(prev => {
        const exists = prev.find(s => s.id === stroke.id);
        if (exists) {
          return prev.map(s => s.id === stroke.id ? stroke : s);
        }
        return [...prev, stroke];
      });
    };
    const handleLock = ({ locked, by }) => {
      setIsLocked(locked);
      setLockedBy(by);
    };
    const handleUserColors = (colors) => {
      // Optional: sync colors
    };

    socketRef.current.on('scribble:image', handleImage);
    socketRef.current.on('scribble:drawings', handleDrawings);
    socketRef.current.on('scribble:stroke', handleStroke);
    socketRef.current.on('scribble:lock', handleLock);
    socketRef.current.on('scribble:userColors', handleUserColors);
    socketRef.current.on('scribble:removeImage', () => {
      setImageUrl(null);
      setStrokes([]);
      onClose();
    });

    return () => {
      socketRef.current?.off('scribble:image');
      socketRef.current?.off('scribble:drawings');
      socketRef.current?.off('scribble:stroke');
      socketRef.current?.off('scribble:lock');
      socketRef.current?.off('scribble:userColors');
      socketRef.current?.off('scribble:removeImage');
    };
  }, [socketRef, onClose]);

  // === CANVAS SETUP ===
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      redraw();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [strokes, imageUrl]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image
    if (imageUrl) {
      const img = new Image();
      img.src = imageUrl;
      img.onload = () => {
        ctx.globalAlpha = 0.92;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;
        drawStrokes();
      };
    } else {
      drawStrokes();
    }
  }, [strokes, imageUrl]);

  const drawStrokes = () => {
    const ctx = canvasRef.current.getContext('2d');
    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      stroke.points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.stroke();
    });
  };

  // === DRAWING LOGIC ===
  const getCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDrawing = (e) => {
    if (isLocked && lockedBy !== currentUser.id) return;
    setIsDrawing(true);
    const pos = getCoords(e);
    const stroke = {
      id: `${Date.now()}-${Math.random()}`,
      color: color,
      size: brushSize,
      points: [pos],
      userId: currentUser.id,
      username: currentUser.username,
    };
    setCurrentStroke(stroke);
  };

  const draw = (e) => {
    if (!isDrawing || !currentStroke) return;
    const pos = getCoords(e);
    const updated = { ...currentStroke, points: [...currentStroke.points, pos] };
    setCurrentStroke(updated);
    socketRef.current?.emit('scribble:stroke', { roomId, stroke: updated });
  };

  const stopDrawing = () => {
    if (!currentStroke) return;
    setStrokes(prev => [...prev, currentStroke]);
    socketRef.current?.emit('scribble:drawings', { roomId, data: [...strokes, currentStroke] });
    setCurrentStroke(null);
    setIsDrawing(false);
  };

  // === UPLOAD IMAGE ===
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = ev.target.result;
      setImageUrl(img);
      setStrokes([]);
      socketRef.current?.emit('scribble:image', { roomId, img });
      socketRef.current?.emit('scribble:lock', { locked: true, by: currentUser.id });
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    socketRef.current?.emit('scribble:removeImage', { roomId });
    setImageUrl(null);
    setStrokes([]);
  };

  return (
    <div className="scribble-overlay">
      <div className="scribble-toolbar">
        <button onClick={onClose} className="scribble-close">✕</button>

        <div className="scribble-tools">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            title="Color"
          />
          <input
            type="range"
            min="1"
            max="20"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            title="Brush Size"
          />
          <label className="scribble-upload">
            📷 Upload
            <input type="file" accept="image/*" onChange={handleImageUpload} />
          </label>
          <button onClick={removeImage} className="scribble-remove">🗑️ Clear</button>
        </div>

        {isLocked && (
          <div className="scribble-lock">
            {lockedBy === currentUser.id ? '🔒 You locked' : `🔒 Locked by ${lockedBy}`}
          </div>
        )}
      </div>

      <canvas
        ref={canvasRef}
        className="scribble-canvas"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />

      {aiResponse && (
        <div className="scribble-ai-response">
          <strong>AI:</strong> {aiResponse}
        </div>
      )}
    </div>
  );
};

export default ScribbleOverlay;