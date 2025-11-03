// import React, { useEffect, useRef, useState } from 'react';
// import { motion } from 'framer-motion';
// import { FiX, FiEdit3, FiRotateCcw, FiRotateCw, FiTrash2, FiMinusCircle, FiSquare, FiCircle, FiArrowUpRight, FiZoomIn, FiMove } from 'react-icons/fi';
// import { extractAIQuestionAndAnswer } from '../utils/aiResponseHelpers';
// import './ScribbleOverlay.css';

// const ScribbleOverlay = ({
//   socketRef,
//   roomId,
//   onClose,
//   participants = [],
//   currentUser,
//   aiResponse = null, // AI response object with sent_from_csv
// }) => {
//   const [image, setImage] = useState(null);
//   const [pendingImage, setPendingImage] = useState(null);
//   const [strokesArray, setStrokesArray] = useState([]); // Server-sent strokes array
//   const [tool, setTool] = useState('pen');
//   const [userColors, setUserColors] = useState({}); // Server-sent userColors mapping
//   const [myColor, setMyColor] = useState('#000000'); // Current user's color from server
//   const [thickness, setThickness] = useState(4);
//   const [isDrawing, setIsDrawing] = useState(false);
//   const [zoom, setZoom] = useState(1);
//   const canvasImageRef = useRef(null); // Static image layer
//   const canvasDrawRef = useRef(null); // Drawing overlay layer
//   const containerRef = useRef(null);
//   const lastPointRef = useRef(null);
//   const [uploadLocked, setUploadLocked] = useState(false);
//   const [lockedBy, setLockedBy] = useState(null);
//   const imageRef = useRef(null);
//   const previewRef = useRef(null);
//   const redoStackRef = useRef([]);
//   const undoStackRef = useRef([]);
//   const animationFrameRef = useRef(null);
//   const strokesBufferRef = useRef([]); // Local buffer for strokes being drawn
//   const currentStrokeRef = useRef(null); // Current stroke being drawn

//   // Socket subscriptions
//   useEffect(() => {
//     const socket = socketRef?.current;
//     if (!socket) return;

//     const onImage = (img) => {
//       setImage(img);
//       if (img) {
//         const imgEl = new Image();
//         imgEl.onload = () => {
//           imageRef.current = imgEl;
//           // Use requestAnimationFrame for smooth rendering
//           requestAnimationFrame(() => {
//             drawImageToCanvas();
//           });
//         };
//         imgEl.onerror = () => {
//           console.error('Failed to load image from socket');
//         };
//         imgEl.src = img;
//       } else {
//         imageRef.current = null;
//         clearDrawCanvas();
//       }
//     };
    
//     const onDrawings = (data) => {
//       if (Array.isArray(data) && data.length > 0) {
//         // When receiving full state, merge with existing strokes to avoid duplicates
//         // Filter out invalid strokes for safety
//         const validStrokes = data.filter(s => s && s.id);
//         setStrokesArray(prev => {
//           // Create a map of existing stroke IDs to avoid duplicates
//           const existingIds = new Set(prev.map(s => s?.id).filter(Boolean));
//           const newStrokes = validStrokes.filter(s => !existingIds.has(s.id));
//           // Merge and maintain order
//           return [...prev, ...newStrokes];
//         });
//         // Also update local buffer for persistence
//         strokesBufferRef.current = [...strokesBufferRef.current, ...validStrokes.filter(s => 
//           !strokesBufferRef.current.some(existing => existing?.id === s.id)
//         )];
//       } else if (Array.isArray(data) && data.length === 0) {
//         // Empty array means clear (only happens when new image uploaded)
//         setStrokesArray([]);
//         strokesBufferRef.current = [];
//       }
//     };
    
//     const onLock = ({ locked, by }) => {
//       setUploadLocked(locked);
//       setLockedBy(by || null);
//     };
    
//     const onRemoveImage = () => {
//       setImage(null);
//       setStrokesArray([]);
//       setUploadLocked(false);
//       setLockedBy(null);
//       imageRef.current = null;
//       clearDrawCanvas();
//       strokesBufferRef.current = [];
//     };
    
//     const onUserColors = (colors) => {
//       setUserColors(colors || {});
//       if (currentUser?.id && colors && colors[currentUser.id]) {
//         setMyColor(colors[currentUser.id]);
//       }
//     };
    
//     const onCanUpload = ({ canUpload, message }) => {
//       if (!canUpload && message) {
//         console.log(message);
//       }
//     };

//     const onStroke = (stroke) => {
//       // Handle individual stroke for real-time updates from other participants
//       // Validate stroke before processing
//       if (!stroke || !stroke.id) {
//         console.warn('Received invalid stroke from server');
//         return;
//       }
//       setStrokesArray(prev => {
//         // Check if stroke already exists by ID
//         const existingIndex = prev.findIndex(s => s?.id === stroke.id);
//         if (existingIndex >= 0) {
//           // Update existing stroke (for incremental updates during drawing)
//           const updated = [...prev];
//           updated[existingIndex] = stroke;
//           return updated;
//         }
//         // Add new stroke
//         return [...prev, stroke];
//       });
//     };

//     socket.on('scribble:image', onImage);
//     socket.on('scribble:drawings', onDrawings);
//     socket.on('scribble:stroke', onStroke);
//     socket.on('scribble:lock', onLock);
//     socket.on('scribble:removeImage', onRemoveImage);
//     socket.on('scribble:userColors', onUserColors);
//     socket.on('scribble:canUpload', onCanUpload);

//     // Request current state immediately
//     socket.emit('scribble:request-state', { roomId });

//     return () => {
//       socket.off('scribble:image', onImage);
//       socket.off('scribble:drawings', onDrawings);
//       socket.off('scribble:stroke', onStroke);
//       socket.off('scribble:lock', onLock);
//       socket.off('scribble:removeImage', onRemoveImage);
//       socket.off('scribble:userColors', onUserColors);
//       socket.off('scribble:canUpload', onCanUpload);
//       if (animationFrameRef.current) {
//         cancelAnimationFrame(animationFrameRef.current);
//       }
//     };
//   }, [socketRef, roomId, currentUser]);

//   // Draw image to static canvas (responsive, maintains aspect ratio, clear and centered)
//   const drawImageToCanvas = () => {
//     const canvas = canvasImageRef.current;
//     if (!canvas || !imageRef.current) return;
//     const ctx = canvas.getContext('2d');
//     const dpr = window.devicePixelRatio || 1;
//     const { clientWidth, clientHeight } = canvas;
    
//     // Use requestAnimationFrame to batch resize operations and prevent flicker
//     if (canvas.width !== clientWidth * dpr || canvas.height !== clientHeight * dpr) {
//       canvas.width = clientWidth * dpr;
//       canvas.height = clientHeight * dpr;
//     }
//     ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
//     // Fill with white background
//     ctx.fillStyle = '#ffffff';
//     ctx.fillRect(0, 0, clientWidth, clientHeight);
    
//     const img = imageRef.current;
//     // Calculate scale to fit screen responsively - enlarge image (use 95% of container for larger display)
//     const maxW = clientWidth * 0.95;
//     const maxH = clientHeight * 0.95;
//     const scale = Math.min(maxW / img.width, maxH / img.height, 1) * zoom;
//     const drawW = img.width * scale;
//     const drawH = img.height * scale;
//     const x = (clientWidth - drawW) / 2;
//     const y = (clientHeight - drawH) / 2;
    
//     // Enable high-quality image rendering - clear and crisp, no blur
//     ctx.imageSmoothingEnabled = true;
//     ctx.imageSmoothingQuality = 'high';
//     ctx.globalAlpha = 1; // Full opacity, no transparency
//     // Save context state
//     ctx.save();
//     // Draw image with crisp rendering - ensure no blur with proper scaling
//     ctx.drawImage(img, x, y, drawW, drawH);
//     ctx.restore();
//   };

//   // Clear only the drawing canvas
//   const clearDrawCanvas = () => {
//     const canvas = canvasDrawRef.current;
//     if (!canvas) return;
//     const ctx = canvas.getContext('2d');
//     ctx.clearRect(0, 0, canvas.width, canvas.height);
//   };

//   // Draw loop: composite strokes onto drawing canvas (optimized for smooth resize)
//   const drawLoop = () => {
//     const canvas = canvasDrawRef.current;
//     if (!canvas) {
//       animationFrameRef.current = requestAnimationFrame(drawLoop);
//       return;
//     }
//     const ctx = canvas.getContext('2d');
//     const dpr = window.devicePixelRatio || 1;
//     const { clientWidth, clientHeight } = canvas;
//     const displayWidth = clientWidth * dpr;
//     const displayHeight = clientHeight * dpr;
    
//     // Only resize if dimensions changed (prevents unnecessary redraws)
//     if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
//       canvas.width = displayWidth;
//       canvas.height = displayHeight;
//     }
//     ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
//     ctx.clearRect(0, 0, clientWidth, clientHeight);
    
//     // Enable high-quality rendering for smooth drawings
//     ctx.imageSmoothingEnabled = true;
//     ctx.imageSmoothingQuality = 'high';
    
//     // Draw all persisted strokes from strokesArray (server-synced)
//     // strokesBufferRef is for temporary strokes during drawing, but they should already be in strokesArray
//     // Only draw currentStrokeRef if it's actively being drawn
//     const allStrokes = [...strokesArray];
//     if (currentStrokeRef.current && isDrawing) {
//       // Include current stroke being drawn for real-time preview
//       allStrokes.push(currentStrokeRef.current);
//     }
    
//     allStrokes.forEach((s) => {
//       if (s.type === 'path') {
//         ctx.save();
//         ctx.globalAlpha = s.alpha ?? 1;
//         ctx.strokeStyle = s.color;
//         ctx.lineWidth = s.width;
//         ctx.lineJoin = 'round';
//         ctx.lineCap = 'round';
//         ctx.beginPath();
//         if (s.points && s.points.length > 0) {
//           s.points.forEach((p, idx) => {
//             if (idx === 0) ctx.moveTo(p.x, p.y);
//             else ctx.lineTo(p.x, p.y);
//           });
//           ctx.stroke();
//         }
//         ctx.restore();
//       } else if (s.type === 'shape') {
//         ctx.strokeStyle = s.color;
//         ctx.lineWidth = s.width;
//         if (s.shape === 'rect') {
//           ctx.strokeRect(s.x, s.y, s.w, s.h);
//         } else if (s.shape === 'circle') {
//           ctx.beginPath();
//           ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
//           ctx.stroke();
//         } else if (s.shape === 'arrow' || s.shape === 'line') {
//           ctx.beginPath();
//           ctx.moveTo(s.x1, s.y1);
//           ctx.lineTo(s.x2, s.y2);
//           ctx.stroke();
//         }
//       } else if (s.type === 'text') {
//         ctx.fillStyle = s.color;
//         ctx.font = `${s.size || 18}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
//         ctx.fillText(s.text, s.x, s.y);
//       }
//     });
    
//     // Draw preview if any
//     const p = previewRef.current;
//     if (p) {
//       ctx.save();
//       ctx.strokeStyle = p.color;
//       ctx.lineWidth = p.width;
//       if (p.shape === 'rect') ctx.strokeRect(p.x, p.y, p.w, p.h);
//       if (p.shape === 'circle') {
//         ctx.beginPath();
//         ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
//         ctx.stroke();
//       }
//       if (p.shape === 'arrow' || p.shape === 'line') {
//         ctx.beginPath();
//         ctx.moveTo(p.x1, p.y1);
//         ctx.lineTo(p.x2, p.y2);
//         ctx.stroke();
//       }
//       ctx.restore();
//     }
    
//     animationFrameRef.current = requestAnimationFrame(drawLoop);
//   };

//   // Start draw loop on mount
//   useEffect(() => {
//     drawLoop();
//     return () => {
//       if (animationFrameRef.current) {
//         cancelAnimationFrame(animationFrameRef.current);
//       }
//     };
//   }, []);

//   // Update image canvas when zoom or image state changes
//   useEffect(() => {
//     if (image && imageRef.current) {
//       // Use requestAnimationFrame for smooth updates
//       const frameId = requestAnimationFrame(() => {
//         drawImageToCanvas();
//       });
//       return () => cancelAnimationFrame(frameId);
//     } else if (!image) {
//       // Clear image canvas when image is removed
//       const canvas = canvasImageRef.current;
//       if (canvas) {
//         const ctx = canvas.getContext('2d');
//         ctx.fillStyle = '#ffffff';
//         ctx.fillRect(0, 0, canvas.width, canvas.height);
//       }
//     }
//   }, [zoom, image]);

//   // Handle window resize smoothly - redraw image and maintain drawings
//   useEffect(() => {
//     if (!image || !imageRef.current) return;
    
//     let resizeTimeout;
//     const handleResize = () => {
//       // Debounce resize to prevent excessive redraws
//       clearTimeout(resizeTimeout);
//       resizeTimeout = setTimeout(() => {
//         if (imageRef.current && canvasImageRef.current) {
//           requestAnimationFrame(() => {
//             drawImageToCanvas();
//             // Drawing canvas will automatically resize and redraw via drawLoop
//           });
//         }
//       }, 100);
//     };
    
//     window.addEventListener('resize', handleResize);
//     return () => {
//       window.removeEventListener('resize', handleResize);
//       clearTimeout(resizeTimeout);
//     };
//   }, [image]);

//   const emitDrawings = (updated) => {
//     setStrokesArray(updated);
//     const socket = socketRef?.current;
//     if (socket) socket.emit('scribble:drawings', { roomId, data: updated });
//   };

//   const emitStroke = (stroke) => {
//     // Emit individual stroke for instant real-time sync
//     const socket = socketRef?.current;
//     if (socket) {
//       // Add to local array immediately for instant visibility (before server roundtrip)
//       // The onStroke handler will filter out duplicates if server echoes back
//       setStrokesArray(prev => {
//         // Prevent duplicate if already exists
//         if (prev.some(s => s.id === stroke.id)) {
//           return prev;
//         }
//         return [...prev, stroke];
//       });
//       socket.emit('scribble:stroke', { roomId, stroke });
//     }
//   };

//   const handlePointerDown = (e) => {
//     if (!image) return;
//     setIsDrawing(true);
//     const rect = canvasDrawRef.current.getBoundingClientRect();
//     // Coordinates in CSS pixels (will be transformed by ctx.setTransform)
//     const x = e.clientX - rect.left;
//     const y = e.clientY - rect.top;
//     lastPointRef.current = { x, y };

//     if (tool === 'pen' || tool === 'highlighter') {
//       // Ensure currentUser is available before creating stroke
//       if (!currentUser?.id) {
//         console.warn('Cannot draw: currentUser is not available');
//         return;
//       }
//       const stroke = { 
//         id: Date.now() + Math.random(), // Unique ID
//         type: 'path', 
//         color: myColor, // Use server-assigned color
//         width: thickness, 
//         points: [{ x, y }], 
//         alpha: tool === 'highlighter' ? 0.35 : 1,
//         userId: currentUser.id
//       };
//       currentStrokeRef.current = stroke;
//       // Add to local array immediately for instant visibility
//       setStrokesArray(prev => [...prev, stroke]);
//       // Emit to server for real-time sync
//       emitStroke(stroke);
//     } else if (tool === 'eraser') {
//       // Eraser: remove last stroke
//       const updated = strokesArray.slice(0, -1);
//       if (updated.length < strokesArray.length) {
//         undoStackRef.current.push(strokesArray[strokesArray.length - 1]);
//         emitDrawings(updated);
//         redoStackRef.current = [];
//       }
//     } else if (['rect','circle','arrow','line'].includes(tool)) {
//       previewRef.current = { shape: tool, color: myColor, width: thickness, x, y, x1:x, y1:y };
//     } else if (tool === 'text') {
//       // Ensure currentUser is available before creating text stroke
//       if (!currentUser?.id) {
//         console.warn('Cannot add text: currentUser is not available');
//         return;
//       }
//       const text = window.prompt('Enter text');
//       if (text && text.trim()) {
//         const stroke = { 
//           id: Date.now() + Math.random(),
//           type: 'text', 
//           text, 
//           x, 
//           y, 
//           color: myColor, 
//           size: Math.max(14, thickness * 3),
//           userId: currentUser.id
//         };
//         emitDrawings([...strokesArray, stroke]);
//         emitStroke(stroke);
//         redoStackRef.current = [];
//       }
//     }
//   };

//   const handlePointerMove = (e) => {
//     if (!isDrawing) return;
//     const rect = canvasDrawRef.current.getBoundingClientRect();
//     // Coordinates in CSS pixels (will be transformed by ctx.setTransform)
//     const x = e.clientX - rect.left;
//     const y = e.clientY - rect.top;
    
//     if (tool === 'pen' || tool === 'highlighter') {
//       // Update current stroke for smooth continuous drawing
//       // Capture currentStroke to avoid closure issues
//       const currentStroke = currentStrokeRef.current;
//       if (currentStroke && currentStroke.type === 'path' && currentStroke.points) {
//         currentStroke.points.push({ x, y });
//         // Update in strokesArray immediately for local display (real-time feedback)
//         setStrokesArray(prev => {
//           const updated = [...prev];
//           const lastIndex = updated.length - 1;
//           // Add null check for currentStroke to prevent null.id error
//           if (lastIndex >= 0 && currentStroke?.id && updated[lastIndex]?.id === currentStroke.id) {
//             updated[lastIndex] = { ...updated[lastIndex], points: [...currentStroke.points] };
//           }
//           return updated;
//         });
//         // Emit incremental update for real-time sync to other participants
//         // Emit more frequently (every 2 points) for smoother real-time collaboration
//         if (currentStroke.points.length % 2 === 0 && currentStroke?.id) {
//           emitStroke(currentStroke);
//         }
//       }
//     } else if (['rect','circle','arrow','line'].includes(tool)) {
//       const p = previewRef.current;
//       if (!p) return;
//       if (tool === 'rect') { p.w = x - p.x; p.h = y - p.y; }
//       if (tool === 'circle') { 
//         const dx = x - p.x; 
//         const dy = y - p.y; 
//         p.cx = p.x; 
//         p.cy = p.y; 
//         p.r = Math.sqrt(dx*dx + dy*dy); 
//       }
//       if (tool === 'arrow' || tool === 'line') { p.x2 = x; p.y2 = y; }
//     }
//   };

//   const handlePointerUp = () => {
//     if (!isDrawing) return;
//     setIsDrawing(false);
//     lastPointRef.current = null;
    
//     // Finalize current stroke - ensure it's persisted on server and doesn't vanish
//     // Capture currentStrokeRef value to avoid closure issues
//     const currentStroke = currentStrokeRef.current;
//     if (currentStroke && currentStroke.type === 'path') {
//       // Ensure stroke has at least 2 points (valid stroke)
//       if (currentStroke.points && currentStroke.points.length >= 2) {
//         // Finalize the stroke in local array - ensure it's permanently added
//         setStrokesArray(prev => {
//           const updated = [...prev];
//           const lastIndex = updated.length - 1;
//           // Add null check for currentStroke to prevent null.id error
//           if (lastIndex >= 0 && currentStroke?.id && updated[lastIndex]?.id === currentStroke.id) {
//             // Update existing stroke with final points
//             updated[lastIndex] = { ...updated[lastIndex], points: [...currentStroke.points] };
//           } else if (currentStroke?.id) {
//             // Stroke not in array yet, add it
//             updated.push({ ...currentStroke });
//           }
//           return updated;
//         });
//         // Emit final stroke state to ensure server has complete data for persistence
//         if (currentStroke?.id) {
//           emitStroke(currentStroke);
//         }
//       }
//       // Clear current ref but stroke is already persisted in strokesArray
//       currentStrokeRef.current = null;
//     }
    
//     if (previewRef.current) {
//       // Ensure currentUser is available before creating shape stroke
//       if (!currentUser?.id) {
//         console.warn('Cannot add shape: currentUser is not available');
//         previewRef.current = null;
//         return;
//       }
//       const p = previewRef.current;
//       previewRef.current = null;
//       const shapeStroke = {
//         id: Date.now() + Math.random(),
//         type: 'shape',
//         shape: p.shape,
//         color: myColor,
//         width: thickness,
//         userId: currentUser.id
//       };
      
//       if (p.shape === 'rect') {
//         shapeStroke.x = p.x;
//         shapeStroke.y = p.y;
//         shapeStroke.w = p.w;
//         shapeStroke.h = p.h;
//       } else if (p.shape === 'circle') {
//         shapeStroke.cx = p.cx;
//         shapeStroke.cy = p.cy;
//         shapeStroke.r = p.r;
//       } else if (p.shape === 'arrow' || p.shape === 'line') {
//         shapeStroke.x1 = p.x1;
//         shapeStroke.y1 = p.y1;
//         shapeStroke.x2 = p.x2;
//         shapeStroke.y2 = p.y2;
//       }
      
//       emitDrawings([...strokesArray, shapeStroke]);
//       emitStroke(shapeStroke);
//       redoStackRef.current = [];
//     }
//   };

//   const handleUpload = (file) => {
//     const reader = new FileReader();
//     reader.onload = () => {
//       setPendingImage(reader.result);
//     };
//     reader.readAsDataURL(file);
//   };

//   const handleReupload = () => {
//     // Trigger file input click for reupload
//     const input = document.createElement('input');
//     input.type = 'file';
//     input.accept = 'image/*';
//     input.onchange = (e) => {
//       const file = e.target.files?.[0];
//       if (file) {
//         handleUpload(file);
//       }
//     };
//     input.click();
//   };

//   const confirmImage = () => {
//     if (uploadLocked && lockedBy && currentUser?.id && lockedBy !== currentUser.id) {
//       return;
//     }
//     const img = pendingImage;
//     setPendingImage(null);
//     setImage(img);
    
//     // Load image immediately for instant display
//     if (img) {
//       const imgEl = new Image();
//       imgEl.onload = () => {
//         imageRef.current = imgEl;
//         // Draw immediately after image loads
//         requestAnimationFrame(() => {
//           drawImageToCanvas();
//         });
//       };
//       imgEl.onerror = () => {
//         console.error('Failed to load image');
//       };
//       imgEl.src = img;
//     }
    
//     const socket = socketRef?.current;
//     if (socket) socket.emit('scribble:image', { roomId, img });
//     // Server will clear drawings when new image is confirmed
//     // Don't clear here - let server handle it via scribble:drawings event
//   };

//   const handleClose = () => {
//     // Close Scribble but preserve drawings (don't clear state)
//     // Just call onClose to hide the overlay
//     onClose();
//   };

//   const removeConfirmedImage = () => {
//     if (uploadLocked && currentUser?.id && lockedBy !== currentUser.id) {
//       return; // Only locker can remove
//     }
//     if (window.confirm('Are you sure you want to remove the image? This will also clear all annotations.')) {
//       const socket = socketRef?.current;
//       if (socket) socket.emit('scribble:removeImage', { roomId });
//       // Server will clear state when image is removed
//       // Keep strokes array - only clear when server tells us
//     }
//   };

//   const handleColorChange = (newColor) => {
//     setMyColor(newColor);
//     const socket = socketRef?.current;
//     if (socket && currentUser?.id) {
//       socket.emit('scribble:userColorChange', { roomId, id: currentUser.id, color: newColor });
//     } else if (!currentUser?.id) {
//       console.warn('Cannot change color: currentUser is not available');
//     }
//   };

//   const undo = () => {
//     if (strokesArray.length === 0) return;
//     const last = strokesArray[strokesArray.length - 1];
//     undoStackRef.current.push(last);
//     emitDrawings(strokesArray.slice(0, -1));
//     redoStackRef.current = [];
//   };

//   const redo = () => {
//     if (undoStackRef.current.length === 0) return;
//     const last = undoStackRef.current.pop();
//     emitDrawings([...strokesArray, last]);
//   };

//   const savePng = () => {
//     const canvas = document.createElement('canvas');
//     const imgCanvas = canvasImageRef.current;
//     const drawCanvas = canvasDrawRef.current;
//     if (!imgCanvas || !drawCanvas) return;
    
//     const w = imgCanvas.clientWidth;
//     const h = imgCanvas.clientHeight;
//     canvas.width = w;
//     canvas.height = h;
//     const ctx = canvas.getContext('2d');
    
//     // Draw image layer
//     if (imageRef.current) {
//       const img = imageRef.current;
//       const maxW = w * 0.7;
//       const scale = Math.min(maxW / img.width, (h * 0.7) / img.height);
//       const drawW = img.width * scale * zoom;
//       const drawH = img.height * scale * zoom;
//       const x = (w - drawW) / 2;
//       const y = (h - drawH) / 2;
//       ctx.drawImage(img, x, y, drawW, drawH);
//     }
    
//     // Composite drawing layer
//     ctx.drawImage(drawCanvas, 0, 0, w, h);
    
//     const data = canvas.toDataURL('image/png');
//     const a = document.createElement('a');
//     a.href = data;
//     a.download = `scribble-${Date.now()}.png`;
//     a.click();
//   };

//   // Get participant name for locked by
//   const getLockedByName = () => {
//     if (!lockedBy) return null;
//     if (!participants || !Array.isArray(participants)) return 'Another user';
//     const participant = participants.find(p => p?.userId === lockedBy);
//     return participant?.username || 'Another user';
//   };

//   // Extract AI question and answer using helper utilities
//   const { question: aiQuestion, answer: aiAnswer } = extractAIQuestionAndAnswer(aiResponse);

//   return (
//     <div className="scribble-root">
//       <div className="scribble-backdrop" />
//       <div className="scribble-stage" ref={containerRef}>
//         {/* Image layer (static) - White background with image */}
//         <canvas
//           ref={canvasImageRef}
//           className="scribble-canvas-image"
//           style={{ 
//             position: 'absolute', 
//             inset: 0, 
//             pointerEvents: 'none',
//             width: '100%',
//             height: '100%'
//           }}
//         />
//         {/* Drawing layer (overlay) - Interactive drawing surface */}
//         <canvas
//           ref={canvasDrawRef}
//           className="scribble-canvas-draw"
//           style={{ 
//             position: 'absolute', 
//             inset: 0, 
//             cursor: tool === 'pen' || tool === 'highlighter' ? 'crosshair' : 'default',
//             width: '100%',
//             height: '100%'
//           }}
//           onPointerDown={handlePointerDown}
//           onPointerMove={handlePointerMove}
//           onPointerUp={handlePointerUp}
//         />
        
//       </div>

//       {!image && (
//         <motion.div
//           className="scribble-upload-container"
//           initial={{ opacity: 0, scale: 0.9, y: 20 }}
//           animate={{ opacity: 1, scale: 1, y: 0 }}
//           transition={{ duration: 0.4, ease: 'easeOut' }}
//         >
//           <label className="scribble-upload-button">
//             <input
//               type="file"
//               accept="image/*"
//               onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
//               disabled={uploadLocked && currentUser?.id && lockedBy !== currentUser.id}
//               style={{ display: 'none' }}
//             />
//             Upload Image
//           </label>
//           {uploadLocked && lockedBy && currentUser?.id && lockedBy !== currentUser.id && (
//             <div className="scribble-upload-locked">
//               Image locked by {getLockedByName()}. Wait or request removal.
//             </div>
//           )}
//           {pendingImage && (
//             <div className="scribble-upload-actions">
//               <button onClick={() => setPendingImage(null)} className="scribble-action-btn">Cancel</button>
//               <button 
//                 disabled={uploadLocked && lockedBy && currentUser?.id && lockedBy !== currentUser.id} 
//                 onClick={confirmImage}
//                 className="scribble-action-btn primary"
//               >
//                 Confirm
//               </button>
//             </div>
//           )}
//         </motion.div>
//       )}

//       {image && (
//         <motion.div
//           className="scribble-toolbar-professional"
//           initial={{ opacity: 0, y: -20 }}
//           animate={{ opacity: 1, y: 0 }}
//           transition={{ duration: 0.3, ease: 'easeOut' }}
//         >
//           {/* Top Row - Drawing Tools */}
//           <div className="scribble-toolbar-row">
//             <button className={`tool ${tool === 'pen' ? 'active' : ''}`} onClick={() => setTool('pen')} title="Pen"><FiEdit3 /></button>
//             <button className={`tool ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')} title="Eraser"><FiMinusCircle /></button>
//             <button className={`tool ${tool === 'highlighter' ? 'active' : ''}`} onClick={() => setTool('highlighter')} title="Highlighter">H</button>
//             <button className={`tool ${tool === 'rect' ? 'active' : ''}`} onClick={() => setTool('rect')} title="Rectangle"><FiSquare /></button>
//             <button className={`tool ${tool === 'circle' ? 'active' : ''}`} onClick={() => setTool('circle')} title="Circle"><FiCircle /></button>
//             <button className={`tool ${tool === 'arrow' ? 'active' : ''}`} onClick={() => setTool('arrow')} title="Arrow"><FiArrowUpRight /></button>
//             <button className={`tool ${tool === 'line' ? 'active' : ''}`} onClick={() => setTool('line')} title="Line">/</button>
//             <div className="tool-separator"></div>
//             <button className="tool" onClick={undo} title="Undo" disabled={strokesArray.length === 0}><FiRotateCcw /></button>
//             <button className="tool" onClick={redo} title="Redo" disabled={undoStackRef.current.length === 0}><FiRotateCw /></button>
//             <button className="tool" onClick={() => emitDrawings([])} title="Clear All"><FiTrash2 /></button>
//             <button className="tool" onClick={() => setZoom(Math.min(2, zoom + 0.1))} title="Zoom In"><FiZoomIn /></button>
//             <button className="tool" onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} title="Zoom Out">−</button>
//             <button className="tool" onClick={savePng} title="Save PNG">⬇️</button>
//           </div>
          
//           {/* Second Row - Color, Size, Reupload, Close */}
//           <div className="scribble-toolbar-row">
//             <input 
//               type="color" 
//               value={myColor} 
//               onChange={(e) => handleColorChange(e.target.value)} 
//               title="Change Color"
//               className="tool-color-input"
//             />
//             <input 
//               type="range" 
//               min="1" 
//               max="20" 
//               value={thickness} 
//               onChange={(e) => setThickness(parseInt(e.target.value, 10))} 
//               title="Brush Size"
//               className="tool-size-input"
//             />
//             <div className="tool-separator"></div>
//             <button className="tool tool-reupload" onClick={handleReupload} title="Reupload Image">
//               Reupload
//             </button>
//             <button className="tool tool-close" onClick={handleClose} title="Close Scribble">
//               <FiX />
//             </button>
//           </div>
//         </motion.div>
//       )}

//       {/* Enhanced Legend - shows color-to-user mapping */}
//       {Object.keys(userColors).length > 0 && (
//         <motion.div 
//           className="scribble-legend-enhanced"
//           initial={{ opacity: 0, x: 20 }}
//           animate={{ opacity: 1, x: 0 }}
//           transition={{ duration: 0.3, delay: 0.2 }}
//         >
//           <div className="scribble-legend-header">Participants</div>
//           <div className="scribble-legend-items">
//             {Object.entries(userColors).map(([socketId, color]) => {
//               if (!participants || !Array.isArray(participants)) return null;
//               const participant = participants.find(p => p?.userId === socketId);
//               if (!participant) return null;
//               const isCurrentUser = currentUser?.id === socketId;
//               return (
//                 <div key={socketId} className={`scribble-legend-item ${isCurrentUser ? 'current-user' : ''}`}>
//                   <span 
//                     className="scribble-legend-dot" 
//                     style={{ 
//                       backgroundColor: color, 
//                       boxShadow: `0 0 8px ${color}, 0 0 12px ${color}40`,
//                       border: isCurrentUser ? `2px solid ${color}` : 'none'
//                     }} 
//                   />
//                   <span className="scribble-legend-name">{participant?.username || 'Unknown'}</span>
//                   {isCurrentUser && <span className="scribble-legend-you">(You)</span>}
//                 </div>
//               );
//             })}
//           </div>
//         </motion.div>
//       )}
//     </div>
//   );
// };

// export default ScribbleOverlay;



import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Draggable from 'react-draggable'; // <-- 1. IMPORT DRAGGABLE
import {
  FiX,
  FiEdit3, // Pen
  FiRotateCcw,
  FiRotateCw,
  FiTrash2,
  FiMinusCircle, // Eraser
  FiSquare,
  FiCircle,
  FiArrowUpRight,
  FiZoomIn,
  FiMove,
  FiEdit, // Using FiEdit for Highlighter
  FiMinus, // Using FiMinus for Line
  FiZoomOut,
  FiDownload, // Using FiDownload for Save
} from 'react-icons/fi';
import { extractAIQuestionAndAnswer } from '../utils/aiResponseHelpers';
import './ScribbleOverlay.css';

const ScribbleOverlay = ({
  socketRef,
  roomId,
  onClose,
  participants = [],
  currentUser,
  aiResponse = null, // AI response object with sent_from_csv
  hideUpload = false,
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
  const undoStackRef = useRef([]); // This will now store strokes removed by the current user
  const animationFrameRef = useRef(null);
  const currentStrokeRef = useRef(null); // Current stroke being drawn
  const strokesArrayRef = useRef([]); // Keep ref for reactive drawing
  const isDrawingRef = useRef(false); // Keep ref for reactive drawing

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
          requestAnimationFrame(() => {
            drawImageToCanvas();
          });
        };
        imgEl.onerror = () => {
          console.error('Failed to load image from socket');
        };
        imgEl.src = img;
      } else {
        imageRef.current = null;
        clearDrawCanvas();
      }
    };

    const onDrawings = (data) => {
      if (Array.isArray(data)) {
        // Full state update from server
        const filtered = data.filter(Boolean);
        setStrokesArray(filtered); // Just take the server's state
        strokesArrayRef.current = filtered; // Update ref for drawLoop
      }
    };

    const onLock = ({ locked, by }) => {
      setUploadLocked(locked);
      setLockedBy(by || null);
    };

    const onRemoveImage = () => {
      setImage(null);
      setStrokesArray([]);
      strokesArrayRef.current = []; // Update ref
      setUploadLocked(false);
      setLockedBy(null);
      imageRef.current = null;
      clearDrawCanvas();
      undoStackRef.current = [];
      redoStackRef.current = [];
    };

    const onUserColors = (colors) => {
      setUserColors(colors || {});
      // Try to find color by socket.id first (most reliable)
      const socketId = socketRef?.current?.id;
      if (socketId && colors && colors[socketId]) {
        setMyColor(colors[socketId]);
      } else if (currentUser?.id && colors && colors[currentUser.id]) {
        setMyColor(colors[currentUser.id]);
      }
    };

    const onCanUpload = ({ canUpload, message }) => {
      if (!canUpload && message) {
        console.log(message);
      }
    };

    const onStroke = (stroke) => {
      // Handle individual stroke for real-time updates from other participants
      if (!stroke || !stroke.id) {
        console.warn('Received invalid stroke from server');
        return;
      }
      
      // Check if this stroke is from the current user (to avoid conflicts with local drawing)
      const socketId = socketRef?.current?.id;
      const isLocalStroke = stroke.userId === socketId || stroke.userId === currentUser?.id;
      
      setStrokesArray((prev) => {
        const existingIndex = prev.findIndex((s) => s?.id === stroke.id);
        let updated;
        if (existingIndex >= 0) {
          // Update existing stroke (for incremental updates during drawing)
          updated = [...prev];
          updated[existingIndex] = { ...stroke };
        } else {
          // Add new stroke (from other users or finalized local stroke)
          // If it's a local stroke being finalized, make sure we have the complete data
          if (isLocalStroke && currentStrokeRef.current?.id === stroke.id) {
            // This is our own stroke being finalized, use the server version
            updated = prev.map(s => s.id === stroke.id ? { ...stroke } : s).concat(
              prev.some(s => s.id === stroke.id) ? [] : [stroke]
            ).filter(Boolean);
          } else {
            // For other users' strokes, add them immediately
            updated = [...prev, { ...stroke }];
          }
        }
        strokesArrayRef.current = updated; // Update ref
        return updated;
      });
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

  // Draw image to static canvas (responsive, maintains aspect ratio, clear and centered)
  const drawImageToCanvas = () => {
    const canvas = canvasImageRef.current;
    if (!canvas || !imageRef.current) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;

    if (
      canvas.width !== clientWidth * dpr ||
      canvas.height !== clientHeight * dpr
    ) {
      canvas.width = clientWidth * dpr;
      canvas.height = clientHeight * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, clientWidth, clientHeight);

    const img = imageRef.current;
    // Calculate scale to fit screen responsively - Reduced size (use 90% of container)
    const maxW = clientWidth * 0.90;
    const maxH = clientHeight * 0.90;
    
    // Use a reasonable scale factor
    let scale = Math.min(maxW / img.width, maxH / img.height) * zoom;
    // Cap at container size
    if (zoom > 1) {
      scale = Math.min(scale, Math.min(clientWidth / img.width, clientHeight / img.height));
    }
    
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const x = (clientWidth - drawW) / 2;
    const y = (clientHeight - drawH) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.drawImage(img, x, y, drawW, drawH);
    ctx.restore();
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

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Read from refs for latest values (reactive to state updates)
    const allStrokes = [...strokesArrayRef.current];
    const currentlyDrawing = isDrawingRef.current;
    
    // IMPORTANT: Also draw the current stroke being drawn (for real-time pencil visibility)
    const currentStroke = currentStrokeRef.current;
    if (currentStroke && currentStroke.type === 'path' && currentlyDrawing) {
      // Add current stroke to be drawn (but don't add to array yet)
      allStrokes.push(currentStroke);
    }

    allStrokes.forEach((s) => {
      if (!s) return; // Safety check
      if (s.type === 'path') {
        ctx.save();
        ctx.globalAlpha = s.alpha ?? 1;
        ctx.strokeStyle = s.color || '#000000';
        ctx.lineWidth = s.width || 4;
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
        ctx.save();
        ctx.strokeStyle = s.color || '#000000';
        ctx.lineWidth = s.width || 4;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
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
        ctx.restore();
      } else if (s.type === 'text') {
        ctx.save();
        ctx.fillStyle = s.color || '#000000';
        ctx.font = `${
          s.size || 18
        }px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
        ctx.fillText(s.text, s.x, s.y);
        ctx.restore();
      }
    });

    // Draw preview if any (for shapes being drawn)
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

  // Start draw loop on mount - Continuously redraws (reads current state/reactively)
  useEffect(() => {
    drawLoop();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []); // Only run once, drawLoop reads current state each frame

  // Update image canvas when zoom or image state changes
  useEffect(() => {
    if (image && imageRef.current) {
      const frameId = requestAnimationFrame(() => {
        drawImageToCanvas();
      });
      return () => cancelAnimationFrame(frameId);
    } else if (!image) {
      const canvas = canvasImageRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [zoom, image]);

  // Handle window resize
  useEffect(() => {
    if (!image || !imageRef.current) return;

    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (imageRef.current && canvasImageRef.current) {
          requestAnimationFrame(() => {
            drawImageToCanvas();
            // drawLoop handles drawing canvas resize
          });
        }
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, [image]); // Rerun if image changes

  // Emit full drawing array
  const emitDrawings = (updated) => {
    setStrokesArray(updated);
    strokesArrayRef.current = updated; // Update ref
    const socket = socketRef?.current;
    if (socket) socket.emit('scribble:drawings', { roomId, data: updated });
  };

  // Emit a single stroke (new or updated)
  const emitStroke = (stroke) => {
    const socket = socketRef?.current;
    if (socket) {
      socket.emit('scribble:stroke', { roomId, stroke });
    }
  };

  const handlePointerDown = (e) => {
    if (!image) return; // Allow drawing even if currentUser is not set (fallback to socket.id)
    e.preventDefault(); // Prevent default to ensure pointer events work
    e.stopPropagation(); // Stop event bubbling
    
    setIsDrawing(true);
    isDrawingRef.current = true; // Update ref immediately
    const rect = canvasDrawRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastPointRef.current = { x, y };

    // Get socket ID for user identification (more reliable than currentUser.id)
    const socketId = socketRef?.current?.id || currentUser?.id || 'unknown';
    
    if (tool === 'pen' || tool === 'highlighter') {
      const stroke = {
        id: Date.now() + Math.random(), // Unique ID
        type: 'path',
        color: myColor || '#000000', // Fallback color
        width: thickness,
        points: [{ x, y }],
        alpha: tool === 'highlighter' ? 0.35 : 1,
        userId: socketId, // Use socketId for consistency
      };
      currentStrokeRef.current = stroke;
      // Add to local array immediately for instant visual feedback
      setStrokesArray((prev) => {
        // Prevent duplicates
        if (prev.some(s => s.id === stroke.id)) return prev;
        const updated = [...prev, stroke];
        strokesArrayRef.current = updated; // Update ref immediately
        return updated;
      });
      // Emit to server immediately for real-time sync
      emitStroke(stroke);
      redoStackRef.current = []; // Clear redo on new action
    } else if (tool === 'eraser') {
      // **FIX:** Erase only the user's own last stroke
      const socketId = socketRef?.current?.id || currentUser?.id;
      if (!socketId) return;
      
      const myLastStrokeIndex = strokesArray.findLastIndex(
        (s) => s.userId === socketId
      );
      if (myLastStrokeIndex > -1) {
        const strokeToRemove = strokesArray[myLastStrokeIndex];
        const updated = [...strokesArray];
        updated.splice(myLastStrokeIndex, 1);
        
        undoStackRef.current.push(strokeToRemove); // Add to user's local undo
        strokesArrayRef.current = updated; // Update ref
        emitDrawings(updated); // Send full update
        redoStackRef.current = [];
      }
    } else if (['rect', 'circle', 'arrow', 'line'].includes(tool)) {
      previewRef.current = {
        shape: tool,
        color: myColor,
        width: thickness,
        x,
        y,
        x1: x,
        y1: y,
      };
    } else if (tool === 'text') {
      const socketId = socketRef?.current?.id || currentUser?.id;
      if (!socketId) {
        console.warn('Cannot add text: socket/user ID not available');
        return;
      }
      const text = window.prompt('Enter text');
      if (text && text.trim()) {
        const stroke = {
          id: Date.now() + Math.random(),
          type: 'text',
          text,
          x,
          y,
          color: myColor || '#000000',
          size: Math.max(14, thickness * 3),
          userId: socketId, // Use socketId for consistency
        };
        const newStrokes = [...strokesArray, stroke];
        setStrokesArray(newStrokes);
        strokesArrayRef.current = newStrokes; // Update ref
        emitStroke(stroke); // Emit just the new stroke
        redoStackRef.current = [];
      }
    }
  };

  // #################################################################
  // ###   THIS FUNCTION IS FIXED TO PREVENT RACE CONDITIONS       ###
  // #################################################################
  const handlePointerMove = (e) => {
    if (!isDrawing) return;
    e.preventDefault(); // Prevent default behavior
    e.stopPropagation(); // Stop event bubbling
    
    const rect = canvasDrawRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === 'pen' || tool === 'highlighter') {
      // Get the stroke we are currently drawing from its ref
      const currentStroke = currentStrokeRef.current;
      if (!currentStroke || currentStroke.type !== 'path') return;

      const newPoint = { x, y };

      // 1. Mutate the ref's data. This is safe and its intended purpose.
      currentStroke.points.push(newPoint);

      // 2. Update the state array immutably for the local draw loop to re-render.
      // We map the array and replace the old stroke with the updated one from the ref.
        setStrokesArray(prev => {
          const existingIndex = prev.findIndex(s => s.id === currentStroke.id);
          if (existingIndex >= 0) {
            // Update existing stroke
            const updated = [...prev];
            updated[existingIndex] = { ...currentStroke, points: [...currentStroke.points] };
            strokesArrayRef.current = updated; // Update ref
            return updated;
          }
          // If not found, add it
          const updated = [...prev, { ...currentStroke, points: [...currentStroke.points] }];
          strokesArrayRef.current = updated; // Update ref
          return updated;
        });

      // 3. Emit the updated stroke to the server (throttled for performance)
      // Emit more frequently for smoother real-time collaboration
      if (currentStroke.points.length % 3 === 0) {
        emitStroke({ ...currentStroke, points: [...currentStroke.points] });
      }
    } else if (['rect', 'circle', 'arrow', 'line'].includes(tool)) {
      const p = previewRef.current;
      if (!p) return;
      if (tool === 'rect') {
        p.w = x - p.x;
        p.h = y - p.y;
      }
      if (tool === 'circle') {
        const dx = x - p.x;
        const dy = y - p.y;
        p.cx = p.x;
        p.cy = p.y;
        p.r = Math.sqrt(dx * dx + dy * dy);
      }
      if (tool === 'arrow' || tool === 'line') {
        p.x2 = x;
        p.y2 = y;
      }
    }
  };
  // #################################################################
  // ###                 END OF FIXED FUNCTION                     ###
  // #################################################################

  const handlePointerUp = (e) => {
    if (!isDrawing) return;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setIsDrawing(false);
    isDrawingRef.current = false; // Update ref immediately
    lastPointRef.current = null;

    // **FIX:** Finalize pen/highlighter stroke
    const currentStroke = currentStrokeRef.current;
    if (currentStroke && currentStroke.type === 'path') {
      if (currentStroke.points && currentStroke.points.length >= 2) {
        // Ensure the stroke is in strokesArray with final points
        setStrokesArray(prev => {
          const existingIndex = prev.findIndex(s => s.id === currentStroke.id);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = { ...currentStroke, points: [...currentStroke.points] };
            strokesArrayRef.current = updated; // Update ref
            return updated;
          }
          const updated = [...prev, { ...currentStroke, points: [...currentStroke.points] }];
          strokesArrayRef.current = updated; // Update ref
          return updated;
        });
        // Emit the final version to ensure server has complete data for all users
        emitStroke({ ...currentStroke, points: [...currentStroke.points] });
      } else {
        // If stroke has less than 2 points, remove it
        setStrokesArray(prev => {
          const filtered = prev.filter(s => s.id !== currentStroke.id);
          strokesArrayRef.current = filtered; // Update ref
          return filtered;
        });
      }
      // Clear the ref
      currentStrokeRef.current = null;
    }

    // Finalize shape tools
    if (previewRef.current) {
      const socketId = socketRef?.current?.id || currentUser?.id;
      if (!socketId) {
        console.warn('Cannot add shape: socket/user ID not available');
        previewRef.current = null;
        return;
      }
      const p = previewRef.current;
      previewRef.current = null;
      
      const shapeStroke = {
        id: Date.now() + Math.random(),
        type: 'shape',
        shape: p.shape,
        color: myColor || '#000000',
        width: thickness,
        userId: socketId, // Use socketId for consistency
      };

      if (p.shape === 'rect') {
        // Ensure w/h are positive
        shapeStroke.x = p.w < 0 ? p.x + p.w : p.x;
        shapeStroke.y = p.h < 0 ? p.y + p.h : p.y;
        shapeStroke.w = Math.abs(p.w);
        shapeStroke.h = Math.abs(p.h);
      } else if (p.shape === 'circle') {
        shapeStroke.cx = p.cx;
        shapeStroke.cy = p.cy;
        shapeStroke.r = p.r || 0;
      } else if (p.shape === 'arrow' || p.shape === 'line') {
        shapeStroke.x1 = p.x1;
        shapeStroke.y1 = p.y1;
        shapeStroke.x2 = p.x2 || p.x1;
        shapeStroke.y2 = p.y2 || p.y1;
      }

      // CRITICAL: Add shape to strokesArray IMMEDIATELY before clearing preview
      setStrokesArray((prev) => {
        // Prevent duplicates
        if (prev.some(s => s.id === shapeStroke.id)) return prev;
        const updated = [...prev, shapeStroke];
        strokesArrayRef.current = updated; // Update ref immediately
        return updated;
      });
      // Emit to server for all users to see
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

  const handleReupload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) {
        handleUpload(file);
      }
    };
    input.click();
  };

  const confirmImage = () => {
    if (
      uploadLocked &&
      lockedBy &&
      currentUser?.id &&
      lockedBy !== currentUser.id
    ) {
      return;
    }
    const img = pendingImage;
    setPendingImage(null);
    setImage(img); // Set image locally first

    // Pre-load and draw image
    if (img) {
      const imgEl = new Image();
      imgEl.onload = () => {
        imageRef.current = imgEl;
        requestAnimationFrame(() => {
          drawImageToCanvas();
        });
      };
      imgEl.src = img;
    }

    const socket = socketRef?.current;
    if (socket) socket.emit('scribble:image', { roomId, img });
    // Server will broadcast 'scribble:image' and 'scribble:drawings' (empty)
  };

  const handleClose = () => {
    onClose();
  };

  const removeConfirmedImage = () => {
    if (uploadLocked && currentUser?.id && lockedBy !== currentUser.id) {
      return;
    }
    if (
      window.confirm(
        'Are you sure you want to remove the image? This will also clear all annotations.'
      )
    ) {
      const socket = socketRef?.current;
      if (socket) socket.emit('scribble:removeImage', { roomId });
    }
  };

  const handleColorChange = (newColor) => {
    setMyColor(newColor);
    const socket = socketRef?.current;
    const socketId = socket?.id || currentUser?.id;
    if (socket && socketId) {
      socket.emit('scribble:userColorChange', {
        roomId,
        id: socketId, // Use socketId for consistency with server
        color: newColor,
      });
    } else {
      console.warn('Cannot change color: socket/user ID not available');
    }
  };

  const undo = () => {
    // **FIX:** Undo only the user's own last stroke
    const socketId = socketRef?.current?.id || currentUser?.id;
    if (!socketId) return;
    
    const myLastStrokeIndex = strokesArray.findLastIndex(
      (s) => s.userId === socketId
    );

    if (myLastStrokeIndex === -1) return; // No strokes by this user to undo

    const last = strokesArray[myLastStrokeIndex];
    undoStackRef.current.push(last); // Add to local undo stack
    
    const updated = [...strokesArray];
    updated.splice(myLastStrokeIndex, 1); // Remove it
    strokesArrayRef.current = updated; // Update ref
    
    emitDrawings(updated); // Sync full state
    redoStackRef.current = []; // Clear redo
  };

  const redo = () => {
    if (undoStackRef.current.length === 0) return;
    const last = undoStackRef.current.pop();
    const updated = [...strokesArray, last];
    strokesArrayRef.current = updated; // Update ref
    emitDrawings(updated); // Add it back and sync
  };

  const savePng = () => {
    // **FIX:** Composite canvases directly for a perfect copy
    const imgCanvas = canvasImageRef.current;
    const drawCanvas = canvasDrawRef.current;
    if (!imgCanvas || !drawCanvas) return;

    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    
    // Use the scaled dimensions from the canvases
    canvas.width = imgCanvas.width;
    canvas.height = imgCanvas.height;
    
    const ctx = canvas.getContext('2d');
    
    // Set transform to 1 (not dpr) because canvases are already scaled
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Draw image layer
    ctx.drawImage(imgCanvas, 0, 0);
    // Composite drawing layer
    ctx.drawImage(drawCanvas, 0, 0);

    const data = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = data;
    a.download = `scribble-${Date.now()}.png`;
    a.click();
  };

  // Get participant name for locked by
  const getLockedByName = () => {
    if (!lockedBy) return null;
    if (!participants || !Array.isArray(participants)) return 'Another user';
    const participant = participants.find((p) => p?.userId === lockedBy);
    return participant?.username || 'Another user';
  };

  // Extract AI question and answer using helper utilities
  const { question: aiQuestion, answer: aiAnswer } =
    extractAIQuestionAndAnswer(aiResponse);

  return (
    <div className="scribble-root">
      <div className="scribble-backdrop" />
      <div className="scribble-stage" ref={containerRef}>
        {/* Image layer (static) - White background with image */}
        <canvas
          ref={canvasImageRef}
          className="scribble-canvas-image"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            width: '100%',
            height: '100%',
          }}
        />
        {/* Drawing layer (overlay) - Interactive drawing surface */}
        <canvas
          ref={canvasDrawRef}
          className="scribble-canvas-draw"
          style={{
            position: 'absolute',
            inset: 0,
            cursor:
              tool === 'pen' || tool === 'highlighter' ? 'crosshair' : 'default',
            width: '100%',
            height: '100%',
            touchAction: 'none', // Prevent touch scrolling on mobile
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp} // Handle pointer cancellation
          onPointerLeave={handlePointerUp} // Also end drawing if pointer leaves
          onMouseDown={handlePointerDown} // Fallback for older browsers
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
        />
      </div>

      {!image && !hideUpload && (
        <motion.div
          className="scribble-upload-container"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <label className="scribble-upload-button">
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                e.target.files?.[0] && handleUpload(e.target.files[0])
              }
              disabled={
                uploadLocked && currentUser?.id && lockedBy !== currentUser.id
              }
              style={{ display: 'none' }}
            />
            Upload Image
          </label>
          {uploadLocked &&
            lockedBy &&
            currentUser?.id &&
            lockedBy !== currentUser.id && (
              <div className="scribble-upload-locked">
                Image locked by {getLockedByName()}. Wait or request removal.
              </div>
            )}
          {pendingImage && (
            <div className="scribble-upload-actions">
              <button
                onClick={() => setPendingImage(null)}
                className="scribble-action-btn"
              >
                Cancel
              </button>
              <button
                disabled={
                  uploadLocked &&
                  lockedBy &&
                  currentUser?.id &&
                  lockedBy !== currentUser.id
                }
                onClick={confirmImage}
                className="scribble-action-btn primary"
              >
                Confirm
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* --- WRAP TOOLBAR IN DRAGGABLE --- */}
      {image && (
        <Draggable handle=".scribble-toolbar-handle">
          <motion.div
            className="scribble-toolbar-professional"
            initial={{ opacity: 0 }} // Remove y-animation
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {/* --- ADDED DRAG HANDLE --- */}
            <div
              className="scribble-toolbar-handle"
              style={{
                cursor: 'move',
                padding: '4px',
                textAlign: 'center',
                backgroundColor: 'rgba(0,0,0,0.1)',
                borderTopLeftRadius: '8px',
                borderTopRightRadius: '8px',
              }}
            >
              <FiMove title="Drag Toolbar" />
            </div>

            {/* Top Row - Drawing Tools */}
            <div className="scribble-toolbar-row">
              <button
                className={`tool ${tool === 'pen' ? 'active' : ''}`}
                onClick={() => setTool('pen')}
                title="Pen"
              >
                <FiEdit3 />
              </button>
              <button
                className={`tool ${tool === 'eraser' ? 'active' : ''}`}
                onClick={() => setTool('eraser')}
                title="Eraser (Undo last)"
              >
                <FiMinusCircle />
              </button>
              <button
                className={`tool ${tool === 'highlighter' ? 'active' : ''}`}
                onClick={() => setTool('highlighter')}
                title="Highlighter"
              >
                <FiEdit />
              </button>
              <button
                className={`tool ${tool === 'rect' ? 'active' : ''}`}
                onClick={() => setTool('rect')}
                title="Rectangle"
              >
                <FiSquare />
              </button>
              <button
                className={`tool ${tool === 'circle' ? 'active' : ''}`}
                onClick={() => setTool('circle')}
                title="Circle"
              >
                <FiCircle />
              </button>
              <button
                className={`tool ${tool === 'arrow' ? 'active' : ''}`}
                onClick={() => setTool('arrow')}
                title="Arrow"
              >
                <FiArrowUpRight />
              </button>
              <button
                className={`tool ${tool === 'line' ? 'active' : ''}`}
                onClick={() => setTool('line')}
                title="Line"
              >
                <FiMinus />
              </button>
              <div className="tool-separator"></div>
              <button
                className="tool"
                onClick={undo}
                title="Undo"
                disabled={
                  !strokesArray.some((s) => s.userId === currentUser?.id)
                }
              >
                <FiRotateCcw />
              </button>
              <button
                className="tool"
                onClick={redo}
                title="Redo"
                disabled={undoStackRef.current.length === 0}
              >
                <FiRotateCw />
              </button>
              <button
                className="tool"
                onClick={() => emitDrawings([])}
                title="Clear All"
              >
                <FiTrash2 />
              </button>
              <button
                className="tool"
                onClick={() => setZoom(Math.min(2, zoom + 0.1))}
                title="Zoom In"
              >
                <FiZoomIn />
              </button>
              <button
                className="tool"
                onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                title="Zoom Out"
              >
                <FiZoomOut />
              </button>
              <button className="tool" onClick={savePng} title="Save PNG">
                <FiDownload />
              </button>
            </div>

            {/* Second Row - Color, Size, Reupload, Close */}
            <div
              className="scribble-toolbar-row"
              style={{
                borderBottomLeftRadius: '8px',
                borderBottomRightRadius: '8px',
              }}
            >
              <input
                type="color"
                value={myColor}
                onChange={(e) => handleColorChange(e.target.value)}
                title="Change Color"
                className="tool-color-input"
              />
              <input
                type="range"
                min="1"
                max="20"
                value={thickness}
                onChange={(e) => setThickness(parseInt(e.target.value, 10))}
                title="Brush Size"
                className="tool-size-input"
              />
              <div className="tool-separator"></div>
              {/* --- REUPLOAD BUTTON FIX --- */}
              <button
                className="tool tool-reupload"
                onClick={handleReupload}
                title="Reupload Image"
                disabled={
                  uploadLocked &&
                  currentUser?.id &&
                  lockedBy !== currentUser.id
                }
              >
                Reupload
              </button>
              {/* --- REMOVE BUTTON FIX --- */}
              <button
                className="tool tool-remove"
                onClick={removeConfirmedImage}
                title="Remove Image"
                disabled={
                  uploadLocked &&
                  currentUser?.id &&
                  lockedBy !== currentUser.id
                }
              >
                <FiTrash2 />
              </button>
              <button
                className="tool tool-close"
                onClick={handleClose}
                title="Close Scribble"
              >
                <FiX />
              </button>
            </div>
          </motion.div>
        </Draggable>
      )}

      {/* Enhanced Legend - (Now a Left Sidebar) */}
      {Object.keys(userColors).length > 0 && (
        <motion.div
          className="scribble-legend-enhanced"
          style={{
            position: 'absolute',
            left: '16px', // Position on the left
            top: '120px', // Position below the toolbar
            zIndex: 100,
          }}
          initial={{ opacity: 0, x: -20 }} // Animate from left
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="scribble-legend-header">Participants</div>
          <div className="scribble-legend-items">
            {Object.entries(userColors).map(([socketId, color]) => {
              if (!participants || !Array.isArray(participants)) return null;
              
              // Try to find participant by socketId (most reliable)
              let participant = participants.find(
                (p) => p?.userId === socketId || p?.socketId === socketId
              );
              
              // If not found, try to match by username from socket connection
              if (!participant && socketRef?.current?.id === socketId) {
                participant = {
                  userId: socketId,
                  username: currentUser?.username || 'You',
                };
              }
              
              // Skip if still no participant found
              if (!participant) {
                // Try to get username from socket metadata if available
                const socket = socketRef?.current;
                if (socket && socket.id === socketId) {
                  participant = {
                    userId: socketId,
                    username: currentUser?.username || 'Unknown',
                  };
                } else {
                  return null;
                }
              }
              
              const currentSocketId = socketRef?.current?.id;
              const isCurrentUser = socketId === currentSocketId || socketId === currentUser?.id;
              
              return (
                <div
                  key={socketId}
                  className={`scribble-legend-item ${
                    isCurrentUser ? 'current-user' : ''
                  }`}
                >
                  <span
                    className="scribble-legend-dot"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 8px ${color}, 0 0 12px ${color}40`,
                      border: isCurrentUser ? `2px solid ${color}` : 'none',
                    }}
                  />
                  <span className="scribble-legend-name">
                    {participant?.username || 'Unknown'}
                  </span>
                  {isCurrentUser && (
                    <span className="scribble-legend-you">(You)</span>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default ScribbleOverlay;