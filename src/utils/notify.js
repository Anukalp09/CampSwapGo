import Notification from '../models/Notification.js';

// Pass a session when calling inside a transaction.
export async function notify(userId, message, bidId, session) {
  await Notification.create(
    [{ user: userId, message, bid: bidId }],
    session ? { session } : undefined
  );
}
