const express = require('express');
const passport = require('passport');
const mongoose = require('mongoose');
const User = require('../models/User');
const { info, logError } = require('../utils/logger');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Initiate Google OAuth
router.get('/google', (req, res, next) => {
  const { flow } = req.query;
  info(`Initiating Google OAuth with flow: ${flow}, IP: ${req.ip}`);
  if (!['login', 'register'].includes(flow)) {
    info(`Invalid flow parameter: ${flow}, IP: ${req.ip}`);
    return res.redirect(`https://genaizoom123.onrender.com/auth/callback?error=invalid_flow`);
  }
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: JSON.stringify({ flow }),
    session: false,
    prompt: 'select_account',
  })(req, res, next);
});

// Google OAuth callback
router.get('/google/callback', passport.authenticate('google', { session: false }), async (req, res) => {
  try {
    const { flow } = JSON.parse(req.query.state || '{}');
    const { user, token } = req.user;
    const clientUrl = process.env.CLIENT_URL ;

    if (!user) {
      info(`Authentication failed for flow: ${flow}, IP: ${req.ip}`);
      return res.redirect(`https://genaizoom123.onrender.com/auth/callback?error=authentication_failed`);
    }

    info(`Authentication successful for user: ${user.email}, flow: ${flow}, IP: ${req.ip}, token: ${token.slice(0, 10)}...`);
    return res.redirect(`https://genaizoom123.onrender.com/auth/callback?token=${token}`);
  } catch (error) {
    logError(`Google auth callback error for IP: ${req.ip}`, error);
    const clientUrl = process.env.CLIENT_URL;
    return res.redirect(`https://genaizoom123.onrender.com/auth/callback?error=server_error`);
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    if (!req.user.userId) {
      info(`Invalid userId in token, IP: ${req.ip}`);
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    if (!mongoose.isValidObjectId(req.user.userId)) {
      info(`Invalid ObjectId format for userId: ${req.user.userId}, IP: ${req.ip}`);
      return res.status(401).json({ error: 'Invalid user ID format' });
    }
    info(`Fetching user for userId: ${req.user.userId}, IP: ${req.ip}`);
    const user = await User.findById(req.user.userId).select('-__v');
    if (!user) {
      info(`User not found for userId: ${req.user.userId}, IP: ${req.ip}`);
      return res.status(404).json({ error: 'User not found' });
    }
    info(`Fetched user: ${user.email}, IP: ${req.ip}`);
    res.json({ user });
  } catch (error) {
    logError(`Get user error for userId: ${req.user.userId || 'unknown'}, IP: ${req.ip}`, error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    if (!req.user.userId) {
      info(`Invalid userId in token for profile update, IP: ${req.ip}`);
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    if (!mongoose.isValidObjectId(req.user.userId)) {
      info(`Invalid ObjectId format for userId: ${req.user.userId}, IP: ${req.ip}`);
      return res.status(401).json({ error: 'Invalid user ID format' });
    }
    info(`Fetching user for profile update, userId: ${req.user.userId}, IP: ${req.ip}`);
    const user = await User.findById(req.user.userId);
    if (!user) {
      info(`User not found for profile update, userId: ${req.user.userId}, IP: ${req.ip}`);
      return res.status(404).json({ error: 'User not found' });
    }
    const { username } = req.body;
    if (username) {
      user.username = username;
      await user.save();
      info(`Profile updated for user: ${user.email}, IP: ${req.ip}`);
    }
    res.json({ user });
  } catch (error) {
    logError(`Profile update error for userId: ${req.user.userId || 'unknown'}, IP: ${req.ip}`, error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;