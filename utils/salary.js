const SalaryRecord = require('../models/SalaryRecord');
const WorkReport = require('../models/WorkReport');
const { buildMonthlyAttendance } = require('./attendance');

function getSalaryMonth(input) {
  const value = String(input || '').trim();
  const fallback = new Date();
  const match = value.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return { year: fallback.getFullYear(), month: fallback.getMonth() + 1 };
  }

  return { year: Number(match[1]), month: Number(match[2]) };
}

function getMonthRange(year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

function recalculateNetSalary(record) {
  const earnings =
    Number(record.basicSalary || 0) +
    Number(record.allowances || 0) +
    Number(record.incentives || 0) +
    Number(record.overtimeAmount || 0);
  const deductions = Number(record.leaveDeduction || 0) + Number(record.otherDeductions || 0);
  record.netSalary = Math.max(Math.round((earnings - deductions) * 100) / 100, 0);
  return record.netSalary;
}

async function ensureSalaryRecordsForMonth({ year, month }) {
  const { start, end } = getMonthRange(year, month);
  const attendance = await buildMonthlyAttendance(start);
  const employeeIds = attendance.employees.map((employee) => employee.id);
  const reports = await WorkReport.find({
    user: { $in: employeeIds },
    workDate: { $gte: start, $lt: end },
  }).select('user hoursWorked');
  const hoursByUser = reports.reduce((acc, report) => {
    const key = String(report.user);
    acc.set(key, (acc.get(key) || 0) + Number(report.hoursWorked || 0));
    return acc;
  }, new Map());

  const defaultBasicSalary = Number(process.env.DEFAULT_BASIC_SALARY || 0);

  await Promise.all(attendance.employees.map(async (employee) => {
    const totalHours = hoursByUser.get(employee.id) || 0;
    const overtimeHours = Math.max(totalHours - (Number(employee.presentDays || 0) * 8), 0);
    const existing = await SalaryRecord.findOne({ employee: employee.id, month, year });

    if (existing) {
      existing.presentDays = employee.presentDays || 0;
      existing.absentDays = employee.absentDays || 0;
      existing.leaveDays = employee.leaveDays || 0;
      existing.overtimeHours = overtimeHours;
      recalculateNetSalary(existing);
      await existing.save();
      return;
    }

    const record = new SalaryRecord({
      employee: employee.id,
      month,
      year,
      presentDays: employee.presentDays || 0,
      absentDays: employee.absentDays || 0,
      leaveDays: employee.leaveDays || 0,
      overtimeHours,
      basicSalary: defaultBasicSalary,
      paymentStatus: 'pending',
    });
    recalculateNetSalary(record);
    await record.save();
  }));

  return attendance;
}

module.exports = {
  ensureSalaryRecordsForMonth,
  getMonthRange,
  getSalaryMonth,
  recalculateNetSalary,
};
