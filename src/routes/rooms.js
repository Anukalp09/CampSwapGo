import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Room from '../models/Room.js';
import Bid from '../models/Bid.js';
import Report from '../models/Report.js';
import { protect } from '../middleware/auth.js';
import { uploadVideo, discardUpload, uploadDir } from '../middleware/upload.js';
import { httpError } from '../utils/httpError.js';

const router = Router();
router.use(protect);

// Step 1 of listing: get a random code to say out loud in the walkthrough video.
router.get('/video-code', async (req, res) => {
  const code = crypto.randomInt(1000, 10000).toString();
  req.user.videoCode = code;
  await req.user.save();
  res.json({ code });
});

// The room I currently hold (or null)
router.get('/mine', async (req, res) => {
  const room = await Room.findOne({ owner: req.user._id });
  res.json({ room });
});

// Browse open rooms with filters: ?hostel=&block=&floor=&capacity=&page=&limit=
router.get('/', async (req, res) => {
  const { hostel, block, floor, capacity } = req.query;
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 12, 1), 50);

  const filter = { status: 'open', owner: { $ne: req.user._id } };
  if (hostel) filter.hostel = String(hostel);
  if (block) filter.block = String(block);
  if (floor !== undefined && floor !== '') filter.floor = Number(floor);
  if (capacity) filter.capacity = Number(capacity);

  const [rooms, total] = await Promise.all([
    Room.find(filter)
      .populate('owner', 'name') // no contact details here
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit),
    Room.countDocuments(filter)
  ]);
  res.json({ rooms, total, page, pages: Math.ceil(total / limit) });
});

// Step 2 of listing: upload the video and room details (multipart/form-data, field "video")
router.post('/', uploadVideo.single('video'), async (req, res) => {
  const { hostel, block, floor, roomNumber, capacity, description, wantedHostel, wantedBlock, wantedNote } =
    req.body;

  try {
    if (!req.file) throw httpError(400, 'A walkthrough video is required');
    if (!hostel || !block || !roomNumber || floor === undefined || !capacity) {
      throw httpError(400, 'hostel, block, floor, roomNumber and capacity are required');
    }
    if (!req.user.videoCode) throw httpError(400, 'Get a video code first (GET /api/rooms/video-code)');
    if (await Room.exists({ owner: req.user._id })) {
      throw httpError(409, 'You already have a room listed');
    }
  } catch (err) {
    discardUpload(req.file);
    throw err;
  }

  const room = await Room.create({
    owner: req.user._id,
    hostel,
    block,
    floor: Number(floor),
    roomNumber,
    capacity: Number(capacity),
    description,
    videoUrl: `/uploads/${req.file.filename}`,
    verificationCode: req.user.videoCode,
    wanted: { hostel: wantedHostel, block: wantedBlock, note: wantedNote }
  });
  res.status(201).json({ room });
});

router.get('/:id', async (req, res) => {
  const room = await Room.findById(req.params.id).populate('owner', 'name');
  if (!room) throw httpError(404, 'Room not found');
  res.json({ room });
});

// List or unlist my room: { "status": "open" | "closed" }
router.patch('/:id/listing', async (req, res) => {
  const { status } = req.body;
  if (!['open', 'closed'].includes(status)) throw httpError(400, 'status must be open or closed');
  const room = await Room.findOne({ _id: req.params.id, owner: req.user._id });
  if (!room) throw httpError(404, 'Room not found');
  if (room.status === 'locked') throw httpError(409, 'A swap is waiting for warden approval');
  room.status = status;
  await room.save();
  res.json({ room });
});

router.delete('/:id', async (req, res) => {
  const room = await Room.findOne({ _id: req.params.id, owner: req.user._id });
  if (!room) throw httpError(404, 'Room not found');
  if (room.status === 'locked') throw httpError(409, 'A swap is waiting for warden approval');

  await Bid.updateMany(
    { status: 'pending', $or: [{ offeredRoom: room._id }, { targetRoom: room._id }] },
    { status: 'rejected' }
  );
  await room.deleteOne();
  fs.unlink(path.join(uploadDir, path.basename(room.videoUrl)), () => {});
  res.json({ message: 'Room deleted' });
});

router.post('/:id/report', async (req, res) => {
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) throw httpError(400, 'Please give a reason');
  const room = await Room.findById(req.params.id);
  if (!room) throw httpError(404, 'Room not found');
  if (await Report.exists({ room: room._id, reporter: req.user._id, status: 'open' })) {
    throw httpError(409, 'You already reported this listing');
  }
  await Report.create({ room: room._id, reporter: req.user._id, reason });
  await Room.updateOne({ _id: room._id }, { $inc: { reportCount: 1 } });
  res.status(201).json({ message: 'Report sent to the warden' });
});

export default router;
