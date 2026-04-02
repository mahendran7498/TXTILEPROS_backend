async function syncReportToSheets(report, user) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;

  if (!webhookUrl) {
    return {
      status: 'skipped',
      lastAttemptAt: new Date(),
      message: 'GOOGLE_SHEETS_WEBHOOK_URL is not configured.',
    };
  }

  const payload = {
    sheetName: process.env.GOOGLE_SHEETS_SHEET_NAME || 'Work Reports',
    apiKey: process.env.GOOGLE_SHEETS_API_KEY || '',
    reportId: String(report._id),
    employeeName: user.name,
    employeeEmail: user.email,
    employeeCode: user.employeeCode || '',
    department: user.department || '',
    workDate: report.workDate,
    weekKey: report.weekKey,
    siteName: report.siteName,
    clientName: report.clientName,
    machineName: report.machineName,
    shift: report.shift,
    hoursWorked: report.hoursWorked,
    workSummary: report.workSummary,
    problemsObserved: report.problemsObserved,
    materialsUsed: report.materialsUsed,
    status: report.status,
    photoCount: report.photos.length,
    createdAt: report.createdAt,
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }

    return {
      status: 'synced',
      lastAttemptAt: new Date(),
      message: 'Report pushed to Google Sheets.',
    };
  } catch (error) {
    return {
      status: 'failed',
      lastAttemptAt: new Date(),
      message: error.message,
    };
  }
}

module.exports = {
  syncReportToSheets,
};
