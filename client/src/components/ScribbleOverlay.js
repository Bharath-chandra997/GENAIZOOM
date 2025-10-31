import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FiX, FiEdit3, FiRotateCcw, FiRotateCw, FiTrash2, FiMinusCircle, FiSquare, FiCircle, FiArrowUpRight, FiZoomIn, FiMove } from 'react-icons/fi';
import './ScribbleOverlay.css';

const generateRandomColor = () => `#${Math.random().toString(16).slice(2, 8)}`;

const ScribbleOverlay = ({
  socketRef,
  roomId,
  onClose,
  initialColor,
}) => {
  const [image, setImage] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [drawings, setDrawings] = useState([]);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(initialColor || generateRandomColor());
  const [thickness, setThickness] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const lastPointRef = useRef(null);

  // Socket subscriptions
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;

    const onImage = (img) => setImage(img);
    const onDrawings = (data) => setDrawings(Array.isArray(data) ? data : []);

    socket.on('scribble:image', onImage);
    socket.on('scribble:drawings', onDrawings);

    // Request current state immediately
    socket.emit('scribble:request-state', { roomId });

    return () => {
      socket.off('scribble:image', onImage);
      socket.off('scribble:drawings', onDrawings);
    };
  }, [socketRef, roomId]);

  // Drawing renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    if (canvas.width !== clientWidth * dpr || canvas.height !== clientHeight * dpr) {
      canvas.width = clientWidth * dpr;
      canvas.height = clientHeight * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, clientWidth, clientHeight);

    // Draw image centered at 70% viewport width
    if (image) {
      const img = new Image();
      img.onload = () => {
        const maxW = clientWidth * 0.7;
        const scale = Math.min(maxW / img.width, (clientHeight * 0.7) / img.height);
        const drawW = img.width * scale * zoom;
        const drawH = img.height * scale * zoom;
        const x = (clientWidth - drawW) / 2;
        const y = (clientHeight - drawH) / 2;
        ctx.drawImage(img, x, y, drawW, drawH);

        // Draw strokes over image
        drawAllStrokes(ctx);
      };
      img.src = image;
    } else {
      drawAllStrokes(ctx);
    }

    function drawAllStrokes(context) {
      drawings.forEach((s) => {
        if (s.type === 'path') {
          context.strokeStyle = s.color;
          context.lineWidth = s.width;
          context.lineJoin = 'round';
          context.lineCap = 'round';
          context.beginPath();
          s.points.forEach((p, idx) => {
            if (idx === 0) context.moveTo(p.x, p.y);
            else context.lineTo(p.x, p.y);
          });
          context.stroke();
        } else if (s.type === 'shape') {
          context.strokeStyle = s.color;
          context.lineWidth = s.width;
          if (s.shape === 'rect') {
            context.strokeRect(s.x, s.y, s.w, s.h);
          } else if (s.shape === 'circle') {
            context.beginPath();
            context.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
            context.stroke();
          } else if (s.shape === 'arrow') {
            context.beginPath();
            context.moveTo(s.x1, s.y1);
            context.lineTo(s.x2, s.y2);
            context.stroke();
          }
        }
      });
    }
  }, [image, drawings, zoom]);

  const emitDrawings = (updated) => {
    setDrawings(updated);
    const socket = socketRef?.current;
    if (socket) socket.emit('scribble:drawings', { roomId, data: updated });
  };

  const handlePointerDown = (e) => {
    if (!image) return;
    setIsDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastPointRef.current = { x, y };

    if (tool === 'pen') {
      const stroke = { type: 'path', color, width: thickness, points: [{ x, y }] };
      emitDrawings([...drawings, stroke]);
    } else if (tool === 'eraser') {
      // Simple eraser: remove last stroke
      emitDrawings(drawings.slice(0, -1));
    }
  };

  const handlePointerMove = (e) => {
    if (!isDrawing || tool !== 'pen') return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const updated = [...drawings];
    const last = updated[updated.length - 1];
    if (last && last.type === 'path') {
      last.points.push({ x, y });
      emitDrawings(updated);
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    lastPointRef.current = null;
  };

  const handleUpload = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const confirmImage = () => {
    const img = pendingImage;
    setPendingImage(null);
    setImage(img);
    const socket = socketRef?.current;
    if (socket) socket.emit('scribble:image', { roomId, img });
    // New image clears drawings
    emitDrawings([]);
  };

  return (
    <div className="scribble-root">
      <div className="scribble-backdrop" />
      <div className="scribble-stage" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="scribble-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>

      {!image && (
        <motion.div
          className="scribble-modal"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h3>Upload an image</h3>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
          {pendingImage && (
            <div className="scribble-actions">
              <button onClick={() => setPendingImage(null)}>Remove</button>
              <button onClick={confirmImage}>Confirm</button>
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
            <button className="tool" onClick={() => setTool('rect')} title="Rectangle"><FiSquare /></button>
            <button className="tool" onClick={() => setTool('circle')} title="Circle"><FiCircle /></button>
            <button className="tool" onClick={() => setTool('arrow')} title="Arrow"><FiArrowUpRight /></button>
            <button className="tool" onClick={() => { if (drawings.length) emitDrawings(drawings.slice(0, -1)); }} title="Undo"><FiRotateCcw /></button>
            <button className="tool" onClick={() => emitDrawings([])} title="Clear All"><FiTrash2 /></button>
            <button className="tool" onClick={() => setZoom(Math.min(2, zoom + 0.1))} title="Zoom In"><FiZoomIn /></button>
            <button className="tool" onClick={() => setTool('move')} title="Move"><FiMove /></button>
            <button className="tool danger" onClick={onClose} title="Close"><FiX /></button>
          </div>
          <div className="scribble-row">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            <input type="range" min="1" max="20" value={thickness} onChange={(e) => setThickness(parseInt(e.target.value, 10))} />
            <div className="scribble-user" title="Your color">
              <span className="dot" style={{ backgroundColor: color }} />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default ScribbleOverlay;


