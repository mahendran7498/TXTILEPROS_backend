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

function getRecipients() {
  const recipients = process.env.ARCHIVE_NOTIFICATION_RECIPIENTS || process.env.NOTIFY_EMAIL || '';
  return recipients
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function sendArchiveNotification({ archivedMonth, archivedYear, spreadsheetUrl, totalReports, totalPhotos, deletedRecords }) {
  const recipients = getRecipients();
  if (!recipients.length) {
    return {
      status: 'skipped',
      message: 'No notification recipients configured (ARCHIVE_NOTIFICATION_RECIPIENTS or NOTIFY_EMAIL).',
    };
  }

  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP credentials are required to send archive notification email. Set SMTP_USER and SMTP_PASS.');
  }

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

module.exports = {
  sendArchiveNotification,
};
