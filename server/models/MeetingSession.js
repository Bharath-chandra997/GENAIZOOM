const mongoose = require('mongoose');

const uploadedFileSchema = new mongoose.Schema({
  type: { type: String, enum: ['image', 'audio'], required: true },
  url: { type: String, required: true },
  uploadedBy: { type: String, required: true }, // userId
  uploadedByUsername: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  filename: { type: String },
  size: { type: Number },
});

const aiProcessingStateSchema = new mongoose.Schema({
  isProcessing: { type: Boolean, default: false },
  currentUploader: { type: String }, // userId
  uploaderUsername: { type: String },
  startedAt: { type: Date },
  output: { type: String },
  completedAt: { type: Date },
  resultUsername: { type: String },
});

const sharedMediaSchema = new mongoose.Schema({
  imageUrl: { type: String },
  audioUrl: { type: String },
  uploaderUsername: { type: String },
  isDisplayed: { type: Boolean, default: false },
  displayedAt: { type: Date },
  removedAt: { type: Date },
});

const meetingSessionSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  meetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting' },
  activeParticipants: [{
    userId: { type: String, required: true },
    username: { type: String, required: true },
    socketId: { type: String },
    joinedAt: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  }],
  uploadedFiles: [uploadedFileSchema],
  aiState: aiProcessingStateSchema,
  sharedMedia: sharedMediaSchema,
  chatMessages: [{
    message: { type: String, required: true },
    username: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    userId: { type: String, required: true },
  }],
  lastActivity: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Update the updatedAt field on save
meetingSessionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  this.lastActivity = new Date();
  next();
});

// Methods
meetingSessionSchema.methods.addParticipant = function(userId, username, socketId) {
  const existingParticipant = this.activeParticipants.find(p => p.userId === userId);
  if (existingParticipant) {
    existingParticipant.socketId = socketId;
    existingParticipant.lastSeen = new Date();
    existingParticipant.isActive = true;
    return existingParticipant;
  }
  
  const participant = {
    userId,
    username,
    socketId,
    joinedAt: new Date(),
    lastSeen: new Date(),
    isActive: true,
  };
  this.activeParticipants.push(participant);
  return participant;
};

meetingSessionSchema.methods.removeParticipant = function(userId) {
  const participant = this.activeParticipants.find(p => p.userId === userId);
  if (participant) {
    participant.isActive = false;
    participant.lastSeen = new Date();
  }
  return participant;
};

meetingSessionSchema.methods.addUploadedFile = function(fileData) {
  const file = new uploadedFileSchema(fileData);
  this.uploadedFiles.push(file);
  return file;
};

meetingSessionSchema.methods.updateAIState = function(aiStateData) {
  this.aiState = { ...this.aiState, ...aiStateData };
  return this.aiState;
};

meetingSessionSchema.methods.addChatMessage = function(messageData) {
  const message = {
    message: messageData.message,
    username: messageData.username,
    timestamp: messageData.timestamp || new Date(),
    userId: messageData.userId,
  };
  this.chatMessages.push(message);
  return message;
};

meetingSessionSchema.methods.cleanupInactiveParticipants = function() {
  const now = new Date();
  const inactiveThreshold = 5 * 60 * 1000; // 5 minutes
  
  this.activeParticipants.forEach(participant => {
    if (now - participant.lastSeen > inactiveThreshold) {
      participant.isActive = false;
    }
  });
  
  return this.activeParticipants.filter(p => p.isActive);
};

module.exports = mongoose.models.MeetingSession || mongoose.model('MeetingSession', meetingSessionSchema);
