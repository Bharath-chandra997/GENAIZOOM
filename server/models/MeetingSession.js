const mongoose = require('mongoose');

const MeetingSessionSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  activeParticipants: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      username: String,
      socketId: String,
      isActive: { type: Boolean, default: true },
      lastSeen: Date,
    },
  ],
  uploadedFiles: [
    {
      type: String,
      url: String,
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      uploadedByUsername: String,
      filename: String,
      size: Number,
    },
  ],
  aiState: {
    isLocked: { type: Boolean, default: false }, // Added for lock state
    lockedBy: { type: String }, // Changed to String for userId consistency
    lockedByUsername: String,
    lockedAt: Date,
    isProcessing: { type: Boolean, default: false },
    output: { type: String, default: '' },
    completedAt: { type: Date },
    currentUploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploaderUsername: String,
    startedAt: Date,
    resultUsername: String,
  },
  chatMessages: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      username: String,
      message: String,
      timestamp: Number,
    },
  ],
  sharedMedia: {
    imageUrl: String,
    audioUrl: String,
    uploaderUsername: String,
    isDisplayed: { type: Boolean, default: false },
    displayedAt: Date,
    removedAt: Date,
  },
});

// Update AI state
MeetingSessionSchema.methods.updateAIState = function (data) {
  if (!this.aiState) this.aiState = {};
  this.aiState.isLocked = data.isLocked ?? this.aiState.isLocked;
  this.aiState.lockedBy = data.lockedBy ?? this.aiState.lockedBy;
  this.aiState.lockedByUsername = data.lockedByUsername ?? this.aiState.lockedByUsername;
  this.aiState.lockedAt = data.lockedAt ?? this.aiState.lockedAt;
  this.aiState.isProcessing = data.isProcessing ?? this.aiState.isProcessing;
  this.aiState.output = data.output ?? this.aiState.output;
  this.aiState.completedAt = data.completedAt ?? this.aiState.completedAt;
  this.aiState.currentUploader = data.currentUploader ?? this.aiState.currentUploader;
  this.aiState.uploaderUsername = data.uploaderUsername ?? this.aiState.uploaderUsername;
  this.markModified('aiState');
};

// Lock AI for a user
MeetingSessionSchema.methods.lockAI = function (userId, username) {
  if (!this.aiState) this.aiState = {};
  if (this.aiState.isLocked && this.aiState.lockedBy !== userId) {
    throw new Error('AI is already locked by another user');
  }
  this.aiState.isLocked = true;
  this.aiState.lockedBy = userId; // String
  this.aiState.lockedByUsername = username;
  this.aiState.lockedAt = new Date();
  this.aiState.isProcessing = true;
  this.markModified('aiState');
};

// Unlock AI for a user
MeetingSessionSchema.methods.unlockAI = function (userId) {
  if (!this.aiState) this.aiState = {};
  if (!this.aiState.isLocked) {
    throw new Error('AI is not locked');
  }
  if (this.aiState.lockedBy !== userId) {
    throw new Error('Not authorized to unlock AI');
  }
  this.aiState.isLocked = false;
  this.aiState.lockedBy = null;
  this.aiState.lockedByUsername = null;
  this.aiState.lockedAt = null;
  this.aiState.isProcessing = false;
  this.markModified('aiState');
};

// Add participant
MeetingSessionSchema.methods.addParticipant = function (userId, username, socketId) {
  const existing = this.activeParticipants.find(p => p.userId.toString() === userId.toString());
  if (existing) {
    existing.socketId = socketId;
    existing.isActive = true;
    existing.lastSeen = new Date();
  } else {
    this.activeParticipants.push({
      userId,
      username,
      socketId,
      isActive: true,
      lastSeen: new Date(),
    });
  }
  this.markModified('activeParticipants');
};

// Add uploaded file
MeetingSessionSchema.methods.addUploadedFile = function (fileData) {
  this.uploadedFiles.push(fileData);
  this.markModified('uploadedFiles');
};

// Add chat message
MeetingSessionSchema.methods.addChatMessage = function (messageData) {
  this.chatMessages.push(messageData);
  this.markModified('chatMessages');
};

module.exports = mongoose.model('MeetingSession', MeetingSessionSchema);