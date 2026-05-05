const express = require('express');
const User = require('../models/User');
const WorkReport = require('../models/WorkReport');
const LeaveRequest = require('../models/LeaveRequest');
const { requireAuth, requireRole } = require('../middleware/auth');
const { hashPassword } = require('../utils/auth');
const { startOfWeek, endOfWeek } = require('../utils/date');
const { buildMonthlyAttendance, buildWeeklyAttendance } = require('../utils/attendance');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

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
      role: req.body.role === 'admin' ? 'admin' : 'employee',
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
    if (req.body.role === 'admin' || req.body.role === 'employee') user.role = req.body.role;
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
    const referenceDate = req.query.weekStart ? new Date(req.query.weekStart) : new Date();
    const weekStart = startOfWeek(referenceDate);
    const weekEnd = endOfWeek(referenceDate);
    const filter = {
      workDate: { $gte: weekStart, $lt: weekEnd },
    };

    if (req.query.employeeId) filter.user = req.query.employeeId;
    if (req.query.status) filter.status = req.query.status;

    const reports = await WorkReport.find(filter)
      .sort({ workDate: -1, createdAt: -1 })
      .populate('user', 'name email employeeCode department');

    res.json({ reports });
  } catch (error) {
    next(error);
  }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const referenceDate = req.query.weekStart ? new Date(req.query.weekStart) : new Date();
    const weekStart = startOfWeek(referenceDate);
    const weekEnd = endOfWeek(referenceDate);

    const [userCount, activeEmployees, reports, todaySubmissions, attendance, pendingLeaves, approvedLeaves, rejectedLeaves] = await Promise.all([
      User.countDocuments({ role: 'employee' }),
      User.countDocuments({ role: 'employee', active: true }),
      WorkReport.find({
        workDate: { $gte: weekStart, $lt: weekEnd },
      }).populate('user', 'name email employeeCode department'),
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
        acc.photoCount += report.photos.length;
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
        weekStart: weekStart.toISOString().slice(0, 10),
        totalEmployees: userCount,
        activeEmployees,
        todaySubmissions,
        todayPresent: attendance.today?.present || 0,
        todayAbsent: attendance.today?.absent || 0,
        pendingLeaves,
        approvedLeaves,
        rejectedLeaves,
        attendanceRate: activeEmployees
          ? Math.round((attendance.daily.reduce((sum, day) => sum + day.present, 0) / (activeEmployees * attendance.daily.length)) * 100)
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
    const referenceDate = monthValue ? new Date(`${monthValue}-01T00:00:00`) : new Date();
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

    const leaves = await LeaveRequest.find(filter)
      .sort({ status: 1, fromDate: -1, createdAt: -1 })
      .populate('user', 'name email employeeCode department')
      .populate('reviewedBy', 'name');

    res.json({ leaves });
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

    leave.status = status;
    leave.adminComment = String(req.body.adminComment || '').trim();
    leave.reviewedAt = new Date();
    leave.reviewedBy = req.user._id;
    await leave.save();

    const populated = await LeaveRequest.findById(leave._id)
      .populate('user', 'name email employeeCode department')
      .populate('reviewedBy', 'name');

    res.json({ leave: populated });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
