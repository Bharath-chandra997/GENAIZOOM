const jwt = require('jsonwebtoken');
const { info, logError } = require('../utils/logger');

const authMiddleware = (req, res, next) => {
  const authHeader = req.header('Authorization');
  info(`Auth middleware: Authorization header: ${authHeader || 'None'}, IP: ${req.ip}, Path: ${req.path}`);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    info(`Auth middleware: No or invalid Authorization header, IP: ${req.ip}, Path: ${req.path}`);
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    if (!process.env.JWT_SECRET) {
      logError('JWT_SECRET is not defined', { ip: req.ip, path: req.path });
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    info(`Token decoded: ${JSON.stringify(decoded)}, IP: ${req.ip}, Path: ${req.path}`);
    req.user = decoded;
    next();
  } catch (error) {
    logError(`JWT verification error: ${error.name} - ${error.message}, Token: ${token.slice(0, 10)}..., IP: ${req.ip}, Path: ${req.path}`, error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = authMiddleware;