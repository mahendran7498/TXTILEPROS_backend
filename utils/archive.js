const WorkReport = require('../models/WorkReport');
const { parseDateInput, formatMonthKey } = require('./date');
const {
  getOrCreateArchiveSpreadsheet,
  ensureArchiveSheet,
  getExistingReportIds,
  setSheetHeaders,
  appendRowsToSheet,
  uploadPhotosForReport,
} = require('./google');
const { sendArchiveNotification } = require('./email');

const ARCHIVE_HEADERS = [
  'Report ID',
  'Employee Name',
  'Employee Email',
  'Employee Code',
  'Department',
  'Work Date',
  'Week Key',
  'Site Name',
  'Client Name',
  'Machine Name',
  'Shift',
  'Hours Worked',
  'Work Summary',
  'Problems Observed',
  'Materials Used',
  'Status',
  'Photo Links',
  'Photo Count',
  'Created At',
  'Updated At',
];

function buildArchiveRow(report) {
  const photoLinks = Array.isArray(report.photoLinks) ? report.photoLinks.join(' | ') : '';

  return [
    String(report._id),
    report.user?.name || '',
    report.user?.email || '',
    report.user?.employeeCode || '',
    report.user?.department || '',
    report.workDate ? new Date(report.workDate).toISOString() : '',
    report.weekKey || '',
    report.siteName || '',
    report.clientName || '',
    report.machineName || '',
    report.shift || '',
    report.hoursWorked != null ? String(report.hoursWorked) : '',
    report.workSummary || '',
    report.problemsObserved || '',
    report.materialsUsed || '',
    report.status || '',
    photoLinks,
    Array.isArray(report.photos) ? String(report.photos.length) : '0',
    report.createdAt ? new Date(report.createdAt).toISOString() : '',
    report.updatedAt ? new Date(report.updatedAt).toISOString() : '',
  ];
}

function getArchiveMonthKey(monthQuery) {
  if (monthQuery && /^\d{4}-\d{2}$/.test(monthQuery)) {
    return monthQuery;
  }

  const now = new Date();
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return formatMonthKey(previousMonth);
}

function getMonthRange(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 1, 0, 0, 0, 0);
  return { monthStart, monthEnd };
}

async function archiveMonthlyReports(monthQuery) {
  const targetMonthKey = getArchiveMonthKey(monthQuery);
  const { monthStart, monthEnd } = getMonthRange(targetMonthKey);

  const reports = await WorkReport.find({
    workDate: { $gte: monthStart, $lt: monthEnd },
  })
    .sort({ workDate: 1, createdAt: 1 })
    .populate('user', 'name email employeeCode department')
    .lean();

  const monthWords = targetMonthKey.split('-');
  const archiveMonth = new Date(Number(monthWords[0]), Number(monthWords[1]) - 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  if (!reports.length) {
    const spreadsheetUrl = await getOrCreateArchiveSpreadsheet(targetMonthKey).then((result) => result.spreadsheetUrl).catch(() => null);
    return {
      archivedMonth: archiveMonth,
      spreadsheetUrl,
      totalReports: 0,
      totalPhotos: 0,
      deletedRecords: 0,
      message: 'No reports found for selected month.',
    };
  }

  const { spreadsheetId, spreadsheetUrl } = await getOrCreateArchiveSpreadsheet(targetMonthKey);
  await ensureArchiveSheet(spreadsheetId);
  await setSheetHeaders(spreadsheetId, ARCHIVE_HEADERS);

  const existingReportIds = await getExistingReportIds(spreadsheetId);
  const rows = [];
  let totalPhotos = 0;

  for (const report of reports) {
    if (existingReportIds.has(String(report._id))) {
      continue;
    }

    const photoLinks = await uploadPhotosForReport(report);
    totalPhotos += photoLinks.length;
    const archivedReport = { ...report, photoLinks };
    rows.push(buildArchiveRow(archivedReport));
  }

  if (rows.length) {
    await appendRowsToSheet(spreadsheetId, rows);
  }

  const reportIdsToDelete = reports.map((report) => report._id);
  const deleteResult = await WorkReport.deleteMany({ _id: { $in: reportIdsToDelete } });

  await sendArchiveNotification({
    archivedMonth: new Date(monthStart).toLocaleString('en-US', { month: 'long' }),
    archivedYear: monthStart.getFullYear(),
    spreadsheetUrl,
    totalReports: reports.length,
    totalPhotos,
    deletedRecords: deleteResult.deletedCount || 0,
  });

  return {
    archivedMonth: archiveMonth,
    spreadsheetUrl,
    totalReports: reports.length,
    totalPhotos,
    deletedRecords: deleteResult.deletedCount || 0,
    message: 'Archive completed successfully.',
  };
}

module.exports = {
  archiveMonthlyReports,
};
