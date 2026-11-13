// Run once: npm run seed:warden  (reads WARDEN_EMAIL and WARDEN_PASSWORD from .env)
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from './models/User.js';

const { MONGO_URI, WARDEN_EMAIL, WARDEN_PASSWORD } = process.env;
if (!MONGO_URI || !WARDEN_EMAIL || !WARDEN_PASSWORD) {
  console.error('Set MONGO_URI, WARDEN_EMAIL and WARDEN_PASSWORD in .env');
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
if (await User.exists({ email: WARDEN_EMAIL.toLowerCase() })) {
  console.log('Warden already exists');
} else {
  await User.create({
    name: 'Warden',
    email: WARDEN_EMAIL,
    rollNo: 'WARDEN-1',
    password: await bcrypt.hash(WARDEN_PASSWORD, 10),
    role: 'warden'
  });
  console.log('Warden created');
}
await mongoose.disconnect();
