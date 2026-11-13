import { Router } from 'express';
import mongoose from 'mongoose';
import Bid from '../models/Bid.js';
import Room from '../models/Room.js';
import { protect } from '../middleware/auth.js';
import { httpError } from '../utils/httpError.js';
import { notify } from '../utils/notify.js';

const router = Router();
router.use(protect);

const MAX_PENDING_BIDS = 5;
const ROOM_FIELDS = 'hostel block floor roomNumber capacity videoUrl';

const populateBid = (query) =>
  query
    .populate('offeredRoom targetRoom', ROOM_FIELDS)
    .populate('bidder owner', 'name phone')
    .sort('-createdAt');

// Phone numbers stay hidden until the owner has accepted.
function shape(bid) {
  const b = bid.toObject();
  const reveal = ['accepted', 'swapped'].includes(b.status);
  if (!reveal) {
    if (b.bidder) delete b.bidder.phone;
    if (b.owner) delete b.owner.phone;
  }
  return b;
}

// Place a bid: my room for your room
router.post('/', async (req, res) => {
  const { offeredRoomId, targetRoomId, message } = req.body;
  if (!offeredRoomId || !targetRoomId) throw httpError(400, 'offeredRoomId and targetRoomId are required');

  const mine = await Room.findOne({ _id: offeredRoomId, owner: req.user._id });
  if (!mine) throw httpError(404, 'You can only offer a room you hold');
  if (mine.status !== 'open') throw httpError(409, 'Your room is not open for swapping');

  const target = await Room.findById(targetRoomId);
  if (!target || target.status !== 'open') throw httpError(404, 'That room is not available');
  if (String(target.owner) === String(req.user._id)) throw httpError(400, 'You cannot bid on your own room');

  const pending = await Bid.countDocuments({ bidder: req.user._id, status: 'pending' });
  if (pending >= MAX_PENDING_BIDS) {
    throw httpError(400, `You can have at most ${MAX_PENDING_BIDS} pending bids`);
  }

  const bid = await Bid.create({
    offeredRoom: mine._id,
    targetRoom: target._id,
    bidder: req.user._id,
    owner: target.owner,
    message
  });
  await notify(target.owner, `${req.user.name} sent a bid for your room`, bid._id);
  res.status(201).json({ bid });
});

router.get('/sent', async (req, res) => {
  const bids = await populateBid(Bid.find({ bidder: req.user._id }));
  res.json({ bids: bids.map(shape) });
});

router.get('/received', async (req, res) => {
  const bids = await populateBid(Bid.find({ owner: req.user._id }));
  res.json({ bids: bids.map(shape) });
});

router.post('/:id/reject', async (req, res) => {
  const bid = await Bid.findOne({ _id: req.params.id, owner: req.user._id, status: 'pending' });
  if (!bid) throw httpError(404, 'Pending bid not found');
  bid.status = 'rejected';
  await bid.save();
  await notify(bid.bidder, `${req.user.name} rejected your bid`, bid._id);
  res.json({ bid });
});

router.post('/:id/withdraw', async (req, res) => {
  const bid = await Bid.findOne({ _id: req.params.id, bidder: req.user._id, status: 'pending' });
  if (!bid) throw httpError(404, 'Pending bid not found');
  bid.status = 'withdrawn';
  await bid.save();
  res.json({ bid });
});

// Accept: everything below happens in ONE transaction, so it fully succeeds or fully rolls back.
router.post('/:id/accept', async (req, res) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const bid = await Bid.findOne({ _id: req.params.id, owner: req.user._id, status: 'pending' }).session(session);
      if (!bid) throw httpError(404, 'Pending bid not found');

      const roomIds = [bid.offeredRoom, bid.targetRoom];
      const rooms = await Room.find({ _id: { $in: roomIds }, status: 'open' }).session(session);
      if (rooms.length !== 2) throw httpError(409, 'One of the rooms is no longer available');

      // 1. lock both rooms so no other bid can touch them
      await Room.updateMany({ _id: { $in: roomIds } }, { status: 'locked' }, { session });

      // 2. this bid now waits for the warden
      bid.status = 'accepted';
      await bid.save({ session });

      // 3. auto-reject every other pending bid that involves either room
      const others = await Bid.find({
        _id: { $ne: bid._id },
        status: 'pending',
        $or: [{ offeredRoom: { $in: roomIds } }, { targetRoom: { $in: roomIds } }]
      }).session(session);
      for (const other of others) {
        other.status = 'rejected';
        await other.save({ session });
        await notify(other.bidder, 'A room in your bid was taken by another swap', other._id, session);
      }

      await notify(bid.bidder, `${req.user.name} accepted your bid. Waiting for warden approval`, bid._id, session);
      result = bid;
    });
  } finally {
    await session.endSession();
  }
  res.json({ bid: result });
});

export default router;
