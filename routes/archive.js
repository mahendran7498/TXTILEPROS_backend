const express = require('express');
const { archiveMonthlyReports } = require('../utils/archive');

const router = express.Router();

router.get('/monthly', async (req, res) => {
  try {
    const secret = String(req.query.secret || '').trim();
    const isCron = req.headers['x-vercel-cron'] === 'true';

    if (!isCron && (!secret || secret !== process.env.ARCHIVE_TRIGGER_SECRET)) {
      return res.status(401).json({ error: 'Unauthorized. Missing or invalid archive trigger secret.' });
    }

    const monthQuery = String(req.query.month || '').trim();
    const result = await archiveMonthlyReports(monthQuery);
    return res.json(result);
  } catch (error) {
    console.error('Monthly archive error:', error);
    return res.status(500).json({
      error: error.message || 'Monthly archive failed.',
    });
  }
});

module.exports = router;
