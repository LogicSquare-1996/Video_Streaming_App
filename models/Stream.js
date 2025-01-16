const mongoose = require('mongoose');

const streamSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  broadcaster: {
    type: String,
    required: true
  },
  title: String,
  startedAt: {
    type: Date,
    default: Date.now
  },
  isLive: {
    type: Boolean,
    default: true
  }
});

module.exports = mongoose.model('Stream', streamSchema);