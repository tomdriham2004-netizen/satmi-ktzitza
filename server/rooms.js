// Room relay for online play. The server knows nothing about the game: it
// creates rooms, tracks who is connected and forwards messages between the
// host (who runs the authoritative engine in their browser) and the guests.
// Clients get a reconnect token so a dropped player can reclaim their seat.
import { WebSocketServer } from "ws";
import crypto from "node:crypto";

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 30 * 60 * 1000;     // empty rooms linger this long
const MAX_CLIENTS = 8;

const code = () => Array.from({ length: 5 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
const token = () => crypto.randomBytes(12).toString('hex');

export function attachRooms(httpServer, { path = '/ws', log = () => {} } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
  const rooms = new Map();
  let nextId = 1;

  httpServer.on('upgrade', (req, socket, head) => {
    let pathname = '/';
    try { pathname = new URL(req.url, 'http://x').pathname; } catch { /* ignore */ }
    if (pathname !== path) return; // leave other upgrades (e.g. Vite HMR) alone
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const peers = (room) => [...room.clients.values()].map((c) => ({ id: c.id, name: c.name, connected: !!c.ws, host: c.id === room.hostId }));
  const broadcast = (room, msg, exceptId) => { for (const c of room.clients.values()) if (c.id !== exceptId) send(c.ws, msg); };

  function scheduleCleanup(room) {
    clearTimeout(room.cleanup);
    if ([...room.clients.values()].some((c) => c.ws)) return;
    room.cleanup = setTimeout(() => { rooms.delete(room.code); log(`room ${room.code} closed`); }, ROOM_TTL_MS);
  }

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    let room = null;
    let me = null;

    ws.on('message', (buf) => {
      let msg;
      try { msg = JSON.parse(buf); } catch { return; }
      if (msg.t === 'create') {
        let c = code();
        while (rooms.has(c)) c = code();
        room = { code: c, hostId: null, clients: new Map(), cleanup: null };
        rooms.set(c, room);
        me = { id: `c${nextId++}`, name: String(msg.name || 'Host').slice(0, 20), token: token(), ws };
        room.clients.set(me.id, me);
        room.hostId = me.id;
        log(`room ${c} created`);
        send(ws, { t: 'welcome', room: c, id: me.id, token: me.token, hostId: room.hostId, peers: peers(room) });
        return;
      }
      if (msg.t === 'join') {
        const r = rooms.get(String(msg.room || '').toUpperCase());
        if (!r) { send(ws, { t: 'error', code: 'no-room', msg: 'החדר הזה לא קיים (או שכבר נסגר).' }); return; }
        room = r;
        clearTimeout(room.cleanup);
        const existing = msg.token && [...room.clients.values()].find((c) => c.token === msg.token);
        if (existing) {
          if (existing.ws && existing.ws !== ws) { try { existing.ws.close(4000, 'replaced'); } catch { /* ignore */ } }
          existing.ws = ws;
          me = existing;
        } else {
          if (room.clients.size >= MAX_CLIENTS) { send(ws, { t: 'error', code: 'full', msg: 'החדר מלא.' }); room = null; return; }
          if (!room.clients.get(room.hostId)?.ws) { send(ws, { t: 'error', code: 'no-host', msg: 'המארח עזב את החדר.' }); room = null; return; }
          me = { id: `c${nextId++}`, name: String(msg.name || 'Player').slice(0, 20), token: token(), ws };
          room.clients.set(me.id, me);
        }
        send(ws, { t: 'welcome', room: room.code, id: me.id, token: me.token, hostId: room.hostId, peers: peers(room), rejoin: !!existing });
        broadcast(room, { t: 'peer-join', id: me.id, name: me.name, rejoin: !!existing }, me.id);
        return;
      }
      if (!room || !me) return;
      if (msg.t === 'send') {
        const out = JSON.stringify({ t: 'msg', from: me.id, data: msg.data });
        const to = msg.to;
        for (const c of room.clients.values()) {
          if (c.id === me.id || !c.ws || c.ws.readyState !== 1) continue;
          if (to === 'all' || (to === 'host' && c.id === room.hostId) || to === c.id || (Array.isArray(to) && to.includes(c.id))) c.ws.send(out);
        }
        return;
      }
      if (msg.t === 'kick' && me.id === room.hostId) {
        const c = room.clients.get(msg.id);
        if (c) { send(c.ws, { t: 'error', code: 'kicked', msg: 'המארח הוציא אותך מהחדר.' }); c.ws?.close(); room.clients.delete(c.id); broadcast(room, { t: 'peer-leave', id: c.id, gone: true }); }
      }
    });

    ws.on('close', () => {
      if (!room || !me || me.ws !== ws) return;
      me.ws = null;
      if (me.id === room.hostId) broadcast(room, { t: 'host-left' });
      else broadcast(room, { t: 'peer-leave', id: me.id });
      scheduleCleanup(room);
    });
  });

  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }
  }, 25000);
  httpServer.on('close', () => clearInterval(beat));
  return { wss, rooms };
}
