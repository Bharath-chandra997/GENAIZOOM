const express = require('express');
const { v4: uuidv4 } = require('uuid');
const sanitizeHtml = require('sanitize-html');
const Meeting = require('../models/Meeting');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { info, logError } = require('../utils/logger');

const router = express.Router();

// Sanitize input function
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return sanitizeHtml(input.trim(), {
    allowedTags: [],
    allowedAttributes: {}
  });
};

// @route   POST /api/meetings
// @desc    Create a new meeting room
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { title } = req.body;
    info(`Creating meeting for userId: ${req.user.userId}, IP: ${req.ip}`);

    // Generate unique room ID and host ID
    const roomId = uuidv4();
    const hostId = uuidv4();
   
    // Sanitize title if provided
    const sanitizedTitle = title ? sanitizeInput(title) : 'Untitled Meeting';

    // Get user information
    const user = await User.findById(req.user.userId);
    if (!user) {
      info(`User not found for userId: ${req.user.userId}, IP: ${req.ip}`);
      return res.status(404).json({ error: 'User not found' });
    }

    // Create new meeting
    const meeting = new Meeting({
      roomId,
      title: sanitizedTitle,
      createdBy: req.user.userId,
      hostId, // Set hostId
      participants: [
        {
          userId: req.user.userId,
          username: user.username,
          isActive: true,
        },
      ],
    });

    await meeting.save();
    info(`Meeting created: roomId: ${roomId}, title: ${sanitizedTitle}, createdBy: ${user.email}, hostId: ${hostId}, IP: ${req.ip}`);

    res.status(201).json({
      success: true,
      message: 'Meeting created successfully',
      meeting: {
        roomId: meeting.roomId,
        title: meeting.title,
        createdBy: {
          id: user._id,
          username: user.username
        },
        createdAt: meeting.createdAt,
        maxParticipants: meeting.maxParticipants,
        settings: meeting.settings,
        isHost: true, // Indicate the creator is the host
      }
    });

  } catch (error) {
    logError(`Meeting creation failed for userId: ${req.user?.userId || 'unknown'}, IP: ${req.ip}`, error);
    res.status(500).json({ error: `Server error during meeting creation: ${error.message}` });
  }
});

// @route   GET /api/meetings/:roomId
// @desc    Get meeting room details and verify access
// @access  Public (for joining meetings)
router.get('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    info(`Fetching meeting details for roomId: ${roomId}, IP: ${req.ip}`);

    if (!roomId) {
      return res.status(400).json({ error: 'Room ID is required' });
    }

    // Find meeting by room ID
    const meeting = await Meeting.findOne({ roomId, isActive: true })
      .populate('createdBy', 'username email')
      .populate('participants.userId', 'username email');

    if (!meeting) {
      info(`Meeting not found for roomId: ${roomId}, IP: ${req.ip}`);
      return res.status(404).json({ error: 'Meeting room not found' });
    }

    // Check if meeting is scheduled and hasn't started yet
    if (meeting.isScheduled && meeting.scheduledStart) {
      const now = new Date();
      const startTime = new Date(meeting.scheduledStart);
     
      if (now < startTime) {
        const timeUntilStart = Math.ceil((startTime - now) / (1000 * 60)); // minutes
        return res.status(400).json({
          error: `Meeting hasn't started yet. It will begin in ${timeUntilStart} minutes.`
        });
      }
    }

    // Check participant count
    const activeParticipantCount = meeting.activeParticipantCount;
   
    res.json({
      success: true,
      meeting: {
        roomId: meeting.roomId,
        title: meeting.title,
        createdBy: {
          id: meeting.createdBy._id,
          username: meeting.createdBy.username
        },
        activeParticipantCount,
        maxParticipants: meeting.maxParticipants,
        canJoin: activeParticipantCount < meeting.maxParticipants,
        settings: meeting.settings,
        createdAt: meeting.createdAt,
        isScheduled: meeting.isScheduled,
        scheduledStart: meeting.scheduledStart,
        isHost: req.user ? meeting.createdBy._id.toString() === req.user.userId : false,
      }
    });

  } catch (error) {
    logError(`Get meeting failed for roomId: ${req.params.roomId}, IP: ${req.ip}`, error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/meetings/:roomId/join
// @desc    Join a meeting room
// @access  Private
router.post('/:roomId/join', auth, async (req, res) => {
  try {
    const { roomId } = req.params;
    info(`Joining meeting for userId: ${req.user.userId}, roomId: ${roomId}, IP: ${req.ip}`);

    // Find meeting
    const meeting = await Meeting.findOne({ roomId, isActive: true });
    if (!meeting) {
      info(`Meeting not found for roomId: ${roomId}, IP: ${req.ip}`);
      return res.status(404).json({ error: 'Meeting room not found' });
    }

    // Check participant limit
    if (meeting.activeParticipantCount >= meeting.maxParticipants) {
      return res.status(400).json({
        error: 'Room is full, maximum 15 participants allowed'
      });
    }

    // Get user information
    const user = await User.findById(req.user.userId);
    if (!user) {
      info(`User not found for userId: ${req.user.userId}, IP: ${req.ip}`);
      return res.status(404).json({ error: 'User not found' });
    }

    // If waiting room is enabled and user is not the host, return pending status
    if (meeting.settings.waitingRoomEnabled && meeting.createdBy.toString() !== req.user.userId) {
      // Emit join request to the host via socket (handled in index.js)
      return res.json({
        success: true,
        message: 'Join request sent, waiting for host approval',
        pending: true,
        meeting: {
          roomId: meeting.roomId,
          title: meeting.title,
          activeParticipantCount: meeting.activeParticipantCount,
          isHost: false,
        }
      });
    }

    // Add participant to meeting
    try {
      const participant = meeting.addParticipant(req.user.userId, user.username);
      await meeting.save();
      info(`User ${user.email} joined meeting roomId: ${roomId}, IP: ${req.ip}`);

      res.json({
        success: true,
        message: 'Successfully joined the meeting',
        participant: {
          userId: participant.userId,
          username: participant.username,
          joinedAt: participant.joinedAt
        },
        meeting: {
          roomId: meeting.roomId,
          title: meeting.title,
          activeParticipantCount: meeting.activeParticipantCount,
          isHost: meeting.createdBy.toString() === req.user.userId.toString()
        }
      });

    } catch (err) {
      if (err.message === 'Meeting is full') {
        return res.status(400).json({ error: 'Meeting is full' });
      }
      throw err;
    }

  } catch (error) {
    logError(`Join meeting failed for userId: ${req.user?.userId || 'unknown'}, roomId: ${req.params.roomId}, IP: ${req.ip}`, error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/meetings/:roomId/leave
// @desc    Leave a meeting room
// @access  Private
router.post('/:roomId/leave', auth, async (req, res) => {
  try {
    const { roomId } = req.params;
    info(`Leaving meeting for userId: ${req.user.userId}, roomId: ${roomId}, IP: ${req.ip}`);

    // Find meeting
    const meeting = await Meeting.findOne({ roomId, isActive: true });
    if (!meeting) {
      info(`Meeting not found for roomId: ${roomId}, IP: ${req.ip}`);
      return res.status(404).json({ error: 'Meeting room not found' });
    }

    // Remove participant
    const participant = meeting.removeParticipant(req.user.userId);
    if (!participant) {
      return res.status(400).json({ error: 'You are not a participant in this meeting' });
    }

    await meeting.save();
    info(`User ${req.user.email} left meeting roomId: ${roomId}, IP: ${req.ip}`);

    res.json({
      success: true,
      message: 'Successfully left the meeting',
      leftAt: participant.leftAt
    });

  } catch (error) {
    logError(`Leave meeting failed for userId: ${req.user?.userId || 'unknown'}, roomId: ${req.params.roomId}, IP: ${req.ip}`, error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/meetings/user/history
// @desc    Get user's meeting history
// @access  Private
router.get('/user/history', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    info(`Fetching meeting history for userId: ${req.user.userId}, page: ${page}, limit: ${limit}, IP: ${req.ip}`);

    // Find meetings created by user or where user participated
    const meetings = await Meeting.find({
      $or: [
        { createdBy: req.user.userId },
        { 'participants.userId': req.user.userId }
      ]
    })
    .populate('createdBy', 'username')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('roomId title createdBy createdAt endedAt isActive participants');

    const total = await Meeting.countDocuments({
      $or: [
        { createdBy: req.user.userId },
        { 'participants.userId': req.user.userId }
      ]
    });

    const meetingsWithStats = meetings.map(meeting => ({
      roomId: meeting.roomId,
      title: meeting.title,
      createdBy: meeting.createdBy,
      createdAt: meeting.createdAt,
      endedAt: meeting.endedAt,
      isActive: meeting.isActive,
      participantCount: meeting.participants.length,
      isHost: meeting.createdBy._id.toString() === req.user.userId.toString()
    }));

    res.json({
      success: true,
      meetings: meetingsWithStats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalMeetings: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    logError(`Get meeting history failed for userId: ${req.user?.userId || 'unknown'}, IP: ${req.ip}`, error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/meetings/schedule
// @desc    Schedule a meeting for future
// @access  Private
router.post('/schedule', auth, async (req, res) => {
  try {
    const { title, scheduledStart, duration } = req.body;
    info(`Scheduling meeting for userId: ${req.user.userId}, IP: ${req.ip}`);

    if (!scheduledStart) {
      return res.status(400).json({ error: 'Scheduled start time is required' });
    }

    const startTime = new Date(scheduledStart);
    const now = new Date();

    if (startTime <= now) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }

    // Generate unique room ID and host ID
    const roomId = uuidv4();
    const hostId = uuidv4();
   
    // Sanitize title
    const sanitizedTitle = title ? sanitizeInput(title) : 'Scheduled Meeting';

    // Create scheduled meeting
    const meeting = new Meeting({
      roomId,
      title: sanitizedTitle,
      createdBy: req.user.userId,
      hostId,
      isScheduled: true,
      scheduledStart: startTime,
      duration: parseInt(duration) || 60
    });

    await meeting.save();
    info(`Meeting scheduled: roomId: ${roomId}, title: ${sanitizedTitle}, createdBy: ${req.user.email}, hostId: ${hostId}, IP: ${req.ip}`);

    const user = await User.findById(req.user.userId).select('username');

    res.status(201).json({
      success: true,
      message: 'Meeting scheduled successfully',
      meeting: {
        roomId: meeting.roomId,
        title: meeting.title,
        createdBy: {
          id: user._id,
          username: user.username
        },
        scheduledStart: meeting.scheduledStart,
        duration: meeting.duration,
        createdAt: meeting.createdAt
      }
    });

  } catch (error) {
    logError(`Schedule meeting failed for userId: ${req.user?.userId || 'unknown'}, IP: ${req.ip}`, error);
    res.status(500).json({ error: 'Server error during meeting scheduling' });
  }
});

// @route   GET /api/meetings/scheduled
// @desc    Get user's scheduled meetings
// @access  Private
router.get('/scheduled', auth, async (req, res) => {
  try {
    info(`Fetching scheduled meetings for userId: ${req.user.userId}, IP: ${req.ip}`);

    const scheduledMeetings = await Meeting.find({
      createdBy: req.user.userId,
      isScheduled: true,
      isActive: true
    })
    .sort({ scheduledStart: 1 })
    .select('roomId title scheduledStart duration createdAt');

    res.json({
      success: true,
      meetings: scheduledMeetings
    });

  } catch (error) {
    logError(`Get scheduled meetings failed for userId: ${req.user?.userId || 'unknown'}, IP: ${req.ip}`, error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/meetings/scheduled/:roomId
// @desc    Cancel a scheduled meeting
// @access  Private
router.delete('/scheduled/:roomId', auth, async (req, res) => {
  try {
    const { roomId } = req.params;
    info(`Canceling scheduled meeting for userId: ${req.user.userId}, roomId: ${roomId}, IP: ${req.ip}`);

    const meeting = await Meeting.findOne({
      roomId,
      createdBy: req.user.userId,
      isScheduled: true
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Scheduled meeting not found' });
    }

    await Meeting.findByIdAndDelete(meeting._id);
    info(`Scheduled meeting canceled: roomId: ${roomId}, IP: ${req.ip}`);

    res.json({
      success: true,
      message: 'Meeting canceled successfully'
    });

  } catch (error) {
    logError(`Cancel scheduled meeting failed for userId: ${req.user?.userId || 'unknown'}, roomId: ${req.params.roomId}, IP: ${req.ip}`, error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;