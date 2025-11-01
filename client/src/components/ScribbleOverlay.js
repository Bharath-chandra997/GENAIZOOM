import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FiX, FiEdit3, FiRotateCcw, FiRotateCw, FiTrash2, FiMinusCircle, FiSquare, FiCircle, FiArrowUpRight, FiZoomIn, FiMove } from 'react-icons/fi';
import { extractAIQuestionAndAnswer } from '../utils/aiResponseHelpers';
import './ScribbleOverlay.css';

const ScribbleOverlay = ({
  socketRef,
  roomId,
  onClose,
  participants = [],
  currentUser,
  aiResponse = null, // AI response object with sent_from_csv
}) => {
  const [image, setImage] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [strokesArray, setStrokesArray] = useState([]); // Server-sent strokes array
  const [tool, setTool] = useState('pen');
  const [userColors, setUserColors] = useState({}); // Server-sent userColors mapping
  const [myColor, setMyColor] = useState('#000000'); // Current user's color from server
  const [thickness, setThickness] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const canvasImageRef = useRef(null); // Static image layer
  const canvasDrawRef = useRef(null); // Drawing overlay layer
  const containerRef = useRef(null);
  const lastPointRef = useRef(null);
  const [uploadLocked, setUploadLocked] = useState(false);
  const [lockedBy, setLockedBy] = useState(null);
  const imageRef = useRef(null);
  const previewRef = useRef(null);
  const redoStackRef = useRef([]);
  const undoStackRef = useRef([]);
  const animationFrameRef = useRef(null);
  const strokesBufferRef = useRef([]); // Local buffer for strokes being drawn
  const currentStrokeRef = useRef(null); // Current stroke being drawn

  // Socket subscriptions
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;

    const onImage = (img) => {
      setImage(img);
      if (img) {
        const imgEl = new Image();
        imgEl.onload = () => {
          imageRef.current = imgEl;
          drawImageToCanvas();
        };
        imgEl.src = img;
      } else {
        imageRef.current = null;
        clearDrawCanvas();
      }
    };
    
    const onDrawings = (data) => {
      if (Array.isArray(data)) {
        setStrokesArray(data);
      }
    };
    
    const onLock = ({ locked, by }) => {
      setUploadLocked(locked);
      setLockedBy(by || null);
    };
    
    const onRemoveImage = () => {
      setImage(null);
      setStrokesArray([]);
      setUploadLocked(false);
      setLockedBy(null);
      imageRef.current = null;
      clearDrawCanvas();
      strokesBufferRef.current = [];
    };
    
    const onUserColors = (colors) => {
      setUserColors(colors || {});
      if (currentUser?.id && colors[currentUser.id]) {
        setMyColor(colors[currentUser.id]);
      }
    };
    
    const onCanUpload = ({ canUpload, message }) => {
      if (!canUpload && message) {
        console.log(message);
      }
    };

    const onStroke = (stroke) => {
      // Append individual stroke for real-time updates
      setStrokesArray(prev => [...prev, stroke]);
    };

    socket.on('scribble:image', onImage);
    socket.on('scribble:drawings', onDrawings);
    socket.on('scribble:stroke', onStroke);
    socket.on('scribble:lock', onLock);
    socket.on('scribble:removeImage', onRemoveImage);
    socket.on('scribble:userColors', onUserColors);
    socket.on('scribble:canUpload', onCanUpload);

    // Request current state immediately
    socket.emit('scribble:request-state', { roomId });

    return () => {
      socket.off('scribble:image', onImage);
      socket.off('scribble:drawings', onDrawings);
      socket.off('scribble:stroke', onStroke);
      socket.off('scribble:lock', onLock);
      socket.off('scribble:removeImage', onRemoveImage);
      socket.off('scribble:userColors', onUserColors);
      socket.off('scribble:canUpload', onCanUpload);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [socketRef, roomId, currentUser]);

  // Draw image to static canvas (only once when image loads/changes)
  const drawImageToCanvas = () => {
    const canvas = canvasImageRef.current;
    if (!canvas || !imageRef.current) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    if (canvas.width !== clientWidth * dpr || canvas.height !== clientHeight * dpr) {
      canvas.width = clientWidth * dpr;
      canvas.height = clientHeight * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, clientWidth, clientHeight);
    
    const img = imageRef.current;
    const maxW = clientWidth * 0.7;
    const scale = Math.min(maxW / img.width, (clientHeight * 0.7) / img.height);
    const drawW = img.width * scale * zoom;
    const drawH = img.height * scale * zoom;
    const x = (clientWidth - drawW) / 2;
    const y = (clientHeight - drawH) / 2;
    ctx.drawImage(img, x, y, drawW, drawH);
  };

  // Clear only the drawing canvas
  const clearDrawCanvas = () => {
    const canvas = canvasDrawRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Draw loop: composite strokes onto drawing canvas
  const drawLoop = () => {
    const canvas = canvasDrawRef.current;
    if (!canvas) {
      animationFrameRef.current = requestAnimationFrame(drawLoop);
      return;
    }
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    const displayWidth = clientWidth * dpr;
    const displayHeight = clientHeight * dpr;
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, clientWidth, clientHeight);
    
    // Draw all strokes from server array + local buffer + current stroke
    const allStrokes = [...strokesArray, ...strokesBufferRef.current];
    if (currentStrokeRef.current) {
      allStrokes.push(currentStrokeRef.current);
    }
    
    allStrokes.forEach((s) => {
      if (s.type === 'path') {
        ctx.save();
        ctx.globalAlpha = s.alpha ?? 1;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (s.points && s.points.length > 0) {
          s.points.forEach((p, idx) => {
            if (idx === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.stroke();
        }
        ctx.restore();
      } else if (s.type === 'shape') {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        if (s.shape === 'rect') {
          ctx.strokeRect(s.x, s.y, s.w, s.h);
        } else if (s.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
          ctx.stroke();
        } else if (s.shape === 'arrow' || s.shape === 'line') {
          ctx.beginPath();
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
          ctx.stroke();
        }
      } else if (s.type === 'text') {
        ctx.fillStyle = s.color;
        ctx.font = `${s.size || 18}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
        ctx.fillText(s.text, s.x, s.y);
      }
    });
    
    // Draw preview if any
    const p = previewRef.current;
    if (p) {
      ctx.save();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width;
      if (p.shape === 'rect') ctx.strokeRect(p.x, p.y, p.w, p.h);
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (p.shape === 'arrow' || p.shape === 'line') {
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
      }
      ctx.restore();
    }
    
    animationFrameRef.current = requestAnimationFrame(drawLoop);
  };

  // Start draw loop on mount
  useEffect(() => {
    drawLoop();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Update image canvas when zoom or image changes
  useEffect(() => {
    if (imageRef.current) {
      drawImageToCanvas();
    }
  }, [zoom, image]);

  const emitDrawings = (updated) => {
    setStrokesArray(updated);
    const socket = socketRef?.current;
    if (socket) socket.emit('scribble:drawings', { roomId, data: updated });
  };

  const emitStroke = (stroke) => {
    // Emit individual stroke for real-time sync
    const socket = socketRef?.current;
    if (socket) {
      socket.emit('scribble:stroke', { roomId, stroke });
    }
  };

  const handlePointerDown = (e) => {
    if (!image) return;
    setIsDrawing(true);
    const rect = canvasDrawRef.current.getBoundingClientRect();
    // Coordinates in CSS pixels (will be transformed by ctx.setTransform)
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastPointRef.current = { x, y };

    if (tool === 'pen' || tool === 'highlighter') {
      const stroke = { 
        id: Date.now() + Math.random(), // Unique ID
        type: 'path', 
        color: myColor, // Use server-assigned color
        width: thickness, 
        points: [{ x, y }], 
        alpha: tool === 'highlighter' ? 0.35 : 1,
        userId: currentUser?.id
      };
      currentStrokeRef.current = stroke;
      // Add to local buffer for immediate rendering
      strokesBufferRef.current.push(stroke);
      emitDrawings([...strokesArray, stroke]);
      emitStroke(stroke);
    } else if (tool === 'eraser') {
      // Eraser: remove last stroke
      const updated = strokesArray.slice(0, -1);
      if (updated.length < strokesArray.length) {
        undoStackRef.current.push(strokesArray[strokesArray.length - 1]);
        emitDrawings(updated);
        redoStackRef.current = [];
      }
    } else if (['rect','circle','arrow','line'].includes(tool)) {
      previewRef.current = { shape: tool, color: myColor, width: thickness, x, y, x1:x, y1:y };
    } else if (tool === 'text') {
      const text = window.prompt('Enter text');
      if (text && text.trim()) {
        const stroke = { 
          id: Date.now() + Math.random(),
          type: 'text', 
          text, 
          x, 
          y, 
          color: myColor, 
          size: Math.max(14, thickness * 3),
          userId: currentUser?.id
        };
        emitDrawings([...strokesArray, stroke]);
        emitStroke(stroke);
        redoStackRef.current = [];
      }
    }
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;
    const rect = canvasDrawRef.current.getBoundingClientRect();
    // Coordinates in CSS pixels (will be transformed by ctx.setTransform)
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (tool === 'pen' || tool === 'highlighter') {
      // Update current stroke
      if (currentStrokeRef.current && currentStrokeRef.current.type === 'path') {
        currentStrokeRef.current.points.push({ x, y });
        // Update in buffer too
        const bufferStroke = strokesBufferRef.current[strokesBufferRef.current.length - 1];
        if (bufferStroke && bufferStroke.id === currentStrokeRef.current.id) {
          bufferStroke.points.push({ x, y });
        }
        // Update in strokesArray for persistence
        const updated = [...strokesArray];
        const last = updated[updated.length - 1];
        if (last && last.id === currentStrokeRef.current.id) {
          last.points.push({ x, y });
          emitDrawings(updated);
        }
      }
    } else if (['rect','circle','arrow','line'].includes(tool)) {
      const p = previewRef.current;
      if (!p) return;
      if (tool === 'rect') { p.w = x - p.x; p.h = y - p.y; }
      if (tool === 'circle') { 
        const dx = x - p.x; 
        const dy = y - p.y; 
        p.cx = p.x; 
        p.cy = p.y; 
        p.r = Math.sqrt(dx*dx + dy*dy); 
      }
      if (tool === 'arrow' || tool === 'line') { p.x2 = x; p.y2 = y; }
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    lastPointRef.current = null;
    
    // Finalize current stroke
    if (currentStrokeRef.current) {
      // Stroke is already in strokesArray, just clear current ref
      currentStrokeRef.current = null;
      // Clear buffer after a short delay to ensure rendering
      setTimeout(() => {
        strokesBufferRef.current = [];
      }, 100);
    }
    
    if (previewRef.current) {
      const p = previewRef.current;
      previewRef.current = null;
      const shapeStroke = {
        id: Date.now() + Math.random(),
        type: 'shape',
        shape: p.shape,
        color: myColor,
        width: thickness,
        userId: currentUser?.id
      };
      
      if (p.shape === 'rect') {
        shapeStroke.x = p.x;
        shapeStroke.y = p.y;
        shapeStroke.w = p.w;
        shapeStroke.h = p.h;
      } else if (p.shape === 'circle') {
        shapeStroke.cx = p.cx;
        shapeStroke.cy = p.cy;
        shapeStroke.r = p.r;
      } else if (p.shape === 'arrow' || p.shape === 'line') {
        shapeStroke.x1 = p.x1;
        shapeStroke.y1 = p.y1;
        shapeStroke.x2 = p.x2;
        shapeStroke.y2 = p.y2;
      }
      
      emitDrawings([...strokesArray, shapeStroke]);
      emitStroke(shapeStroke);
      redoStackRef.current = [];
    }
  };

  const handleUpload = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const confirmImage = () => {
    if (uploadLocked && lockedBy && lockedBy !== currentUser?.id) {
      return;
    }
    const img = pendingImage;
    setPendingImage(null);
    setImage(img);
    const socket = socketRef?.current;
    if (socket) socket.emit('scribble:image', { roomId, img });
    // New image clears drawings
    emitDrawings([]);
    strokesBufferRef.current = [];
  };

  const removeConfirmedImage = () => {
    if (uploadLocked && lockedBy !== currentUser?.id) {
      return; // Only locker can remove
    }
    const socket = socketRef?.current;
    if (socket) socket.emit('scribble:removeImage', { roomId });
    // Clear local state
    setImage(null);
    setStrokesArray([]);
    strokesBufferRef.current = [];
  };

  const handleColorChange = (newColor) => {
    setMyColor(newColor);
    const socket = socketRef?.current;
    if (socket && currentUser?.id) {
      socket.emit('scribble:userColorChange', { roomId, id: currentUser.id, color: newColor });
    }
  };

  const undo = () => {
    if (strokesArray.length === 0) return;
    const last = strokesArray[strokesArray.length - 1];
    undoStackRef.current.push(last);
    emitDrawings(strokesArray.slice(0, -1));
    redoStackRef.current = [];
  };

  const redo = () => {
    if (undoStackRef.current.length === 0) return;
    const last = undoStackRef.current.pop();
    emitDrawings([...strokesArray, last]);
  };

  const savePng = () => {
    const canvas = document.createElement('canvas');
    const imgCanvas = canvasImageRef.current;
    const drawCanvas = canvasDrawRef.current;
    if (!imgCanvas || !drawCanvas) return;
    
    const w = imgCanvas.clientWidth;
    const h = imgCanvas.clientHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    
    // Draw image layer
    if (imageRef.current) {
      const img = imageRef.current;
      const maxW = w * 0.7;
      const scale = Math.min(maxW / img.width, (h * 0.7) / img.height);
      const drawW = img.width * scale * zoom;
      const drawH = img.height * scale * zoom;
      const x = (w - drawW) / 2;
      const y = (h - drawH) / 2;
      ctx.drawImage(img, x, y, drawW, drawH);
    }
    
    // Composite drawing layer
    ctx.drawImage(drawCanvas, 0, 0, w, h);
    
    const data = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = data;
    a.download = `scribble-${Date.now()}.png`;
    a.click();
  };

  // Get participant name for locked by
  const getLockedByName = () => {
    if (!lockedBy) return null;
    const participant = participants.find(p => p.userId === lockedBy);
    return participant?.username || 'Another user';
  };

  // Extract AI question and answer using helper utilities
  const { question: aiQuestion, answer: aiAnswer } = extractAIQuestionAndAnswer(aiResponse);

  return (
    <div className="scribble-root">
      <div className="scribble-backdrop" />
      <div className="scribble-stage" ref={containerRef}>
        {/* Image layer (static) */}
        <canvas
          ref={canvasImageRef}
          className="scribble-canvas-image"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        />
        {/* Drawing layer (overlay) */}
        <canvas
          ref={canvasDrawRef}
          className="scribble-canvas-draw"
          style={{ position: 'absolute', inset: 0, cursor: tool === 'pen' || tool === 'highlighter' ? 'crosshair' : 'default' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
        
        {/* AI Q&A Display */}
        {image && (aiQuestion || aiAnswer) && (
          <div className="ai-qa-container">
            {aiQuestion && (
              <div className="ai-question">{aiQuestion}</div>
            )}
            {aiAnswer && (
              <div className="ai-answer">{aiAnswer}</div>
            )}
          </div>
        )}
      </div>
      <button className="scribble-close" onClick={onClose} title="Close Scribble">×</button>

      {!image && (
        <motion.div
          className="scribble-modal"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <button 
            className="scribble-modal-close"
            onClick={onClose}
            title="Close"
          >×</button>
          <div className="scribble-dropzone">
            <div style={{ color:'#fff', fontFamily:'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', fontSize:20, marginBottom:12 }}>
              Upload an image to start Scribbling
            </div>
            {uploadLocked && lockedBy && lockedBy !== currentUser?.id && (
              <div style={{ color: '#ffcc00', marginBottom: 12, fontSize: 14 }}>
                Image locked by {getLockedByName()}. Wait or request removal.
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
              disabled={uploadLocked && lockedBy !== currentUser?.id}
              style={{ display:'block', margin:'0 auto', color:'#fff' }}
            />
          </div>
          {pendingImage && (
            <div className="scribble-actions">
              <button onClick={() => setPendingImage(null)}>🗑️ Remove</button>
              <button 
                disabled={uploadLocked && lockedBy && lockedBy !== currentUser?.id} 
                onClick={confirmImage}
              >
                ✅ Confirm
              </button>
            </div>
          )}
        </motion.div>
      )}

      {image && (
        <motion.div
          className="scribble-toolbar"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <div className="scribble-row">
            <button className={`tool ${tool === 'pen' ? 'active' : ''}`} onClick={() => setTool('pen')} title="Pen"><FiEdit3 /></button>
            <button className={`tool ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')} title="Eraser"><FiMinusCircle /></button>
            <button className={`tool ${tool === 'highlighter' ? 'active' : ''}`} onClick={() => setTool('highlighter')} title="Highlighter">H</button>
            <button className={`tool ${tool === 'rect' ? 'active' : ''}`} onClick={() => setTool('rect')} title="Rectangle"><FiSquare /></button>
            <button className={`tool ${tool === 'circle' ? 'active' : ''}`} onClick={() => setTool('circle')} title="Circle"><FiCircle /></button>
            <button className={`tool ${tool === 'arrow' ? 'active' : ''}`} onClick={() => setTool('arrow')} title="Arrow"><FiArrowUpRight /></button>
            <button className={`tool ${tool === 'line' ? 'active' : ''}`} onClick={() => setTool('line')} title="Line">/</button>
            <button className="tool" onClick={undo} title="Undo" disabled={strokesArray.length === 0}><FiRotateCcw /></button>
            <button className="tool" onClick={redo} title="Redo" disabled={undoStackRef.current.length === 0}><FiRotateCw /></button>
            <button className="tool" onClick={() => emitDrawings([])} title="Clear All"><FiTrash2 /></button>
            <button className="tool" onClick={() => setZoom(Math.min(2, zoom + 0.1))} title="Zoom In"><FiZoomIn /></button>
            <button className="tool" onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} title="Zoom Out">−</button>
            <button className="tool" onClick={savePng} title="Save PNG">⬇️</button>
            <button className="tool danger" onClick={onClose} title="Close"><FiX /></button>
          </div>
          <div className="scribble-row">
            <input 
              type="color" 
              value={myColor} 
              onChange={(e) => handleColorChange(e.target.value)} 
              title="Change Color"
            />
            <input 
              type="range" 
              min="1" 
              max="20" 
              value={thickness} 
              onChange={(e) => setThickness(parseInt(e.target.value, 10))} 
              title="Brush Size"
            />
            <div className="scribble-user" title="Your color">
              <span className="dot" style={{ backgroundColor: myColor }} />
            </div>
            {lockedBy === currentUser?.id && (
              <button className="tool" onClick={removeConfirmedImage} title="Remove Image">🗑️</button>
            )}
          </div>
        </motion.div>
      )}

      {/* Legend - reads from server userColors */}
      <div className="scribble-legend">
        {Object.entries(userColors).map(([socketId, color]) => {
          const participant = participants.find(p => p.userId === socketId);
          if (!participant) return null;
          return (
            <div key={socketId} className="scribble-legend-item">
              <span className="scribble-legend-dot" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
              <span>{participant.username}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ScribbleOverlay;
