const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  joinedAt: { type: Date, default: Date.now },
  leftAt: { type: Date },
  isActive: { type: Boolean, default: true },
});

const meetingSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  title: { type: String, required: true, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hostId: { type: String, required: true }, // customUserId of the host
  participants: [participantSchema],
  maxParticipants: { type: Number, default: 15 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now, expires: '24h' },
  endedAt: { type: Date },
  settings: {
    waitingRoomEnabled: { type: Boolean, default: false },
    muteParticipantsOnEntry: { type: Boolean, default: false },
    allowScreenSharing: { type: Boolean, default: true },
  },
  isScheduled: { type: Boolean, default: false },
  scheduledStart: { type: Date },
  duration: { type: Number },
});

meetingSchema.virtual('activeParticipantCount').get(function () {
  return this.participants.filter((p) => p.isActive).length;
});

meetingSchema.methods.addParticipant = function (userId, username) {
  if (this.activeParticipantCount >= this.maxParticipants) {
    throw new Error('Meeting is full');
  }
  const existingParticipant = this.participants.find((p) => p.userId.toString() === userId.toString() && p.isActive);
  if (existingParticipant) {
    return existingParticipant;
  }
  const participant = {
    userId,
    username,
    joinedAt: new Date(),
    isActive: true,
  };
  this.participants.push(participant);
  return participant;
};

meetingSchema.methods.removeParticipant = function (userId) {
  const participant = this.participants.find((p) => p.userId.toString() === userId.toString() && p.isActive);
  if (participant) {
    participant.isActive = false;
    participant.leftAt = new Date();
    return participant;
  }
  return null;
};

module.exports = mongoose.models.Meeting || mongoose.model('Meeting', meetingSchema);