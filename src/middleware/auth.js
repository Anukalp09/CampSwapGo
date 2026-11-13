import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { httpError } from '../utils/httpError.js';

// Requires a valid "Authorization: Bearer <token>" header and sets req.user.
export async function protect(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw httpError(401, 'Please log in');

  const payload = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(payload.id);
  if (!user) throw httpError(401, 'User no longer exists');
  if (user.isSuspended) throw httpError(403, 'Your account is suspended');

  req.user = user;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) throw httpError(403, 'Not allowed');
    next();
  };
}
