import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { extractAIQuestionAndAnswer } from '../utils/aiResponseHelpers';
import './MeetingMainArea.css';

const MeetingMainArea = ({
  participants = [],
  realParticipants = [],
  isSomeoneScreenSharing = false,
  toolbarPosition = { x: 20, y: 20 },
  currentTool = 'pen',
  currentBrushSize = 5,
  handleToolbarMouseDown,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleSwipe,
  gridPage = 0,
  totalGridPages = 1,
  pinnedParticipantId = null,
  isMirroringBrowser = false,
  socketRef,
  handleExitRoom,
  aiCanvasRef,
  setGridPage,
  aiBotInUse = false,
  currentAIUser = null,
  aiResponse = '',
  aiUploadedImage = null,
  aiUploadedAudio = null,
  getUserAvatar,
  AIAvatar,
  onPinParticipant,
  onUnpinParticipant,
  onAIReset,
  drawingCanvasComponent,
  isAIProcessingLayout,
  onRevertAILayout,
}) => {
  const [localPinnedParticipant, setLocalPinnedParticipant] = useState(pinnedParticipantId);
  const annotationCanvasRef = useRef(null);
  const videoRefs = useRef(new Map());

  useEffect(() => {
    setLocalPinnedParticipant(pinnedParticipantId);
  }, [pinnedParticipantId]);

  const handlePinParticipant = (participantId) => {
    if (localPinnedParticipant === participantId) {
      setLocalPinnedParticipant(null);
      onUnpinParticipant();
    } else {
      setLocalPinnedParticipant(participantId);
      onPinParticipant(participantId);
    }
  };

  const getCurrentPageParticipants = () => {
    const startIndex = gridPage * 3;
    const endIndex = startIndex + 3;
    const pageParticipants = participants.slice(startIndex, endIndex);
    return pageParticipants.length > 3 ? pageParticipants.slice(0, 3) : pageParticipants;
  };

  const setVideoRef = (participant, element) => {
    if (element) {
      videoRefs.current.set(participant.userId, element);
      if (participant.stream) {
        element.srcObject = participant.stream;
        // Ensure video plays
        element.play().catch(err => {
          console.warn('Video play error:', err);
        });
      }
    }
  };

  useEffect(() => {
    participants.forEach(participant => {
      const videoElement = videoRefs.current.get(participant.userId);
      if (videoElement && participant.stream) {
        // Update srcObject if it changed
        if (videoElement.srcObject !== participant.stream) {
          videoElement.srcObject = participant.stream;
          // Ensure video plays after srcObject change
          videoElement.play().catch(err => {
            console.warn('Video play error after srcObject update:', err);
          });
        }
        // Ensure audio continues playing even when navigating pages
        // This prevents audio loss during grid page navigation
        if (participant.stream.getAudioTracks().length > 0) {
          const audioTracks = participant.stream.getAudioTracks();
          audioTracks.forEach(track => {
            if (track.readyState === 'live' && !track.enabled) {
              track.enabled = true;
            }
          });
        }
      }
    });
  }, [participants, gridPage]); // Add gridPage to dependencies to ensure audio persists on page change

  // === NEW: Parse full AI JSON ===
  const parseAIResult = (raw) => {
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return { text: raw || '' };
    }
  };

  const renderParticipantVideo = (participant, index) => {
    const isAI = participant.userId === 'ai-assistant';
    const isPinned = localPinnedParticipant === participant.userId;
    const hasVideo = participant.videoEnabled && participant.stream;
    const isScreenSharing = participant.isScreenSharing;

    let videoClass = 'pro-video-element';
    
    // Only apply mirror transform for local camera (not screen shares or remote videos)
    const shouldMirror = participant.isLocal && !isScreenSharing;
    const videoStyle = {
      width: '100%',
      height: '100%',
      objectFit: isScreenSharing ? 'contain' : 'cover', // Use 'contain' for screen shares to show full content
      borderRadius: '8px',
      display: 'block',
      margin: '0',
      padding: '0',
      transform: shouldMirror ? 'scaleX(-1)' : 'none'
    };

    return (
      <motion.div
        key={participant.userId || `participant-${index}`}
        className={`pro-video-frame ${
          isPinned ? 'pro-video-frame--pinned' : ''
        } ${isAI ? 'pro-video-frame--ai' : ''} ${
          isScreenSharing ? 'pro-video-frame--screen-share' : ''
        }`}
        layout
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <div className="pro-video-container">
          {hasVideo && !isAI ? (
            <video
              ref={(video) => setVideoRef(participant, video)}
              autoPlay
              muted={participant.isLocal}
              playsInline
              className={videoClass}
              key={`video-${participant.userId}-${participant.stream ? 'stream' : 'no-stream'}`}
              style={videoStyle}
            />
          ) : isAI ? (
            <div className="pro-ai-visualization">
              {/* Revert Button */}
              {isAIProcessingLayout && (
                <button
                  className="pro-ai-wrong-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRevertAILayout?.();
                  }}
                  title="Revert to previous layout"
                >
                  Wrong
                </button>
              )}

              {/* 1. Processing: Show uploaded media */}
              {isAIProcessingLayout && !aiResponse && (aiUploadedImage || aiUploadedAudio) ? (
                <div className="pro-ai-processing-layout">
                  <div className="pro-ai-uploaded-content-wrapper">
                    {aiUploadedImage && (
                      <div className="pro-ai-uploaded-media-container">
                        <img
                          src={aiUploadedImage}
                          alt="Uploaded"
                          className="pro-ai-uploaded-image-full"
                        />
                      </div>
                    )}
                    {aiUploadedAudio && (
                      <div className="pro-ai-uploaded-audio-container">
                        <audio
                          controls
                          src={aiUploadedAudio}
                          className="pro-ai-uploaded-audio-full"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : /* 2. Result: Show full AI response */ isAIProcessingLayout && aiResponse ? (
                (() => {
                  const result = parseAIResult(aiResponse);
                  const question = result.sent_from_csv || '';
                  const answer = result.text || '';
                  const hasCSV = !!question;

                  return (
                    <div className="pro-ai-response-layout">
                      {/* Question (CSV) */}
                      {hasCSV && (
                        <div className="pro-ai-question-text">
                          {question}
                          <span className="csv-badge">[CSV]</span>
                        </div>
                      )}

                      {/* Image */}
                      {aiUploadedImage && (
                        <div className="pro-ai-response-image-container">
                          <img
                            src={aiUploadedImage}
                            alt="AI input"
                            className="pro-ai-response-image"
                          />
                        </div>
                      )}

                      {/* Answer */}
                      {answer && (
                        <div className="pro-ai-answer-text">
                          <span className="pro-ai-answer-label">AI:</span> {answer}
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="pro-ai-meta">
                        {result.confidence !== undefined && (
                          <span>
                            Confidence: {(result.confidence * 100).toFixed(2)}%
                          </span>
                        )}
                        {result.latency_ms && (
                          <span>Latency: {result.latency_ms} ms</span>
                        )}
                        {result.device && <span>Device: {result.device.toUpperCase()}</span>}
                        {result.type && <span>Type: {result.type}</span>}
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* 3. Idle: AI Avatar + Canvas */
                <>
                  <div className="pro-ai-logo-container">
                    <AIAvatar size={120} />
                    <div className="pro-ai-ready-text">Ready to help</div>
                  </div>
                  <canvas ref={aiCanvasRef} className="pro-ai-canvas" />
                </>
              )}
            </div>
          ) : (
            <div className="pro-video-placeholder">
              {(() => {
                if (participant.profilePicture && typeof participant.profilePicture === 'string') {
                  return (
                    <img
                      src={participant.profilePicture}
                      alt={participant.username}
                      style={{
                        width: '120px',
                        height: '120px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '3px solid rgba(59, 130, 246, 0.5)',
                        display: 'block',
                        margin: '0 auto',
                        padding: '0',
                        transform: 'scaleX(-1)'
                      }}
                    />
                  );
                }
                return getUserAvatar(participant, 80);
              })()}
            </div>
          )}
        </div>

        <div className="pro-participant-info">
          <div className="pro-participant-name">
            {participant.username}
            {participant.isLocal && !isAI && ' (You)'}
            {participant.isHost && ' (Host)'}
            {isAI && ' (AI)'}
            {isScreenSharing && ' (Screen)'}
          </div>

          <div className="pro-status-indicators">
            {!participant.audioEnabled && !isAI && (
              <div className="pro-status-icon pro-status-icon--muted" title="Audio muted">
                Muted
              </div>
            )}
            {!participant.videoEnabled && !isAI && (
              <div className="pro-status-icon pro-status-icon--video-off" title="Video off">
                Video Off
              </div>
            )}
            {isPinned && !isAI && (
              <div className="pro-status-icon pro-status-icon--pinned" title="Pinned">
                Pinned
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  const renderScreenShareView = () => {
    const screenSharer = participants.find((p) => p.isScreenSharing);
    const otherParticipants = participants.filter((p) => !p.isScreenSharing && p.userId !== screenSharer?.userId);

    if (!screenSharer) return null;

    return (
      <div className="pro-screenshare-view">
        <div className="pro-screenshare-main">
          {renderParticipantVideo(screenSharer, 0)}
          {drawingCanvasComponent && <div className="drawing-canvas-wrapper">{drawingCanvasComponent}</div>}
        </div>
        {otherParticipants.length > 0 && (
          <motion.div
            className="pro-screenshare-participants"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {otherParticipants.slice(0, 4).map((participant, index) => (
              <motion.div
                key={participant.userId}
                className="pro-screenshare-participant"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                {renderParticipantVideo(participant, index)}
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    );
  };

  const getGridLayout = (participantCount) => {
    if (participantCount <= 0) return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr', width: '100vw' };
    if (participantCount === 1) return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr', width: '100vw' };
    if (participantCount === 2) return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr', width: '100vw', gap: '4px' };
    if (participantCount === 3) return { gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr', width: '100vw', gap: '4px' };
    return { gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr', width: '100vw', gap: '4px' };
  };

  const renderGridView = () => {
    const currentPageParticipants = getCurrentPageParticipants();
    const sortedParticipants = [...currentPageParticipants].sort((a, b) => {
      if (a.userId === 'ai-assistant') return -1;
      if (b.userId === 'ai-assistant') return 1;
      return 0;
    });

    const totalParticipantCount = sortedParticipants.length;
    const gridLayout = getGridLayout(totalParticipantCount);

    return (
      <motion.div
        className={`pro-video-grid-responsive pro-video-grid--${totalParticipantCount}`}
        style={{
          ...gridLayout,
          display: 'grid',
          width: '100vw',
          height: '100%'
        }}
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <AnimatePresence mode="popLayout">
          {sortedParticipants.map((participant, index) => (
            <motion.div
              key={participant.userId}
              layout
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -20 }}
              transition={{
                duration: 0.4,
                delay: index * 0.1,
                ease: "easeOut"
              }}
              whileTap={{ scale: 0.98 }}
              className="pro-video-grid-item-responsive"
            >
              {renderParticipantVideo(participant, index)}
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <motion.div
      className="pro-mainarea"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="pro-mainarea-grid"
        layout
        transition={{ duration: 0.3 }}
      >
        {isSomeoneScreenSharing ? renderScreenShareView() : renderGridView()}
      </motion.div>

      {/* Pagination */}
      {!isSomeoneScreenSharing && totalGridPages > 1 && participants.length > 3 && (
        <div className="pro-grid-pagination">
          <button
            className="pro-pagination-btn"
            onClick={() => setGridPage((prev) => Math.max(0, prev - 1))}
            disabled={gridPage === 0}
          >
            Previous
          </button>
          <div className="pro-grid-dots">
            {Array.from({ length: totalGridPages }).map((_, index) => (
              <button
                key={index}
                className={`pro-grid-dot ${gridPage === index ? 'pro-grid-dot--active' : ''}`}
                onClick={() => setGridPage(index)}
              />
            ))}
          </div>
          <button
            className="pro-pagination-btn"
            onClick={() => setGridPage((prev) => Math.min(totalGridPages - 1, prev + 1))}
            disabled={gridPage === totalGridPages - 1}
          >
            Next
          </button>
        </div>
      )}
    </motion.div>
  );
};

export default MeetingMainArea;