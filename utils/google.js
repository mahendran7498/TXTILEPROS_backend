const { google } = require('googleapis');
const { Buffer } = require('buffer');

const SHEET_NAME = 'Archive';
const SPREADSHEET_TITLE_PREFIX = 'TXTILEPROS Reports Archive';

function parseServiceAccountCredentials() {
  const rawCreds = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawCreds) {
    throw new Error('Missing Google service account credentials. Set GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_JSON.');
  }

  try {
    const asString = String(rawCreds).trim();
    return JSON.parse(asString);
  } catch (primaryError) {
    try {
      const decoded = Buffer.from(rawCreds, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (secondaryError) {
      throw new Error('Invalid Google service account credentials. Provide valid JSON or base64-encoded JSON.');
    }
  }
}

function createGoogleAuth() {
  const credentials = parseServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });
  return auth;
}

async function getDriveClient() {
  const auth = createGoogleAuth();
  return google.drive({ version: 'v3', auth });
}

async function getSheetsClient() {
  const auth = createGoogleAuth();
  return google.sheets({ version: 'v4', auth });
}

function escapeQueryValue(value) {
  return value.replace(/'/g, "\\'");
}

async function findSpreadsheetByName(name, folderId) {
  const drive = await getDriveClient();
  const folderQuery = folderId ? ` and '${folderId}' in parents` : '';
  const query = `name = '${escapeQueryValue(name)}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false${folderQuery}`;

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name, webViewLink)',
    spaces: 'drive',
    pageSize: 10,
  });

  return response.data.files && response.data.files.length ? response.data.files[0] : null;
}

async function createSpreadsheet(name, folderId) {
  const sheets = await getSheetsClient();
  const resource = {
    properties: { title: name },
    sheets: [
      {
        properties: {
          title: SHEET_NAME,
        },
      },
    ],
  };

  if (folderId) {
    resource.parents = [folderId];
  }

  const response = await sheets.spreadsheets.create({
    requestBody: resource,
    fields: 'spreadsheetId,spreadsheetUrl,properties.title',
  });

  return {
    id: response.data.spreadsheetId,
    url: response.data.spreadsheetUrl,
  };
}

async function ensureFileShared(fileId) {
  const drive = await getDriveClient();

  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      supportsAllDrives: true,
    });
  } catch (error) {
    // If the file is already shared publicly, this can safely fail.
    if (!/alreadyExists|Duplicate|cannot.*grant/i.test(error.message)) {
      throw error;
    }
  }
}

async function getOrCreateArchiveSpreadsheet(monthKey) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const title = `${SPREADSHEET_TITLE_PREFIX} ${monthKey}`;
  let spreadsheet = await findSpreadsheetByName(title, folderId);

  if (!spreadsheet) {
    spreadsheet = await createSpreadsheet(title, folderId);
  }

  await ensureFileShared(spreadsheet.id);
  return { spreadsheetId: spreadsheet.id, spreadsheetUrl: spreadsheet.url || `https://docs.google.com/spreadsheets/d/${spreadsheet.id}` };
}

async function getSheetMetadata(spreadsheetId) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title))',
  });
  return response.data.sheets || [];
}

async function ensureArchiveSheet(spreadsheetId) {
  const sheets = await getSheetsClient();
  const metadata = await getSheetMetadata(spreadsheetId);
  const existingSheet = metadata.find((sheet) => sheet.properties.title === SHEET_NAME);

  if (!existingSheet) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: SHEET_NAME,
              },
            },
          },
        ],
      },
    });
  }
}

async function getExistingReportIds(spreadsheetId) {
  const sheets = await getSheetsClient();
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A2:A`,
      majorDimension: 'COLUMNS',
    });

    const values = response.data.values || [];
    return new Set((values[0] || []).map((value) => String(value).trim()));
  } catch (error) {
    if (error.code === 400 || /Unable to parse range/.test(error.message)) {
      return new Set();
    }
    throw error;
  }
}

async function setSheetHeaders(spreadsheetId, headers) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:${String.fromCharCode(65 + headers.length - 1)}1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [headers],
    },
  });
}

async function appendRowsToSheet(spreadsheetId, rows) {
  const sheets = await getSheetsClient();
  if (!rows || !rows.length) {
    return;
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: rows,
    },
  });
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL for attachment upload.');
  }
  return {
    mimeType: match[1],
    base64: match[2],
  };
}

function normalizeFileName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9_.\- ]/g, '_').slice(0, 180);
}

async function uploadPhotoToDrive(reportId, photo) {
  const drive = await getDriveClient();
  const { mimeType, base64 } = parseDataUrl(photo.dataUrl);
  const fileName = normalizeFileName(`${reportId}_${photo.kind}_${photo.originalName}`);
  const buffer = Buffer.from(base64, 'base64');

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType,
      parents: process.env.GOOGLE_DRIVE_FOLDER_ID ? [process.env.GOOGLE_DRIVE_FOLDER_ID] : undefined,
    },
    media: {
      mimeType,
      body: buffer,
    },
    fields: 'id,webViewLink',
    supportsAllDrives: true,
  });

  const fileId = response.data.id;
  await ensureFileShared(fileId);
  return response.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
}

async function uploadPhotosForReport(report) {
  if (!Array.isArray(report.photos) || !report.photos.length) {
    return [];
  }

  const links = [];
  for (const photo of report.photos) {
    links.push(await uploadPhotoToDrive(report._id, photo));
  }
  return links;
}

module.exports = {
  getOrCreateArchiveSpreadsheet,
  ensureArchiveSheet,
  getExistingReportIds,
  setSheetHeaders,
  appendRowsToSheet,
  uploadPhotosForReport,
  SHEET_NAME,
};
