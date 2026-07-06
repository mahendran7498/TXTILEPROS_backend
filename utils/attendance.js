const User = require('../models/User');
const WorkReport = require('../models/WorkReport');
const LeaveRequest = require('../models/LeaveRequest');
const { addDays, formatMonthKey, getDateKey, startOfDay } = require('./date');
const { getHolidayInfo, getGovernmentHolidaysForMonth } = require('./holidays');
const {
  MAX_PAID_LEAVE_DAYS_PER_YEAR,
  buildPaidLeaveUsageByUser,
  getRemainingPaidLeavesForYear,
} = require('./leavePolicy');

function getStatusForDate(date, submittedDates, leaveDates) {
  const dateKey = getDateKey(date);
  const holidayInfo = getHolidayInfo(date);
  if (holidayInfo && submittedDates?.has(dateKey)) {
    return {
      status: 'comp-off',
      holidayName: holidayInfo.name,
      holidayType: holidayInfo.type,
    };
  }
  if (holidayInfo) {
    return {
      status: 'holiday',
      holidayName: holidayInfo.name,
      holidayType: holidayInfo.type,
    };
  }
  if (leaveDates?.has(dateKey)) {
    return {
      status: 'leave',
      holidayName: '',
      holidayType: '',
    };
  }
  if (submittedDates?.has(dateKey)) {
    return {
      status: 'present',
      holidayName: '',
      holidayType: '',
    };
  }
  return {
    status: 'absent',
    holidayName: '',
    holidayType: '',
  };
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

function buildEmployeeFilter(options = {}) {
  const filter = { role: 'employee', active: true };
  if (options.department) {
    filter.department = String(options.department).trim().toLowerCase() === 'sales'
      ? { $regex: 'sales', $options: 'i' }
      : { $not: /sales/i };
  }
  return filter;
}

async function getAttendanceSnapshot(rangeStart, rangeEnd, options = {}) {
  const [employees, reports, leaves] = await Promise.all([
    User.find(buildEmployeeFilter(options)).select('name email employeeCode department'),
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

async function buildWeeklyAttendance(referenceDate, options = {}) {
  const weekStart = startOfDay(referenceDate);
  const weekEnd = addDays(weekStart, 7);
  const weekDates = buildWeekDates(weekStart);
  const { employees, attendanceByUser, leavesByUser } = await getAttendanceSnapshot(weekStart, weekEnd, options);

  const daily = weekDates.map(({ dateKey, label, date }) => {
    const holidayInfo = getHolidayInfo(date);
    if (holidayInfo) {
      return {
        date: dateKey,
        label,
        present: 0,
        absent: 0,
        holiday: true,
        holidayName: holidayInfo.name,
        totalEmployees: employees.length,
      };
    }

    let present = 0;
    let leave = 0;

    for (const employee of employees) {
      const submittedDates = attendanceByUser.get(String(employee._id));
      const leaveDates = leavesByUser.get(String(employee._id));
      const dayStatus = getStatusForDate(date, submittedDates, leaveDates);
      if (dayStatus.status === 'present') present += 1;
      if (dayStatus.status === 'leave') leave += 1;
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
    const attendance = weekDates.map(({ dateKey, label, date }) => {
      const dayStatus = getStatusForDate(date, submittedDates, leaveDates);
      return {
        date: dateKey,
        label,
        status: dayStatus.status,
        holidayName: dayStatus.holidayName,
        holidayType: dayStatus.holidayType,
      };
    });
    const presentDays = attendance.filter((day) => day.status === 'present').length;
    const absentDays = attendance.filter((day) => day.status === 'absent').length;
    const leaveDays = attendance.filter((day) => day.status === 'leave').length;
    const holidayDays = attendance.filter((day) => day.status === 'holiday').length;
    const compOffDays = attendance.filter((day) => day.status === 'comp-off').length;

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
      compOffDays,
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

async function buildMonthlyAttendance(referenceDate, options = {}) {
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

  const yearStart = new Date(monthStart.getFullYear(), 0, 1);
  const yearEnd = new Date(monthStart.getFullYear() + 1, 0, 1);

  const [{ employees, attendanceByUser, leavesByUser }, approvedYearLeaves] = await Promise.all([
    getAttendanceSnapshot(monthStart, monthEnd, options),
    LeaveRequest.find({
      status: 'approved',
      $or: [
        { fromDate: { $gte: yearStart, $lt: yearEnd } },
        { toDate: { $gte: yearStart, $lt: yearEnd } },
        { fromDate: { $lt: yearStart }, toDate: { $gte: yearEnd } },
      ],
    }).select('user fromDate toDate status'),
  ]);
  const yearlyPaidLeaveUsage = buildPaidLeaveUsageByUser(approvedYearLeaves);

  const employeesAttendance = employees.map((employee) => {
    const employeeId = String(employee._id);
    const submittedDates = attendanceByUser.get(employeeId) || new Set();
    const leaveDates = leavesByUser.get(employeeId) || new Set();
    const attendance = monthDates.map(({ dateKey, label, date }) => {
      const dayStatus = getStatusForDate(date, submittedDates, leaveDates);
      return {
        date: dateKey,
        label,
        status: dayStatus.status,
        holidayName: dayStatus.holidayName,
        holidayType: dayStatus.holidayType,
      };
    });
    const presentDays = attendance.filter((day) => day.status === 'present').length;
    const absentDays = attendance.filter((day) => day.status === 'absent').length;
    const leaveDays = attendance.filter((day) => day.status === 'leave').length;
    const holidayDays = attendance.filter((day) => day.status === 'holiday').length;
    const compOffDays = attendance.filter((day) => day.status === 'comp-off').length;
    const paidLeaveDays = leaveDays;
    const usedPaidLeaves = yearlyPaidLeaveUsage.get(employeeId)?.[String(monthStart.getFullYear())] || 0;

    return {
      id: employeeId,
      name: employee.name,
      email: employee.email,
      employeeCode: employee.employeeCode,
      department: employee.department,
      presentDays,
      absentDays,
      leaveDays,
      paidLeaveDays,
      holidayDays,
      compOffDays,
      paidLeaveUsed: usedPaidLeaves,
      paidLeaveRemaining: getRemainingPaidLeavesForYear(usedPaidLeaves),
      attendance,
    };
  });

  return {
    month: formatMonthKey(monthStart),
    monthLabel: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    rangeLabel: 'month',
    totalEmployees: employees.length,
    totalDays,
    paidLeaveLimit: MAX_PAID_LEAVE_DAYS_PER_YEAR,
    holidays: getGovernmentHolidaysForMonth(monthStart),
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
  const holidayDays = Array.from({ length: totalTrackedDays }, (_, index) => addDays(rangeStart, index))
    .filter((date) => Boolean(getHolidayInfo(date))).length;
  const compOffDays = submittedDates.filter((dateKey) => Boolean(getHolidayInfo(dateKey))).length;
  const presentDays = submittedDates.length;
  const workingDays = Math.max(totalTrackedDays - holidayDays, 0);
  const todayHoliday = Boolean(getHolidayInfo(new Date()));
  const todayDateKey = getDateKey(new Date());
  const todayHasReport = submittedDates.includes(todayDateKey);

  return {
    submittedDates,
    presentDays,
    absentDays: Math.max(workingDays - presentDays, 0),
    holidayDays,
    compOffDays,
    totalTrackedDays,
    todayStatus: todayHoliday
      ? (todayHasReport ? 'comp-off' : 'holiday')
      : (todayHasReport ? 'present' : 'absent'),
  };
}

module.exports = {
  buildWeeklyAttendance,
  buildMonthlyAttendance,
  buildEmployeeAttendanceSummary,
};
