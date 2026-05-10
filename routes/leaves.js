const express = require('express');
const LeaveRequest = require('../models/LeaveRequest');
const { requireAuth } = require('../middleware/auth');
const { parseDateInput } = require('../utils/date');

const router = express.Router();

router.use(requireAuth);

function normalizeLeaveDate(value) {
  if (!value) return null;

  const parsed = parseDateInput(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

router.post('/', async (req, res, next) => {
  try {
    const legacyLeaveDate = normalizeLeaveDate(req.body.leaveDate);
    const fromDate = normalizeLeaveDate(req.body.fromDate) || legacyLeaveDate;
    const toDate = normalizeLeaveDate(req.body.toDate) || legacyLeaveDate;
    const reason = String(req.body.reason || '').trim();

    if (!fromDate || !toDate) {
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

    res.status(201).json({
      leave: {
        _id: String(leave._id),
        user: {
          _id: String(req.user._id),
          name: req.user.name,
          email: req.user.email,
          employeeCode: req.user.employeeCode,
          department: req.user.department,
        },
        fromDate: leave.fromDate,
        toDate: leave.toDate,
        leaveDate: leave.leaveDate,
        reason: leave.reason,
        status: leave.status,
        adminComment: leave.adminComment,
        reviewedAt: leave.reviewedAt,
        reviewedBy: null,
        createdAt: leave.createdAt,
        updatedAt: leave.updatedAt,
      },
    });
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
