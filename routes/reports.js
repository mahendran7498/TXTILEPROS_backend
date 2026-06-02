const express = require('express');
const WorkReport = require('../models/WorkReport');
const { requireAuth } = require('../middleware/auth');
const { formatDateKey, formatWeekKey, parseDateInput, startOfWeek, endOfWeek } = require('../utils/date');
const { buildEmployeeAttendanceSummary } = require('../utils/attendance');
const { storePhotos } = require('../utils/upload');
const { syncReportToSheets } = require('../utils/sheets');

const router = express.Router();
const EDIT_WINDOW_MS = 60 * 60 * 1000;

router.use(requireAuth);

function canEditReport(report, userId) {
  return String(report.user) === String(userId) && (Date.now() - new Date(report.createdAt).getTime()) <= EDIT_WINDOW_MS;
}

async function buildStoredPhotosFromRequest(body) {
  const incomingPhotos = Array.isArray(body.photos) ? body.photos : [];
  const photos = await storePhotos(incomingPhotos);

  const beforePhotos = photos.filter((photo) => photo.kind === 'before');
  const afterPhotos = photos.filter((photo) => photo.kind === 'after');

  if (beforePhotos.length < 1 || beforePhotos.length > 4 || afterPhotos.length !== 1) {
    const error = new Error('Please upload 1 to 4 before-work photos and exactly 1 after-work photo.');
    error.status = 400;
    throw error;
  }

  return photos;
}

router.post('/', async (req, res, next) => {
  try {
    const workDate = req.body.workDate ? parseDateInput(req.body.workDate) : new Date();
    if (Number.isNaN(workDate.getTime())) {
      return res.status(400).json({ error: 'Please provide a valid work date.' });
    }
    
    const workSummary = String(req.body.workSummary || '').trim();
    const siteName = String(req.body.siteName || '').trim();

    if (!siteName || !workSummary) {
      return res.status(400).json({ error: 'Site name and work summary are required.' });
    }

    const photos = await buildStoredPhotosFromRequest(req.body);

    const report = await WorkReport.create({
      user: req.user._id,
      workDate,
      weekKey: formatWeekKey(workDate),
      siteName,
      clientName: String(req.body.clientName || '').trim(),
      machineName: String(req.body.machineName || '').trim(),
      shift: req.body.shift || 'General',
      hoursWorked: Number(req.body.hoursWorked || 8),
      workSummary,
      problemsObserved: String(req.body.problemsObserved || '').trim(),
      materialsUsed: String(req.body.materialsUsed || '').trim(),
      status: req.body.status || 'completed',
      photos,
    });

    report.sheetsSync = await syncReportToSheets(report, req.user);
    await report.save();

    const populated = await WorkReport.findById(report._id).populate('user', 'name email employeeCode department');
    res.status(201).json({ report: populated });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const report = await WorkReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    if (!canEditReport(report, req.user._id)) {
      return res.status(403).json({ error: 'This report can only be edited by its owner within 1 hour of submission.' });
    }

    const workDate = req.body.workDate ? parseDateInput(req.body.workDate) : report.workDate;
    if (Number.isNaN(workDate.getTime())) {
      return res.status(400).json({ error: 'Please provide a valid work date.' });
    }

    const workSummary = String(req.body.workSummary || '').trim();
    const siteName = String(req.body.siteName || '').trim();

    if (!siteName || !workSummary) {
      return res.status(400).json({ error: 'Site name and work summary are required.' });
    }

    const photos = await buildStoredPhotosFromRequest(req.body);

    report.workDate = workDate;
    report.weekKey = formatWeekKey(workDate);
    report.siteName = siteName;
    report.clientName = String(req.body.clientName || '').trim();
    report.machineName = String(req.body.machineName || '').trim();
    report.shift = req.body.shift || 'General';
    report.hoursWorked = Number(req.body.hoursWorked || 8);
    report.workSummary = workSummary;
    report.problemsObserved = String(req.body.problemsObserved || '').trim();
    report.materialsUsed = String(req.body.materialsUsed || '').trim();
    report.status = req.body.status || 'completed';
    report.photos = photos;

    report.sheetsSync = await syncReportToSheets(report, req.user);
    await report.save();

    const populated = await WorkReport.findById(report._id).populate('user', 'name email employeeCode department');
    res.json({ report: populated });
  } catch (error) {
    next(error);
  }
});

router.get('/mine', async (req, res, next) => {
  try {
    const referenceDate = req.query.weekStart ? parseDateInput(req.query.weekStart) : new Date();
    const weekStart = startOfWeek(referenceDate);
    const weekEnd = endOfWeek(referenceDate);

    const reports = await WorkReport.find({
      user: req.user._id,
      workDate: { $gte: weekStart, $lt: weekEnd },
    })
      .sort({ workDate: -1, createdAt: -1 })
      .populate('user', 'name email employeeCode department');

    res.json({ reports });
  } catch (error) {
    next(error);
  }
});

router.get('/weekly-summary', async (req, res, next) => {
  try {
    const referenceDate = req.query.weekStart ? parseDateInput(req.query.weekStart) : new Date();
    const weekStart = startOfWeek(referenceDate);
    const weekEnd = endOfWeek(referenceDate);

    const reports = await WorkReport.find({
      user: req.user._id,
      workDate: { $gte: weekStart, $lt: weekEnd },
    });
    const attendance = await buildEmployeeAttendanceSummary(req.user._id, weekStart, weekEnd);

    const summary = reports.reduce(
      (acc, report) => {
        acc.totalReports += 1;
        acc.totalHours += report.hoursWorked || 0;
        acc.photoCount += report.photos.length;
        if (report.problemsObserved) acc.problemReports += 1;
        if (report.status === 'blocked' || report.status === 'needs-support') acc.attentionNeeded += 1;
        return acc;
      },
      {
        weekStart: formatDateKey(weekStart),
        totalReports: 0,
        totalHours: 0,
        photoCount: 0,
        problemReports: 0,
        attentionNeeded: 0,
        attendance,
      }
    );

    res.json({ summary });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
