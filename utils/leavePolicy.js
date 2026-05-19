const { addDays, startOfDay } = require('./date');
const { isHoliday } = require('./holidays');

const MAX_PAID_LEAVE_DAYS_PER_YEAR = 15;

function getPaidLeaveBreakdown(fromDate, toDate) {
  const start = startOfDay(fromDate);
  const end = startOfDay(toDate);
  const byYear = {};
  let totalDays = 0;

  for (let current = new Date(start); current <= end; current = addDays(current, 1)) {
    if (isHoliday(current)) {
      continue;
    }

    const year = String(current.getFullYear());
    byYear[year] = (byYear[year] || 0) + 1;
    totalDays += 1;
  }

  return {
    totalDays,
    byYear,
  };
}

function buildPaidLeaveUsageByUser(leaves = []) {
  const usageByUser = new Map();

  for (const leave of leaves) {
    if (!leave?.user || leave.status !== 'approved' || !leave.fromDate || !leave.toDate) {
      continue;
    }

    const userId = String(leave.user);
    const currentUsage = usageByUser.get(userId) || {};
    const breakdown = getPaidLeaveBreakdown(leave.fromDate, leave.toDate);

    for (const [year, days] of Object.entries(breakdown.byYear)) {
      currentUsage[year] = (currentUsage[year] || 0) + days;
    }

    usageByUser.set(userId, currentUsage);
  }

  return usageByUser;
}

function getRemainingPaidLeavesForYear(usedDays = 0) {
  return Math.max(MAX_PAID_LEAVE_DAYS_PER_YEAR - usedDays, 0);
}

module.exports = {
  MAX_PAID_LEAVE_DAYS_PER_YEAR,
  buildPaidLeaveUsageByUser,
  getPaidLeaveBreakdown,
  getRemainingPaidLeavesForYear,
};
