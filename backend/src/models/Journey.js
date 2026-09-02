import mongoose from 'mongoose';

const journeySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  hashtags: {
    type: [String],
    default: [],
  },
  template: {
    type: String,
    required: true,
  },
  startDate: {
    type: Date,
  },
  currentDay: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed'],
    default: 'active',
  },
  postTimeLocal: {
    type: String,
    default: '09:00',
  },
  imageStyle: {
    type: String,
  },
});

const Journey = mongoose.model('Journey', journeySchema);

export default Journey;
