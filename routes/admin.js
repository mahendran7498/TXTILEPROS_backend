const express = require('express');
const User = require('../models/User');
const WorkReport = require('../models/WorkReport');
const LeaveRequest = require('../models/LeaveRequest');
const { requireAnyRole, requireAuth } = require('../middleware/auth');
const { isOwner, isSalesDepartment, requireServiceManagementAccess } = require('../middleware/access');
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
router.use(requireAuth);

function requireManagementAccess(req, res, next) {
  if (isOwner(req.user) || req.user?.role === 'manager') {
    return next();
  }
  return res.status(403).json({ error: 'Access Denied' });
}

function getDepartmentName(user) {
  return isSalesDepartment(user) ? 'Sales' : 'Service';
}

function getDepartmentKey(user) {
  return getDepartmentName(user).toLowerCase();
}

function buildModuleDepartmentQuery(user) {
  return isSalesDepartment(user)
    ? { $regex: 'sales', $options: 'i' }
    : { $not: /sales/i };
}

function buildAccessibleUserQuery(user) {
  if (isOwner(user)) {
    return {};
  }

  return {
    role: { $ne: 'admin' },
    department: buildModuleDepartmentQuery(user),
  };
}

async function getAccessibleUserIds(user) {
  const accessibleUsers = await User.find(buildAccessibleUserQuery(user)).select('_id');
  return accessibleUsers.map((candidate) => candidate._id);
}

function normalizeRole(role) {
  return role === 'manager' ? 'manager' : 'employee';
}

function canManageTargetUser(actor, targetUser) {
  if (isOwner(actor)) {
    return true;
  }

  if (!targetUser || targetUser.role === 'admin') {
    return false;
  }

  const targetIsSales = /sales/i.test(String(targetUser.department || '').trim());
  return targetIsSales === isSalesDepartment(actor);
}

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

router.get('/users', requireManagementAccess, async (req, res, next) => {
  try {
    const users = await User.find(buildAccessibleUserQuery(req.user)).select('-passwordHash').sort({ role: 1, name: 1 });
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

router.post('/users', requireManagementAccess, async (req, res, next) => {
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

    const department = isOwner(req.user)
      ? String(req.body.department || 'Service').trim() || 'Service'
      : getDepartmentName(req.user);

    const user = await User.create({
      name: String(req.body.name).trim(),
      email,
      passwordHash: hashPassword(password),
      role: ['owner', 'admin'].includes(req.body.role) ? req.body.role : 'employee',
      role: normalizeRole(req.body.role),
      employeeCode: String(req.body.employeeCode || '').trim(),
      department,
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

router.patch('/users/:id', requireManagementAccess, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (!canManageTargetUser(req.user, user)) {
      return res.status(403).json({ error: 'You do not have access to this user.' });
    }

    if (typeof req.body.name === 'string') user.name = req.body.name.trim();
    if (typeof req.body.department === 'string' && isOwner(req.user)) user.department = req.body.department.trim();
    if (typeof req.body.employeeCode === 'string') user.employeeCode = req.body.employeeCode.trim();
    if (typeof req.body.phone === 'string') user.phone = req.body.phone.trim();
    if (typeof req.body.active === 'boolean') user.active = req.body.active;
    if (['owner', 'admin', 'employee'].includes(req.body.role)) user.role = req.body.role;
    if (req.body.role === 'manager' || req.body.role === 'employee') {
      user.role = req.body.role;
    }
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

router.get('/reports', requireServiceManagementAccess, async (req, res, next) => {
  try {
    const referenceDate = req.query.weekStart ? parseDateInput(req.query.weekStart) : new Date();
    const weekStart = startOfWeek(referenceDate);
    const weekEnd = endOfWeek(referenceDate);
    const accessibleUserIds = await getAccessibleUserIds(req.user);
    const filter = {
      workDate: { $gte: weekStart, $lt: weekEnd },
      user: req.query.employeeId || { $in: accessibleUserIds },
    };

    if (!isOwner(req.user) && req.query.employeeId) {
      const requestedUser = await User.findById(req.query.employeeId).select('department role');
      if (!canManageTargetUser(req.user, requestedUser)) {
        return res.status(403).json({ error: 'You do not have access to this employee.' });
      }
    }

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

router.get('/reports/:id', requireServiceManagementAccess, async (req, res, next) => {
  try {
    const report = await WorkReport.findById(req.params.id)
      .populate('user', 'name email employeeCode department');

    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    if (!isOwner(req.user) && /sales/i.test(String(report.user?.department || '').trim()) !== isSalesDepartment(req.user)) {
      return res.status(403).json({ error: 'You do not have access to this report.' });
    }

    res.json({ report });
  } catch (error) {
    next(error);
  }
});

router.get('/dashboard', requireServiceManagementAccess, async (req, res, next) => {
  try {
    const referenceDate = req.query.weekStart ? parseDateInput(req.query.weekStart) : new Date();
    const weekStart = startOfWeek(referenceDate);
    const weekEnd = endOfWeek(referenceDate);
    const employeeFilter = {
      ...buildAccessibleUserQuery(req.user),
      role: 'employee',
    };
    const accessibleUserIds = await getAccessibleUserIds(req.user);
    const reportFilter = {
      workDate: { $gte: weekStart, $lt: weekEnd },
      user: { $in: accessibleUserIds },
    };
    const todayFilter = {
      createdAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lt: new Date(new Date().setHours(23, 59, 59, 999)),
      },
      user: { $in: accessibleUserIds },
    };
    const leaveFilter = { user: { $in: accessibleUserIds } };

    const [userCount, activeEmployees, reports, todaySubmissions, attendance, pendingLeaves, approvedLeaves, rejectedLeaves] = await Promise.all([
      User.countDocuments(employeeFilter),
      User.countDocuments({ ...employeeFilter, active: true }),
      WorkReport.find(reportFilter).select('hoursWorked status sheetsSync photos.kind'),
      WorkReport.countDocuments(todayFilter),
      buildWeeklyAttendance(weekStart, { department: isOwner(req.user) ? '' : getDepartmentName(req.user) }),
      LeaveRequest.countDocuments({ ...leaveFilter, status: 'pending' }),
      LeaveRequest.countDocuments({ ...leaveFilter, status: 'approved' }),
      LeaveRequest.countDocuments({ ...leaveFilter, status: 'rejected' }),
    ]);

    const workingDays = attendance.daily.filter((day) => !day.holiday).length;
    const attendanceRateBase = activeEmployees * workingDays;
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
        attendanceRate: attendanceRateBase
          ? Math.round((attendance.daily.reduce((sum, day) => sum + day.present, 0) / attendanceRateBase) * 100)
          : 0,
        ...metrics,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/attendance', requireServiceManagementAccess, async (req, res, next) => {
  try {
    const monthValue = String(req.query.month || '').trim();
    const referenceDate = monthValue ? parseDateInput(monthValue) : new Date();
    const attendance = await buildMonthlyAttendance(referenceDate, { department: isOwner(req.user) ? '' : getDepartmentName(req.user) });
    res.json({ attendance });
  } catch (error) {
    next(error);
  }
});

router.get('/leaves', requireServiceManagementAccess, async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    if (!isOwner(req.user)) {
      const accessibleUserIds = await getAccessibleUserIds(req.user);
      filter.user = { $in: accessibleUserIds };
    }

    const [leaves, approvedLeaves] = await Promise.all([
      LeaveRequest.find(filter)
        .sort({ status: 1, fromDate: -1, createdAt: -1 })
        .populate('user', 'name email employeeCode department')
        .populate('reviewedBy', 'name'),
      LeaveRequest.find({ ...filter, status: 'approved' }).select('user fromDate toDate status'),
    ]);
    const paidLeaveUsageByUser = buildPaidLeaveUsageByUser(approvedLeaves);

    res.json({ leaves: leaves.map((leave) => serializeLeave(leave, paidLeaveUsageByUser)) });
  } catch (error) {
    next(error);
  }
});

router.patch('/leaves/:id', requireServiceManagementAccess, async (req, res, next) => {
  try {
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ error: 'Leave request not found.' });
    }

    if (!isOwner(req.user)) {
      const leaveUser = await User.findById(leave.user).select('department role');
      if (!canManageTargetUser(req.user, leaveUser)) {
        return res.status(403).json({ error: 'You do not have access to this leave request.' });
      }
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
