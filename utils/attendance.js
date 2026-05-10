const User = require('../models/User');
const WorkReport = require('../models/WorkReport');
const LeaveRequest = require('../models/LeaveRequest');
const { addDays, getDateKey, startOfDay } = require('./date');

function isHoliday(date) {
  // Sunday is a holiday (0 = Sunday)
  return date.getDay() === 0;
}

function getStatusForDate(date, submittedDates, leaveDates) {
  const dateKey = getDateKey(date);
  if (isHoliday(date)) {
    return 'holiday';
  }
  if (leaveDates?.has(dateKey)) {
    return 'leave';
  }
  if (submittedDates?.has(dateKey)) {
    return 'present';
  }
  return 'absent';
}

function buildWeekDates(weekStart) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return {
      date,
      dateKey: getDateKey(date),
      label: date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }),
    };
  });
}

async function getAttendanceSnapshot(rangeStart, rangeEnd) {
  const [employees, reports, leaves] = await Promise.all([
    User.find({ role: 'employee', active: true }).select('name email employeeCode department'),
    WorkReport.find({
      workDate: { $gte: rangeStart, $lt: rangeEnd },
    }).select('user workDate'),
    LeaveRequest.find({
      status: 'approved',
      $or: [
        { fromDate: { $gte: rangeStart, $lt: rangeEnd } },
        { toDate: { $gte: rangeStart, $lt: rangeEnd } },
        { fromDate: { $lt: rangeStart }, toDate: { $gte: rangeEnd } },
      ],
    }).select('user fromDate toDate'),
  ]);

  const attendanceByUser = new Map();
  const leavesByUser = new Map();

  for (const report of reports) {
    const userId = String(report.user);
    const dateKey = getDateKey(report.workDate);

    if (!attendanceByUser.has(userId)) {
      attendanceByUser.set(userId, new Set());
    }

    attendanceByUser.get(userId).add(dateKey);
  }

  for (const leave of leaves) {
    const userId = String(leave.user);
    if (!leavesByUser.has(userId)) {
      leavesByUser.set(userId, new Set());
    }
    // Add all dates in the leave range
    let current = new Date(leave.fromDate);
    const end = new Date(leave.toDate);
    while (current <= end) {
      leavesByUser.get(userId).add(getDateKey(current));
      current = addDays(current, 1);
    }
  }

  return { employees, attendanceByUser, leavesByUser };
}

async function buildWeeklyAttendance(referenceDate) {
  const weekStart = startOfDay(referenceDate);
  const weekEnd = addDays(weekStart, 7);
  const weekDates = buildWeekDates(weekStart);
  const { employees, attendanceByUser, leavesByUser } = await getAttendanceSnapshot(weekStart, weekEnd);

  const daily = weekDates.map(({ dateKey, label, date }) => {
    if (isHoliday(date)) {
      return {
        date: dateKey,
        label,
        present: 0,
        absent: 0,
        holiday: true,
        totalEmployees: employees.length,
      };
    }

    let present = 0;
    let leave = 0;

    for (const employee of employees) {
      const submittedDates = attendanceByUser.get(String(employee._id));
      const leaveDates = leavesByUser.get(String(employee._id));
      const status = getStatusForDate(date, submittedDates, leaveDates);
      if (status === 'present') present += 1;
      if (status === 'leave') leave += 1;
    }

    return {
      date: dateKey,
      label,
      present,
      absent: Math.max(employees.length - present - leave, 0),
      totalEmployees: employees.length,
    };
  });

  const employeesAttendance = employees.map((employee) => {
    const employeeId = String(employee._id);
    const submittedDates = attendanceByUser.get(employeeId) || new Set();
    const leaveDates = leavesByUser.get(employeeId) || new Set();
    const attendance = weekDates.map(({ dateKey, label, date }) => ({
      date: dateKey,
      label,
      status: getStatusForDate(date, submittedDates, leaveDates),
    }));
    const presentDays = attendance.filter((day) => day.status === 'present').length;
    const absentDays = attendance.filter((day) => day.status === 'absent').length;
    const leaveDays = attendance.filter((day) => day.status === 'leave').length;
    const holidayDays = attendance.filter((day) => day.status === 'holiday').length;

    return {
      id: employeeId,
      name: employee.name,
      email: employee.email,
      employeeCode: employee.employeeCode,
      department: employee.department,
      presentDays,
      absentDays,
      leaveDays,
      holidayDays,
      attendance,
    };
  });

  const todayKey = getDateKey(new Date());

  return {
    weekStart: getDateKey(weekStart),
    weekEnd: getDateKey(addDays(weekStart, 6)),
    rangeLabel: 'week',
    totalEmployees: employees.length,
    today: daily.find((day) => day.date === todayKey) || null,
    daily,
    employees: employeesAttendance,
  };
}

async function buildMonthlyAttendance(referenceDate) {
  const monthStart = new Date(referenceDate);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const totalDays = Math.max(Math.round((monthEnd - monthStart) / (24 * 60 * 60 * 1000)), 0);
  const monthDates = Array.from({ length: totalDays }, (_, index) => {
    const date = addDays(monthStart, index);
    return {
      date,
      dateKey: getDateKey(date),
      label: date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
    };
  });

  const { employees, attendanceByUser, leavesByUser } = await getAttendanceSnapshot(monthStart, monthEnd);

  const employeesAttendance = employees.map((employee) => {
    const employeeId = String(employee._id);
    const submittedDates = attendanceByUser.get(employeeId) || new Set();
    const leaveDates = leavesByUser.get(employeeId) || new Set();
    const attendance = monthDates.map(({ dateKey, label, date }) => ({
      date: dateKey,
      label,
      status: getStatusForDate(date, submittedDates, leaveDates),
    }));
    const presentDays = attendance.filter((day) => day.status === 'present').length;
    const absentDays = attendance.filter((day) => day.status === 'absent').length;
    const leaveDays = attendance.filter((day) => day.status === 'leave').length;
    const holidayDays = attendance.filter((day) => day.status === 'holiday').length;

    return {
      id: employeeId,
      name: employee.name,
      email: employee.email,
      employeeCode: employee.employeeCode,
      department: employee.department,
      presentDays,
      absentDays,
      leaveDays,
      holidayDays,
      attendance,
    };
  });

  return {
    month: monthStart.toISOString().slice(0, 7),
    monthLabel: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    rangeLabel: 'month',
    totalEmployees: employees.length,
    totalDays,
    employees: employeesAttendance,
  };
}

async function buildEmployeeAttendanceSummary(userId, rangeStart, rangeEnd) {
  const reports = await WorkReport.find({
    user: userId,
    workDate: { $gte: rangeStart, $lt: rangeEnd },
  }).select('workDate');

  const submittedDates = Array.from(new Set(reports.map((report) => getDateKey(report.workDate)))).sort();
  const totalTrackedDays = Math.max(Math.round((rangeEnd - rangeStart) / (24 * 60 * 60 * 1000)), 0);

  return {
    submittedDates,
    presentDays: submittedDates.length,
    absentDays: Math.max(totalTrackedDays - submittedDates.length, 0),
    totalTrackedDays,
    todayStatus: submittedDates.includes(getDateKey(new Date())) ? 'present' : 'absent',
  };
}

module.exports = {
  buildWeeklyAttendance,
  buildMonthlyAttendance,
  buildEmployeeAttendanceSummary,
};
