const express = require('express');
const User = require('../models/User');
const { createToken, verifyPassword } = require('../utils/auth');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid login credentials.' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    res.json({
      token: createToken(user),
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        employeeCode: user.employeeCode,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({
    user: {
      id: String(req.user._id),
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      department: req.user.department,
      employeeCode: req.user.employeeCode,
      phone: req.user.phone,
      active: req.user.active,
    },
  });
});

module.exports = router;
