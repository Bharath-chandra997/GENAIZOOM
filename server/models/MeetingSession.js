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

MeetingSessionSchema.methods.updateAIState = function (data) {
  if (!this.aiState) this.aiState = {};
  this.aiState.isProcessing = data.isProcessing ?? this.aiState.isProcessing;
  this.aiState.output = data.output ?? this.aiState.output;
  this.aiState.completedAt = data.completedAt ?? this.aiState.completedAt;
  this.aiState.currentUploader = data.currentUploader ?? this.aiState.currentUploader;
  this.aiState.uploaderUsername = data.uploaderUsername ?? this.aiState.uploaderUsername;
  this.markModified('aiState');
};

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

MeetingSessionSchema.methods.addUploadedFile = function (fileData) {
  this.uploadedFiles.push(fileData);
  this.markModified('uploadedFiles');
};

MeetingSessionSchema.methods.addChatMessage = function (messageData) {
  this.chatMessages.push(messageData);
  this.markModified('chatMessages');
};

module.exports = mongoose.model('MeetingSession', MeetingSessionSchema);