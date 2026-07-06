const express = require('express');
const User = require('../models/User');
const WorkReport = require('../models/WorkReport');
const LeaveRequest = require('../models/LeaveRequest');
const { requireAnyRole, requireAuth } = require('../middleware/auth');
const { hashPassword } = require('../utils/auth');
const { formatDateKey, parseDateInput, startOfWeek, endOfWeek } = require('../utils/date');
const { buildMonthlyAttendance, buildWeeklyAttendance } = require('../utils/attendance');
const { sendLeaveStatusNotification } = require('../utils/email');
const {
  MAX_PAID_LEAVE_DAYS_PER_YEAR,
  buildPaidLeaveUsageByUser,
  getPaidLeaveBreakdown,
  getRemainingPaidLeavesForYear,
} = require('../utils/leavePolicy');

const router = express.Router();

router.use(requireAuth, requireAnyRole(['owner', 'admin']));

function serializeLeave(leave, paidLeaveUsageByUser = new Map()) {
  const leaveDoc = leave?.toObject ? leave.toObject() : leave;
  const requestedPaidLeave = getPaidLeaveBreakdown(leaveDoc.fromDate, leaveDoc.toDate);
  const userId = String(leaveDoc.user?._id || leaveDoc.user || '');
  const year = leaveDoc.fromDate ? String(new Date(leaveDoc.fromDate).getFullYear()) : String(new Date().getFullYear());
  const usedDays = paidLeaveUsageByUser.get(userId)?.[year] || 0;
  const paidLeaveDays = leaveDoc.status === 'approved'
    ? (leaveDoc.paidLeaveDays || requestedPaidLeave.totalDays)
    : (leaveDoc.paidLeaveDays || 0);

  return {
    ...leaveDoc,
    requestedPaidLeaveDays: requestedPaidLeave.totalDays,
    paidLeaveDays,
    paidLeaveLimit: MAX_PAID_LEAVE_DAYS_PER_YEAR,
    remainingPaidLeaves: getRemainingPaidLeavesForYear(usedDays),
  };
}

router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ role: 1, name: 1 });
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password || !req.body.name) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'A user with that email already exists.' });
    }

    const user = await User.create({
      name: String(req.body.name).trim(),
      email,
      passwordHash: hashPassword(password),
      role: ['owner', 'admin'].includes(req.body.role) ? req.body.role : 'employee',
      employeeCode: String(req.body.employeeCode || '').trim(),
      department: String(req.body.department || 'Service').trim(),
      phone: String(req.body.phone || '').trim(),
      active: req.body.active !== false,
    });

    res.status(201).json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        employeeCode: user.employeeCode,
        phone: user.phone,
        active: user.active,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (typeof req.body.name === 'string') user.name = req.body.name.trim();
    if (typeof req.body.department === 'string') user.department = req.body.department.trim();
    if (typeof req.body.employeeCode === 'string') user.employeeCode = req.body.employeeCode.trim();
    if (typeof req.body.phone === 'string') user.phone = req.body.phone.trim();
    if (typeof req.body.active === 'boolean') user.active = req.body.active;
    if (['owner', 'admin', 'employee'].includes(req.body.role)) user.role = req.body.role;
    if (req.body.password) user.passwordHash = hashPassword(String(req.body.password));

    await user.save();

    res.json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        employeeCode: user.employeeCode,
        phone: user.phone,
        active: user.active,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/reports', async (req, res, next) => {
  try {
    const referenceDate = req.query.weekStart ? parseDateInput(req.query.weekStart) : new Date();
    const weekStart = startOfWeek(referenceDate);
    const weekEnd = endOfWeek(referenceDate);
    const filter = {
      workDate: { $gte: weekStart, $lt: weekEnd },
    };

    if (req.query.employeeId) filter.user = req.query.employeeId;
    if (req.query.status) filter.status = req.query.status;

    const reports = await WorkReport.find(filter)
      .select('user workDate siteName machineName clientName shift hoursWorked status workSummary problemsObserved materialsUsed createdAt')
      .sort({ workDate: -1, createdAt: -1 })
      .populate('user', 'name email employeeCode department');

    res.json({ reports });
  } catch (error) {
    next(error);
  }
});

router.get('/reports/:id', async (req, res, next) => {
  try {
    const report = await WorkReport.findById(req.params.id)
      .populate('user', 'name email employeeCode department');

    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    res.json({ report });
  } catch (error) {
    next(error);
  }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const referenceDate = req.query.weekStart ? parseDateInput(req.query.weekStart) : new Date();
    const weekStart = startOfWeek(referenceDate);
    const weekEnd = endOfWeek(referenceDate);

    const [userCount, activeEmployees, reports, todaySubmissions, attendance, pendingLeaves, approvedLeaves, rejectedLeaves] = await Promise.all([
      User.countDocuments({ role: 'employee' }),
      User.countDocuments({ role: 'employee', active: true }),
      WorkReport.find({
        workDate: { $gte: weekStart, $lt: weekEnd },
      }).select('hoursWorked status sheetsSync photos.kind'),
      WorkReport.countDocuments({
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      }),
      buildWeeklyAttendance(weekStart),
      LeaveRequest.countDocuments({ status: 'pending' }),
      LeaveRequest.countDocuments({ status: 'approved' }),
      LeaveRequest.countDocuments({ status: 'rejected' }),
    ]);

    const metrics = reports.reduce(
      (acc, report) => {
        acc.totalReports += 1;
        acc.totalHours += report.hoursWorked || 0;
        acc.photoCount += Array.isArray(report.photos) ? report.photos.length : 0;
        if (report.status === 'blocked' || report.status === 'needs-support') acc.attentionNeeded += 1;
        if (report.sheetsSync?.status === 'failed') acc.syncFailures += 1;
        return acc;
      },
      {
        totalReports: 0,
        totalHours: 0,
        photoCount: 0,
        attentionNeeded: 0,
        syncFailures: 0,
      }
    );

    res.json({
      dashboard: {
        weekStart: formatDateKey(weekStart),
        totalEmployees: userCount,
        activeEmployees,
        todaySubmissions,
        todayPresent: attendance.today?.present || 0,
        todayAbsent: attendance.today?.absent || 0,
        pendingLeaves,
        approvedLeaves,
        rejectedLeaves,
        attendanceRate: activeEmployees
          ? Math.round((attendance.daily.reduce((sum, day) => sum + day.present, 0) / (activeEmployees * attendance.daily.filter(day => !day.holiday).length)) * 100)
          : 0,
        ...metrics,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/attendance', async (req, res, next) => {
  try {
    const monthValue = String(req.query.month || '').trim();
    const referenceDate = monthValue ? parseDateInput(monthValue) : new Date();
    const attendance = await buildMonthlyAttendance(referenceDate);
    res.json({ attendance });
  } catch (error) {
    next(error);
  }
});

router.get('/leaves', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [leaves, approvedLeaves] = await Promise.all([
      LeaveRequest.find(filter)
        .sort({ status: 1, fromDate: -1, createdAt: -1 })
        .populate('user', 'name email employeeCode department')
        .populate('reviewedBy', 'name'),
      LeaveRequest.find({ status: 'approved' }).select('user fromDate toDate status'),
    ]);
    const paidLeaveUsageByUser = buildPaidLeaveUsageByUser(approvedLeaves);

    res.json({ leaves: leaves.map((leave) => serializeLeave(leave, paidLeaveUsageByUser)) });
  } catch (error) {
    next(error);
  }
});

router.patch('/leaves/:id', async (req, res, next) => {
  try {
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ error: 'Leave request not found.' });
    }

    const status = String(req.body.status || '').trim();
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Leave status must be approved or rejected.' });
    }

    const requestedPaidLeave = getPaidLeaveBreakdown(leave.fromDate, leave.toDate);

    if (status === 'approved') {
      const approvedLeaves = await LeaveRequest.find({
        user: leave.user,
        status: 'approved',
        _id: { $ne: leave._id },
      }).select('user fromDate toDate status');
      const paidLeaveUsageByUser = buildPaidLeaveUsageByUser(approvedLeaves);
      const currentUsage = paidLeaveUsageByUser.get(String(leave.user)) || {};

      for (const [year, requestedDays] of Object.entries(requestedPaidLeave.byYear)) {
        const usedDays = currentUsage[year] || 0;
        const remainingDays = getRemainingPaidLeavesForYear(usedDays);

        if (requestedDays > remainingDays) {
          return res.status(400).json({
            error: `Only ${remainingDays} paid leave day(s) remain for ${year}. This request needs ${requestedDays} working day(s).`,
          });
        }
      }
    }

    leave.status = status;
    leave.paidLeaveDays = status === 'approved' ? requestedPaidLeave.totalDays : 0;
    leave.adminComment = String(req.body.adminComment || '').trim();
    leave.reviewedAt = new Date();
    leave.reviewedBy = req.user._id;
    await leave.save();

    const [populated, approvedLeavesForUser] = await Promise.all([
      LeaveRequest.findById(leave._id)
        .populate('user', 'name email employeeCode department')
        .populate('reviewedBy', 'name'),
      LeaveRequest.find({
        user: leave.user,
        status: 'approved',
      }).select('user fromDate toDate status'),
    ]);
    const approvedUsageByUser = buildPaidLeaveUsageByUser(approvedLeavesForUser);
    const approvedUsage = approvedUsageByUser.get(String(leave.user)) || {};
    const affectedYears = Object.keys(requestedPaidLeave.byYear).length
      ? Object.keys(requestedPaidLeave.byYear)
      : [String(new Date(leave.fromDate).getFullYear())];
    const remainingPaidLeavesByYear = affectedYears.reduce((acc, year) => {
      acc[year] = getRemainingPaidLeavesForYear(approvedUsage[year] || 0);
      return acc;
    }, {});
    const serializedLeave = serializeLeave(populated, approvedUsageByUser);

    sendLeaveStatusNotification({
      leave: serializedLeave,
      employeeEmail: populated?.user?.email,
      remainingPaidLeavesByYear,
    }).catch((mailError) => {
      console.error('Leave status notification failed:', mailError.message);
    });

    res.json({ leave: serializedLeave });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
