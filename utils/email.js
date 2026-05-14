const nodemailer = require('nodemailer');

const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = Number(process.env.SMTP_PORT || 587);

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
});

function assertSmtpConfigured() {
  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP credentials are required to send email. Set SMTP_USER and SMTP_PASS.');
  }
}

function parseRecipients(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function uniqueRecipients(recipients) {
  return Array.from(new Set((recipients || []).filter(Boolean)));
}

function formatLeaveDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getLeavePeriodText(leave) {
  const from = formatLeaveDate(leave?.fromDate || leave?.leaveDate);
  const to = formatLeaveDate(leave?.toDate || leave?.leaveDate);
  if (!from && !to) return 'Not specified';
  if (!to || from === to) return from;
  return `${from} to ${to}`;
}

function getRecipients() {
  const recipients = process.env.ARCHIVE_NOTIFICATION_RECIPIENTS || process.env.NOTIFY_EMAIL || '';
  return parseRecipients(recipients);
}

async function sendArchiveNotification({ archivedMonth, archivedYear, spreadsheetUrl, totalReports, totalPhotos, deletedRecords }) {
  const recipients = getRecipients();
  if (!recipients.length) {
    return {
      status: 'skipped',
      message: 'No notification recipients configured (ARCHIVE_NOTIFICATION_RECIPIENTS or NOTIFY_EMAIL).',
    };
  }

  assertSmtpConfigured();

  const subject = `TXTILEPROS Monthly Archive Completed — ${archivedMonth} ${archivedYear}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
      <h2>Monthly Archive Completed</h2>
      <p><strong>Month:</strong> ${archivedMonth} ${archivedYear}</p>
      <p><strong>Spreadsheet:</strong> <a href="${spreadsheetUrl}" target="_blank">Open archive spreadsheet</a></p>
      <p><strong>Reports archived:</strong> ${totalReports}</p>
      <p><strong>Photos archived:</strong> ${totalPhotos}</p>
      <p><strong>Database records removed:</strong> ${deletedRecords}</p>
      <p style="margin-top:16px;color:#555">All reports older than one month have been moved to Google Sheets and deleted from the database.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `TXTILEPROS Archive <${smtpUser}>`,
    to: recipients,
    subject,
    html,
  });

  return {
    status: 'sent',
    recipients,
  };
}

async function sendLeaveRequestNotification({ leave, adminRecipients = [] }) {
  const configuredAdmins = parseRecipients(process.env.LEAVE_NOTIFICATION_RECIPIENTS || process.env.ADMIN_NOTIFICATION_RECIPIENTS);
  const recipients = uniqueRecipients([...configuredAdmins, ...adminRecipients]);
  if (!recipients.length) {
    return {
      status: 'skipped',
      message: 'No admin recipients configured for leave request notifications.',
    };
  }

  assertSmtpConfigured();

  const subject = `New leave request from ${leave.user?.name || 'employee'}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
      <h2>New Leave Request</h2>
      <p><strong>Employee:</strong> ${leave.user?.name || '-'}</p>
      <p><strong>Email:</strong> ${leave.user?.email || '-'}</p>
      <p><strong>Employee Code:</strong> ${leave.user?.employeeCode || '-'}</p>
      <p><strong>Department:</strong> ${leave.user?.department || '-'}</p>
      <p><strong>Leave Dates:</strong> ${getLeavePeriodText(leave)}</p>
      <p><strong>Reason:</strong> ${leave.reason || '-'}</p>
      <p><strong>Status:</strong> Pending</p>
    </div>
  `;

  await transporter.sendMail({
    from: `TXTILEPROS HR <${smtpUser}>`,
    to: recipients,
    subject,
    html,
  });

  return {
    status: 'sent',
    recipients,
  };
}

async function sendLeaveStatusNotification({ leave, employeeEmail }) {
  const recipient = String(employeeEmail || leave.user?.email || '').trim().toLowerCase();
  if (!recipient) {
    return {
      status: 'skipped',
      message: 'No employee email available for leave status notification.',
    };
  }

  assertSmtpConfigured();

  const statusLabel = leave.status === 'approved' ? 'Approved' : 'Rejected';
  const comment = String(leave.adminComment || '').trim();
  const reviewedBy = leave.reviewedBy?.name || 'Admin';
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
      <h2>Leave Request ${statusLabel}</h2>
      <p>Dear ${leave.user?.name || 'Employee'},</p>
      <p>Your leave request for <strong>${getLeavePeriodText(leave)}</strong> has been <strong>${statusLabel.toLowerCase()}</strong>.</p>
      <p><strong>Reason submitted:</strong> ${leave.reason || '-'}</p>
      <p><strong>Reviewed by:</strong> ${reviewedBy}</p>
      ${comment ? `<p><strong>Admin comment:</strong> ${comment}</p>` : ''}
    </div>
  `;

  await transporter.sendMail({
    from: `TXTILEPROS HR <${smtpUser}>`,
    to: recipient,
    subject: `Your leave request has been ${statusLabel.toLowerCase()}`,
    html,
  });

  return {
    status: 'sent',
    recipients: [recipient],
  };
}

module.exports = {
  sendArchiveNotification,
  sendLeaveRequestNotification,
  sendLeaveStatusNotification,
};
