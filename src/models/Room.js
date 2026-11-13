import mongoose from 'mongoose';

// A Room is the physical room. Its owner changes when a swap is approved.
const roomSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hostel: { type: String, required: true, trim: true },
    block: { type: String, required: true, trim: true },
    floor: { type: Number, required: true, min: 0 },
    roomNumber: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true, min: 1 },
    description: { type: String, trim: true, default: '' },
    videoUrl: { type: String, required: true },
    verificationCode: { type: String, default: '' },
    isVerified: { type: Boolean, default: false }, // set by the warden
    wanted: {
      hostel: { type: String, default: '' },
      block: { type: String, default: '' },
      note: { type: String, default: '' }
    },
    // open = listed and bidding allowed, locked = a bid was accepted and waits for the warden,
    // closed = not listed
    status: { type: String, enum: ['open', 'locked', 'closed'], default: 'open', index: true },
    reportCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model('Room', roomSchema);
