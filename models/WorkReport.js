const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['before', 'after'], required: true },
    fileName: String,
    originalName: String,
    mimeType: String,
    size: Number,
    url: String,
  },
  { _id: false }
);

const workReportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    workDate: { type: Date, required: true, index: true },
    weekKey: { type: String, required: true, index: true },
    siteName: { type: String, required: true, trim: true },
    clientName: { type: String, trim: true },
    machineName: { type: String, trim: true },
    shift: { type: String, enum: ['Morning', 'Afternoon', 'Night', 'General'], default: 'General' },
    hoursWorked: { type: Number, min: 0, max: 24, default: 8 },
    workSummary: { type: String, required: true, trim: true },
    problemsObserved: { type: String, trim: true, default: '' },
    materialsUsed: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['completed', 'needs-support', 'blocked'], default: 'completed' },
    photos: { type: [photoSchema], default: [] },
    sheetsSync: {
      status: {
        type: String,
        enum: ['pending', 'synced', 'failed', 'skipped'],
        default: 'pending',
      },
      lastAttemptAt: Date,
      message: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkReport', workReportSchema);
