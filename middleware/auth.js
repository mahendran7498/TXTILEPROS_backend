const User = require('../models/User');
const { verifyToken } = require('../utils/auth');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).select('-passwordHash');

    if (!user || !user.active) {
      return res.status(401).json({ error: 'Your account is unavailable.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: error.message || 'Invalid token.' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'You do not have access to this action.' });
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};
