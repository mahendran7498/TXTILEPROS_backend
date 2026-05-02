const express = require('express');
const WorkReport = require('../models/WorkReport');
const { requireAuth } = require('../middleware/auth');
const { formatWeekKey, startOfWeek, endOfWeek } = require('../utils/date');
const { buildEmployeeAttendanceSummary } = require('../utils/attendance');
const { storePhotos } = require('../utils/upload');
const { syncReportToSheets } = require('../utils/sheets');

const router = express.Router();

router.use(requireAuth);

router.post('/', async (req, res, next) => {
  try {
    const workDate = req.body.workDate ? new Date(req.body.workDate) : new Date();
    if (Number.isNaN(workDate.getTime())) {
      return res.status(400).json({ error: 'Please provide a valid work date.' });
    }

    const workSummary = String(req.body.workSummary || '').trim();
    const siteName = String(req.body.siteName || '').trim();

    if (!siteName || !workSummary) {
      return res.status(400).json({ error: 'Site name and work summary are required.' });
    }

    const incomingPhotos = Array.isArray(req.body.photos) ? req.body.photos : [];
    const photos = storePhotos(incomingPhotos);

    if (photos.length !== 2) {
      return res.status(400).json({ error: 'Please upload exactly two photos: one before work and one after work.' });
    }

    const photoKinds = new Set(photos.map((photo) => photo.kind));
    if (!photoKinds.has('before') || !photoKinds.has('after')) {
      return res.status(400).json({ error: 'Please upload one before-work photo and one after-work photo.' });
    }

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

router.get('/mine', async (req, res, next) => {
  try {
    const referenceDate = req.query.weekStart ? new Date(req.query.weekStart) : new Date();
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
    const referenceDate = req.query.weekStart ? new Date(req.query.weekStart) : new Date();
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
        weekStart: weekStart.toISOString().slice(0, 10),
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
