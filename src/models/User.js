import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    rollNo: { type: String, required: true, unique: true, trim: true },
    phone: { type: String, trim: true, default: '' }, // hidden until a bid is accepted
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['student', 'warden'], default: 'student' },
    isSuspended: { type: Boolean, default: false },
    videoCode: { type: String, default: '' } // random code the student must say in the room video
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
