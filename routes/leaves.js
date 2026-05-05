const express = require('express');
const LeaveRequest = require('../models/LeaveRequest');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req, res, next) => {
  try {
    const legacyLeaveDate = req.body.leaveDate ? new Date(req.body.leaveDate) : null;
    const fromDate = req.body.fromDate ? new Date(req.body.fromDate) : legacyLeaveDate;
    const toDate = req.body.toDate ? new Date(req.body.toDate) : legacyLeaveDate;
    const reason = String(req.body.reason || '').trim();

    if (!fromDate || Number.isNaN(fromDate.getTime()) || !toDate || Number.isNaN(toDate.getTime())) {
      return res.status(400).json({ error: 'Please provide valid from and to dates.' });
    }

    if (fromDate > toDate) {
      return res.status(400).json({ error: 'From date cannot be later than to date.' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Leave reason is required.' });
    }

    const leave = await LeaveRequest.create({
      user: req.user._id,
      fromDate,
      toDate,
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
      .sort({ fromDate: -1, createdAt: -1 })
      .populate('reviewedBy', 'name');

    res.json({ leaves });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
