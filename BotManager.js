import makeWASocket, { useMultiFileAuthState, DisconnectReason, makeInMemoryStore } from '@adiwajshing/baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import fs from 'fs-extra';
import QRCode from 'qrcode';
import path from 'path';

const store = makeInMemoryStore({ logger: P().child({ level: 'silent', stream: 'store' }) });
const MSG_STORE = path.join('storage', 'messages.json');

await fs.ensureDir('storage/sessions');
await fs.ensureFile(MSG_STORE);
if (!(await fs.readJson(MSG_STORE).catch(() => false))) await fs.writeJson(MSG_STORE, { messages: [] });

export async function startBot({ publicPath = 'public' } = {}) {
  const { state, saveCreds } = await useMultiFileAuthState('./storage/sessions');
  const sock = makeWASocket.default({ auth: state, printQRInTerminal: false, logger: P({ level: 'silent' }) });
  store.bind(sock.ev);

  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      const dataUrl = await QRCode.toDataURL(qr);
      const base64 = dataUrl.split(',')[1];
      await fs.writeFile(path.join(publicPath,'qr.png'), Buffer.from(base64,'base64'));
      console.log('📷 QR code saved: public/qr.png');
    }
    if (connection === 'close') {
      const reason = lastDisconnect?.error && Boom.isBoom(lastDisconnect.error) && lastDisconnect.error.output?.statusCode;
      console.log('❌ Connection closed:', reason);
      if (reason !== DisconnectReason.loggedOut) startBot({ publicPath }).catch(console.error);
    }
    if (connection === 'open') console.log('✅ WhatsApp connected!');
  });

  sock.ev.on('creds.update', saveCreds);

  // Store messages
  sock.ev.on('messages.upsert', async msgUpsert => {
    try {
      for (const m of msgUpsert.messages) {
        if (!m.message) continue;
        const stored = {
          id: m.key.id,
          from: m.key.remoteJid,
          author: m.key.participant || null,
          timestamp: m.messageTimestamp?.low || Math.floor(Date.now()/1000),
          messageType: Object.keys(m.message)[0],
          raw: m.message
        };
        const db = await fs.readJson(MSG_STORE);
        db.messages.push(stored);
        if (db.messages.length>2000) db.messages=db.messages.slice(-2000);
        await fs.writeJson(MSG_STORE, db);
      }
    } catch (e) { console.error("❌ error storing messages", e); }
  });

  // Recover deleted messages
  sock.ev.on('messages.delete', async item => {
    try {
      const { key } = item;
      const db = await fs.readJson(MSG_STORE);
      const found = db.messages.find(m => m.id===key.id);
      if (found){
        const jid = key.remoteJid;
        if(found.messageType==='conversation'||found.messageType==='extendedTextMessage'){
          const content = found.raw.conversation || found.raw.extendedTextMessage?.text;
          await sock.sendMessage(jid, { text: `*Recovered deleted message:*\n${content}` });
        } else await sock.sendMessage(jid, { text: '*Recovered deleted message (media)*' });
      }
    } catch(e){ console.error("❌ error recovering deleted message", e); }
  });

  // Simple auto-reply help
  sock.ev.on('messages.upsert', async mUp => {
    if(mUp.type!=='notify') return;
    for(const m of mUp.messages){
      if(!m.message) continue;
      const jid = m.key.remoteJid;
      const text = (m.message.conversation || m.message?.extendedTextMessage?.text || '').trim().toLowerCase();
      if(text==='help') await sock.sendMessage(jid, { text: '👋 Hello! I am *Titus-bot*.\n\n✅ Auto-view statuses\n✅ Auto-like (when supported)\n✅ Recover deleted messages\n\nSend me a message and try!' });
    }
  });

  return sock;
}
