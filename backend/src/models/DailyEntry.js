import mongoose from 'mongoose';

const dailyEntrySchema = new mongoose.Schema({
  journeyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Journey',
    required: true,
  },
  dayNumber: {
    type: Number,
    required: true,
  },
  scheduledDate: {
    type: Date,
    required: true,
  },
  topic: {
    type: String,
  },
  challenge: {
    type: String,
  },
  extraNotes: {
    type: String,
  },
  status: {
    type: String,
    enum: ['planned', 'generated', 'posted', 'failed', 'skipped'],
    default: 'planned',
  },
  generatedText: {
    type: String,
  },
  generatedImageUrl: {
    type: String,
  },
  linkedinPostUrn: {
    type: String,
  },
  postedAt: {
    type: Date,
  },
  error: {
    type: String,
  },
});

const DailyEntry = mongoose.model('DailyEntry', dailyEntrySchema);

export default DailyEntry;
