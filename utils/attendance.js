const User = require('../models/User');
const WorkReport = require('../models/WorkReport');
const { addDays, getDateKey, startOfDay } = require('./date');

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
  const [employees, reports] = await Promise.all([
    User.find({ role: 'employee', active: true }).select('name email employeeCode department'),
    WorkReport.find({
      workDate: { $gte: rangeStart, $lt: rangeEnd },
    }).select('user workDate'),
  ]);

  const attendanceByUser = new Map();

  for (const report of reports) {
    const userId = String(report.user);
    const dateKey = getDateKey(report.workDate);

    if (!attendanceByUser.has(userId)) {
      attendanceByUser.set(userId, new Set());
    }

    attendanceByUser.get(userId).add(dateKey);
  }

  return { employees, attendanceByUser };
}

async function buildWeeklyAttendance(referenceDate) {
  const weekStart = startOfDay(referenceDate);
  const weekEnd = addDays(weekStart, 7);
  const weekDates = buildWeekDates(weekStart);
  const { employees, attendanceByUser } = await getAttendanceSnapshot(weekStart, weekEnd);

  const daily = weekDates.map(({ dateKey, label }) => {
    let present = 0;

    for (const employee of employees) {
      const submittedDates = attendanceByUser.get(String(employee._id));
      if (submittedDates?.has(dateKey)) present += 1;
    }

    return {
      date: dateKey,
      label,
      present,
      absent: Math.max(employees.length - present, 0),
      totalEmployees: employees.length,
    };
  });

  const employeesAttendance = employees.map((employee) => {
    const employeeId = String(employee._id);
    const submittedDates = attendanceByUser.get(employeeId) || new Set();
    const attendance = weekDates.map(({ dateKey, label }) => ({
      date: dateKey,
      label,
      status: submittedDates.has(dateKey) ? 'present' : 'absent',
    }));
    const presentDays = attendance.filter((day) => day.status === 'present').length;

    return {
      id: employeeId,
      name: employee.name,
      email: employee.email,
      employeeCode: employee.employeeCode,
      department: employee.department,
      presentDays,
      absentDays: attendance.length - presentDays,
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

  const { employees, attendanceByUser } = await getAttendanceSnapshot(monthStart, monthEnd);

  const employeesAttendance = employees.map((employee) => {
    const employeeId = String(employee._id);
    const submittedDates = attendanceByUser.get(employeeId) || new Set();
    const attendance = monthDates.map(({ dateKey, label }) => ({
      date: dateKey,
      label,
      status: submittedDates.has(dateKey) ? 'present' : 'absent',
    }));
    const presentDays = attendance.filter((day) => day.status === 'present').length;

    return {
      id: employeeId,
      name: employee.name,
      email: employee.email,
      employeeCode: employee.employeeCode,
      department: employee.department,
      presentDays,
      absentDays: attendance.length - presentDays,
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
