import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

dotenv.config();

// Folders
const authFolder = './auth';
const publicFolder = join(process.cwd(), 'public');
if (!existsSync(authFolder)) mkdirSync(authFolder);
if (!existsSync(publicFolder)) mkdirSync(publicFolder);

// Config paths
const blocklistPath = './blocklist.json';
const featuresPath = './features.json';

// Load blocklist
let blocklist = existsSync(blocklistPath)
  ? JSON.parse(readFileSync(blocklistPath))
  : [];

// Load feature toggles
let features = existsSync(featuresPath)
  ? JSON.parse(readFileSync(featuresPath))
  : {
      autoview: true,
      faketyping: true
    };

// Main function
export async function startSession(sessionId) {
  const { state, saveCreds } = await useMultiFileAuthState(join(authFolder, sessionId));
  const { version } = await fetchLatestBaileysVersion();

  console.log(`📦 Baileys v${version.join('.')}`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['Titus-bot', 'Chrome', '122']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    // QR Code Method
    if (qr) {
      const qrPath = join(publicFolder, 'qr.png');
      QRCode.toFile(qrPath, qr, (err) => {
        if (err) console.error('❌ Failed to save QR code:', err);
        else console.log(`✅ QR code saved at ${qrPath}`);
      });
    }

    if (connection === 'open') {
      console.log(`✅ WhatsApp session "${sessionId}" connected`);
      setupListeners(sock);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode
        : 'unknown';
      console.log(`❌ Disconnected. Code: ${statusCode}`);

      if (statusCode !== DisconnectReason.loggedOut) {
        console.log('🔁 Reconnecting...');
        startSession(sessionId);
      }
    }
  });
}

// Handle incoming messages
async function handleIncomingMessage(sock, msg) {
  try {
    const sender = msg.key.remoteJid;
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      '';
    const command = text.trim().toLowerCase();

    if (blocklist.includes(sender)) return;

    // Commands
    const commands = {
      '.ping': '🏓 Pong!',
      '.alive': '✅ Titus-bot is alive!',
      '.status': `📊 Status:\n${Object.entries(features).map(([k, v]) => `• ${k}: ${v ? '✅' : '❌'}`).join('\n')}`,
      '.menu': `📜 Menu:\n• .ping\n• .alive\n• .status\n• .menu\n• .shutdown\n• .broadcast <msg>\n• .block <number>\n• .unblock <number>\n• .toggle <feature>`
    };

    if (commands[command]) {
      await sock.sendMessage(sender, { text: commands[command] }, { quoted: msg });
      return;
    }

    if (command.startsWith('.') && !commands[command]) {
      await sock.sendMessage(sender, {
        text: `❓ Unknown command: ${command}\nType .menu to see available commands.`
      }, { quoted: msg });
    }

    // Auto-read messages
    await sock.readMessages([msg.key]);

    // Fake typing effect
    if (features.faketyping) {
      await sock.sendPresenceUpdate('composing', sender);
      await new Promise(res => setTimeout(res, 2000));
      await sock.sendPresenceUpdate('paused', sender);
    }
  } catch (err) {
    console.error('❌ Error handling message:', err);
  }
}

// Event listeners
function setupListeners(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe) await handleIncomingMessage(sock, msg);
    }
  });

  // Keep bot online
  setInterval(() => {
    sock.sendPresenceUpdate('available');
    console.log('🟢 Bot is online');
  }, 30000);
        }
