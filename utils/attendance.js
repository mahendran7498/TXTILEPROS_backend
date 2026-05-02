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
    totalEmployees: employees.length,
    today: daily.find((day) => day.date === todayKey) || null,
    daily,
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
  buildEmployeeAttendanceSummary,
};
