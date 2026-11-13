import mongoose from 'mongoose';

// Lifecycle: pending -> accepted (owner agreed, waits for warden) -> swapped
// Other endings: rejected, withdrawn, warden_rejected
const bidSchema = new mongoose.Schema(
  {
    offeredRoom: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    targetRoom: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    bidder: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    message: { type: String, trim: true, maxlength: 300, default: '' },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'swapped', 'rejected', 'withdrawn', 'warden_rejected'],
      default: 'pending',
      index: true
    },
    wardenNote: { type: String, default: '' },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// The same pair of rooms can have only one pending bid.
bidSchema.index(
  { offeredRoom: 1, targetRoom: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

export default mongoose.model('Bid', bidSchema);
