const express = require('express');
const LeaveRequest = require('../models/LeaveRequest');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { parseDateInput, startOfDay } = require('../utils/date');
const { sendLeaveRequestNotification } = require('../utils/email');
const {
  MAX_PAID_LEAVE_DAYS_PER_YEAR,
  buildPaidLeaveUsageByUser,
  getPaidLeaveBreakdown,
  getRemainingPaidLeavesForYear,
} = require('../utils/leavePolicy');

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
    const today = startOfDay();

    if (!fromDate || !toDate) {
      return res.status(400).json({ error: 'Please provide valid from and to dates.' });
    }

    if (fromDate > toDate) {
      return res.status(400).json({ error: 'From date cannot be later than to date.' });
    }

    if (fromDate < today) {
      return res.status(400).json({ error: 'Leave request cannot be submitted after the leave date has passed.' });
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
    const requestedPaidLeave = getPaidLeaveBreakdown(fromDate, toDate);

    const leaveResponse = {
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
      requestedPaidLeaveDays: requestedPaidLeave.totalDays,
      paidLeaveDays: leave.paidLeaveDays || 0,
      adminComment: leave.adminComment,
      reviewedAt: leave.reviewedAt,
      reviewedBy: null,
      createdAt: leave.createdAt,
      updatedAt: leave.updatedAt,
    };

    User.find({ role: 'admin', active: true })
      .select('email')
      .lean()
      .then((admins) => sendLeaveRequestNotification({
        leave: leaveResponse,
        adminRecipients: admins.map((admin) => admin.email),
      }))
      .catch((mailError) => {
        console.error('Leave request notification failed:', mailError.message);
      });

    res.status(201).json({
      leave: leaveResponse,
    });
  } catch (error) {
    console.error('Leave request create failed:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      payload: {
        userId: req.user?._id ? String(req.user._id) : null,
        fromDate: req.body?.fromDate || null,
        toDate: req.body?.toDate || null,
        leaveDate: req.body?.leaveDate || null,
        reasonLength: String(req.body?.reason || '').trim().length,
      },
    });

    return res.status(error.status || 500).json({
      error: error.message || 'Unable to submit leave request.',
      details: error.name || 'LeaveRequestError',
    });
  }
});

router.get('/mine', async (req, res, next) => {
  try {
    const [leaves, approvedLeaves] = await Promise.all([
      LeaveRequest.find({ user: req.user._id })
        .sort({ fromDate: -1, createdAt: -1 })
        .populate('reviewedBy', 'name'),
      LeaveRequest.find({ user: req.user._id, status: 'approved' }).select('user fromDate toDate status'),
    ]);
    const paidLeaveUsageByUser = buildPaidLeaveUsageByUser(approvedLeaves);
    const usageByYear = paidLeaveUsageByUser.get(String(req.user._id)) || {};
    const serializedLeaves = leaves.map((leave) => {
      const leaveDoc = leave.toObject();
      const requestedPaidLeave = getPaidLeaveBreakdown(leaveDoc.fromDate, leaveDoc.toDate);
      const leaveYear = leaveDoc.fromDate
        ? String(new Date(leaveDoc.fromDate).getFullYear())
        : String(new Date().getFullYear());
      const paidLeaveDays = leaveDoc.status === 'approved'
        ? (leaveDoc.paidLeaveDays || requestedPaidLeave.totalDays)
        : (leaveDoc.paidLeaveDays || 0);

      return {
        ...leaveDoc,
        requestedPaidLeaveDays: requestedPaidLeave.totalDays,
        paidLeaveDays,
        paidLeaveLimit: MAX_PAID_LEAVE_DAYS_PER_YEAR,
        remainingPaidLeaves: getRemainingPaidLeavesForYear(usageByYear[leaveYear] || 0),
      };
    });

    res.json({ leaves: serializedLeaves });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
