import { Router } from 'express';
import mongoose from 'mongoose';
import Bid from '../models/Bid.js';
import Room from '../models/Room.js';
import Report from '../models/Report.js';
import User from '../models/User.js';
import { protect, requireRole } from '../middleware/auth.js';
import { httpError } from '../utils/httpError.js';
import { notify } from '../utils/notify.js';

const router = Router();
router.use(protect, requireRole('warden'));

// Swaps waiting for approval
router.get('/bids', async (req, res) => {
  const bids = await Bid.find({ status: 'accepted' })
    .populate('offeredRoom targetRoom', 'hostel block floor roomNumber capacity videoUrl verificationCode isVerified')
    .populate('bidder owner', 'name email rollNo phone')
    .sort('createdAt');
  res.json({ bids });
});

// Approve: rooms exchange owners (one transaction)
router.post('/bids/:id/approve', async (req, res) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const bid = await Bid.findOne({ _id: req.params.id, status: 'accepted' }).session(session);
      if (!bid) throw httpError(404, 'Bid waiting for approval not found');

      const offered = await Room.findOne({ _id: bid.offeredRoom, status: 'locked' }).session(session);
      const target = await Room.findOne({ _id: bid.targetRoom, status: 'locked' }).session(session);
      if (!offered || !target) throw httpError(409, 'Rooms are not in the locked state');
      if (String(offered.owner) !== String(bid.bidder) || String(target.owner) !== String(bid.owner)) {
        throw httpError(409, 'Room ownership changed, cannot approve');
      }

      // swap owners, unlist both rooms, clear the "wanted" preferences
      await Room.updateOne({ _id: offered._id }, { owner: bid.owner, status: 'closed', wanted: {} }, { session });
      await Room.updateOne({ _id: target._id }, { owner: bid.bidder, status: 'closed', wanted: {} }, { session });

      bid.status = 'swapped';
      bid.decidedBy = req.user._id;
      bid.wardenNote = req.body.note || '';
      await bid.save({ session });

      await notify(bid.bidder, 'Warden approved your swap. The rooms have been exchanged', bid._id, session);
      await notify(bid.owner, 'Warden approved your swap. The rooms have been exchanged', bid._id, session);
      result = bid;
    });
  } finally {
    await session.endSession();
  }
  res.json({ bid: result });
});

// Reject: rooms are unlocked and stay with their owners
router.post('/bids/:id/reject', async (req, res) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const bid = await Bid.findOne({ _id: req.params.id, status: 'accepted' }).session(session);
      if (!bid) throw httpError(404, 'Bid waiting for approval not found');

      await Room.updateMany({ _id: { $in: [bid.offeredRoom, bid.targetRoom] } }, { status: 'open' }, { session });
      bid.status = 'warden_rejected';
      bid.decidedBy = req.user._id;
      bid.wardenNote = req.body.note || '';
      await bid.save({ session });

      await notify(bid.bidder, 'Warden did not approve the swap', bid._id, session);
      await notify(bid.owner, 'Warden did not approve the swap', bid._id, session);
      result = bid;
    });
  } finally {
    await session.endSession();
  }
  res.json({ bid: result });
});

router.get('/reports', async (req, res) => {
  const reports = await Report.find({ status: 'open' })
    .populate('room', 'hostel block roomNumber videoUrl reportCount')
    .populate('reporter', 'name rollNo')
    .sort('-createdAt');
  res.json({ reports });
});

router.post('/reports/:id/resolve', async (req, res) => {
  const report = await Report.findByIdAndUpdate(req.params.id, { status: 'resolved' }, { new: true });
  if (!report) throw httpError(404, 'Report not found');
  res.json({ report });
});

router.post('/rooms/:id/verify', async (req, res) => {
  const room = await Room.findByIdAndUpdate(req.params.id, { isVerified: true }, { new: true });
  if (!room) throw httpError(404, 'Room not found');
  res.json({ room });
});

// { "suspended": true | false }
router.post('/users/:id/suspend', async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isSuspended: req.body.suspended !== false },
    { new: true }
  );
  if (!user) throw httpError(404, 'User not found');
  res.json({ user: { id: user._id, name: user.name, isSuspended: user.isSuspended } });
});

export default router;
