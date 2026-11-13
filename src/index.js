import 'dotenv/config';
import app from './app.js';
import { connectDB } from './config/db.js';

const { MONGO_URI, JWT_SECRET, PORT = 5000 } = process.env;
if (!MONGO_URI || !JWT_SECRET) {
  console.error('Missing MONGO_URI or JWT_SECRET. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

await connectDB(MONGO_URI);
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
