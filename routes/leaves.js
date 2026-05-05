const express = require('express');
const LeaveRequest = require('../models/LeaveRequest');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req, res, next) => {
  try {
    const leaveDate = req.body.leaveDate ? new Date(req.body.leaveDate) : null;
    const reason = String(req.body.reason || '').trim();

    if (!leaveDate || Number.isNaN(leaveDate.getTime())) {
      return res.status(400).json({ error: 'Please provide a valid leave date.' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Leave reason is required.' });
    }

    const leave = await LeaveRequest.create({
      user: req.user._id,
      leaveDate,
      reason,
    });

    const populated = await LeaveRequest.findById(leave._id).populate('reviewedBy', 'name');
    res.status(201).json({ leave: populated });
  } catch (error) {
    next(error);
  }
});

router.get('/mine', async (req, res, next) => {
  try {
    const leaves = await LeaveRequest.find({ user: req.user._id })
      .sort({ leaveDate: -1, createdAt: -1 })
      .populate('reviewedBy', 'name');

    res.json({ leaves });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
