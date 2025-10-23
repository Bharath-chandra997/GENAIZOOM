const express = require('express');
const Feedback = require('../models/Feedback');
const auth = require('../middleware/auth');
const { info, logError } = require('../utils/logger');

const router = express.Router();

// Sanitize input function
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim();
};

// @route   POST /api/feedback
// @desc    Submit feedback
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { email, message } = req.body;
    info(`Feedback submission from userId: ${req.user.userId}, IP: ${req.ip}`);

    if (!email || !message) {
      return res.status(400).json({ error: 'Email and message are required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Sanitize inputs
    const sanitizedEmail = sanitizeInput(email);
    const sanitizedMessage = sanitizeInput(message);

    if (sanitizedMessage.length < 10) {
      return res.status(400).json({ error: 'Message must be at least 10 characters long' });
    }

    if (sanitizedMessage.length > 1000) {
      return res.status(400).json({ error: 'Message must be less than 1000 characters' });
    }

    // Create feedback entry
    const feedback = new Feedback({
      email: sanitizedEmail,
      message: sanitizedMessage,
    });

    await feedback.save();
    info(`Feedback submitted: email: ${sanitizedEmail}, message length: ${sanitizedMessage.length}, IP: ${req.ip}`);

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      feedback: {
        id: feedback._id,
        email: feedback.email,
        message: feedback.message,
        createdAt: feedback.createdAt
      }
    });

  } catch (error) {
    logError(`Feedback submission failed for userId: ${req.user?.userId || 'unknown'}, IP: ${req.ip}`, error);
    res.status(500).json({ error: 'Server error during feedback submission' });
  }
});

// @route   GET /api/feedback
// @desc    Get user's feedback history (optional - for admin purposes)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    info(`Fetching feedback history for userId: ${req.user.userId}, IP: ${req.ip}`);

    const feedback = await Feedback.find({ email: req.user.email })
      .sort({ createdAt: -1 })
      .select('email message createdAt');

    res.json({
      success: true,
      feedback: feedback
    });

  } catch (error) {
    logError(`Get feedback failed for userId: ${req.user?.userId || 'unknown'}, IP: ${req.ip}`, error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
