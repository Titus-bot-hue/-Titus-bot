import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { startBot } from './bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/qr', (req, res) => res.sendFile(path.join(__dirname, 'public', 'qr.png')));
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  await startBot({ publicPath: path.join(__dirname, 'public') });
});
