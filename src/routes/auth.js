import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { httpError } from '../utils/httpError.js';

const router = Router();

const signToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  rollNo: u.rollNo,
  role: u.role
});

router.post('/register', async (req, res) => {
  const { name, email, rollNo, password, phone } = req.body;
  if (![name, email, rollNo, password].every((v) => typeof v === 'string' && v.trim())) {
    throw httpError(400, 'name, email, rollNo and password are required');
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) throw httpError(400, 'Invalid email');
  if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters');

  const domain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (domain && !email.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) {
    throw httpError(400, `Use your college email (@${domain})`);
  }

  const hashed = await bcrypt.hash(password, 10);
  // role is never taken from the request: everyone who registers is a student
  const user = await User.create({ name, email, rollNo, phone, password: hashed });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw httpError(400, 'email and password are required');
  }
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  const ok = user && (await bcrypt.compare(password, user.password));
  if (!ok) throw httpError(401, 'Wrong email or password');
  if (user.isSuspended) throw httpError(403, 'Your account is suspended');

  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', protect, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
