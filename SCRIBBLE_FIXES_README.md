# Scribble Feature Fixes - Implementation Notes

## Overview
This document explains the implementation of fixes for the Scribble feature, including color management, upload locking, canvas architecture, and dark mode support.

## 1. Color Assignment & Legend (Server as Source of Truth)

### Server-Side Implementation (`server/server.js`)
- **Color Generation**: When a user joins a room, the server generates a unique color based on their `socketId` using a hash function that returns HSL values
- **State Management**: Colors are stored in `userColors` object within the per-room Scribble state: `{ [socketId]: '#hexColor' }`
- **Broadcasting**: 
  - On join: Server assigns color and broadcasts `scribble:userColors` to all clients
  - On color change: User emits `scribble:userColorChange` → Server updates and broadcasts
  - On disconnect: Server removes user's color and broadcasts update

### Client-Side Implementation (`client/src/components/ScribbleOverlay.js`)
- **Removed Client-Side Color Generation**: No longer generates fallback colors
- **Uses Server Colors**: Reads from `userColors` object received via `scribble:userColors` event
- **Legend Rendering**: Legend displays colors exactly as received from server
- **Color Picker**: When user changes color via toolbar, emits `scribble:userColorChange` to server

### Flow
```
User joins → Server assigns color → Broadcast userColors → Client stores & uses for drawing
User changes color → Client emits change → Server updates → Broadcast updated userColors → All clients update legend
```

## 2. Upload Container Placement & Sizing

### CSS Changes (`client/src/components/ScribbleOverlay.css`)
- **Position**: `position: fixed; left: 50%; top: 6%; transform: translateX(-50%)`
- **Size**: `min-height: 50vh; height: 50vh; width: min(80vw, 1200px)`
- **Animation**: Premium entrance with `cubic-bezier(.2,.9,.2,1)` easing
- **Close Button**: Explicit × icon in top-right corner (`scribble-modal-close` class)
- **Bottom Controls**: Remain visible and interactive during modal (via `pointer-events`)

## 3. Two-Layer Canvas Architecture (No Image Blinking)

### Architecture
1. **`canvasImageRef`**: Static layer for uploaded raster image
   - Draws image once when uploaded or zoom changes
   - Never repainted on stroke events
   - `pointer-events: none` - never receives input

2. **`canvasDrawRef`**: Transparent overlay for strokes
   - Uses `requestAnimationFrame` draw loop
   - Only this layer clears/redraws on each stroke
   - `pointer-events: auto` - receives all input

### Implementation
- **Image Loading**: `drawImageToCanvas()` called only when:
  - Image first loads (`imageRef.current` changes)
  - Zoom level changes
- **Drawing Loop**: `drawLoop()` runs continuously via `requestAnimationFrame`
  - Reads `strokesArray` from server
  - Reads `strokesBufferRef` for local in-progress strokes
  - Clears only drawing canvas, never touches image canvas
- **Stroke Emission**: Strokes appended to `strokesBufferRef` during drawing, then emitted to server

### Benefits
- No image blinking during drawing
- Smooth, real-time stroke rendering
- Efficient: image layer only redraws when necessary

## 4. Upload Locking & Ownership

### Server-Side (`server/server.js`)
- **State**: `uploadLockedBy = socketId` stores who locked the upload
- **Locking**: When image confirmed:
  ```javascript
  uploadLockedBy: socket.id
  ```
- **Validation**: On `scribble:image` event, checks if already locked
  - If locked by another user: emits `scribble:canUpload: { canUpload: false }`
  - If unlocked or locked by self: allows upload
- **Unlocking**: Only `uploadLockedBy` user (or host) can emit `scribble:removeImage`
- **Cleanup**: On disconnect, if user had lock, server releases it

### Client-Side (`client/src/components/ScribbleOverlay.js`)
- **UI Feedback**: Shows "Image locked by <name>. Wait or request removal." when locked
- **Upload Disable**: File input disabled when locked by another user
- **Confirm Button**: Disabled when locked by another user

## 5. Rejoin & Persistence

### Server-Side State Storage
```javascript
{
  image: base64String | null,
  drawings: [...strokes], // Array of stroke objects
  userColors: { [socketId]: color },
  uploadLockedBy: socketId | null
}
```

### Rejoin Flow
1. Client emits `scribble:request-state` on connect
2. Server responds with:
   - `scribble:image`: Current image (if any)
   - `scribble:drawings`: Full strokes array
   - `scribble:userColors`: Current color mapping
   - `scribble:lock`: Lock status
   - `scribble:canUpload`: Upload permission
3. Client:
   - Loads image into `imageRef.current`, draws to `canvasImageRef`
   - Sets `strokesArray` from server (drawLoop automatically replays)
   - Sets `userColors` for legend
   - Updates lock state

### Persistence Notes
- State stored in-memory (`global.__scribbleStateByRoom`)
- For production, consider persisting to database per room
- Current implementation persists per meeting session

## 6. Toolbar Stability & Features

### Working Tools
- **Pen**: Uses `myColor` from server, emits strokes incrementally
- **Eraser**: Removes last stroke, updates undo stack
- **Highlighter**: Semi-transparent stroke (alpha: 0.35)
- **Shapes**: Rectangle, circle, arrow, line with preview during drag
- **Undo/Redo**: Maintains local stack, updates server on change
- **Color Picker**: Updates server color via `scribble:userColorChange`
- **Zoom**: Updates image layer only (drawLayer unaffected)

### Visual Improvements
- Glassmorphism styling
- 42px circular icon buttons
- Micro-animations on hover/click (via CSS transitions)
- Tooltips on all buttons

## 7. Dark Mode for Feedback & User Guide

### CSS Variables (`Feedback.css`, `UserGuide.css`)
```css
.theme--dark {
  --bg: #0b0b0e;
  --surface: #0f1720;
  --text: #e6eef8;
  --text-secondary: #a0aec0;
  --border: #1e293b;
  /* ... */
}
```

### Implementation
- Applied `theme--dark` class to root elements
- Overrides Tailwind classes with CSS variables
- Ensures form elements, modals, links, and code blocks follow dark theme
- High contrast for readability

## 8. Testing Checklist

- ✅ User color mapping originates from server and legend colors match exactly
- ✅ Change color via toolbar updates server & legend for everyone
- ✅ Upload modal appears top-middle, height ≥50% viewport, with close (×)
- ✅ Bottom controls remain visible and interactive during modal
- ✅ Image does not blink while drawing — verified with layered canvases
- ✅ Strokes are incremental, real-time, and persist/replay on rejoin
- ✅ Upload locking enforces single-owner rule
- ✅ Toolbar tools work consistently (pen, eraser, undo/redo, shapes, color)
- ✅ Feedback & User Guide sections render in dark mode properly

## Code Snippets

### Server: Maintain User Colors
```javascript
const generateColorForUser = (socketId) => {
  let hash = 0;
  for (let i = 0; i < socketId.length; i++) {
    hash = socketId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 90%, 60%)`;
};

// On join
scribbleState.userColors[socket.id] = generateColorForUser(socket.id);
io.to(roomId).emit('scribble:userColors', scribbleState.userColors);
```

### Client: Layered Canvases + Draw Loop
```javascript
// Image layer (static)
<canvas ref={canvasImageRef} className="scribble-canvas-image" />

// Drawing layer (overlay)
<canvas ref={canvasDrawRef} className="scribble-canvas-draw" />

// Draw loop
const drawLoop = () => {
  // Clear only drawing canvas
  ctx.clearRect(0, 0, clientWidth, clientHeight);
  // Draw strokes from server array + local buffer
  allStrokes.forEach(drawStroke);
  requestAnimationFrame(drawLoop);
};
```

### Client: Legend from Server Colors
```javascript
{Object.entries(userColors).map(([socketId, color]) => {
  const participant = participants.find(p => p.userId === socketId);
  return (
    <div key={socketId}>
      <span style={{ backgroundColor: color }} />
      <span>{participant.username}</span>
    </div>
  );
})}
```

## Notes
- All changes maintain backward compatibility
- Server state is in-memory; consider database persistence for production
- Canvas coordinate calculation uses devicePixelRatio for high-DPI displays
- Color changes are real-time synced across all clients

