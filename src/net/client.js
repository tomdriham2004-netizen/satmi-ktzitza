// Browser side of the room relay: connect, create/join rooms, send/receive
// relayed messages and transparently reconnect (reclaiming our seat by token).
import { EventBus } from "../core/events.js";

const TOKEN_KEY = (room) => `boomtown.token.${room}`;

export class NetClient extends EventBus {
  constructor() {
    super();
    this.ws = null;
    this.id = null;
    this.room = null;
    this.hostId = null;
    this.name = '';
    this.peers = new Map();
    this.closedByUs = false;
    this.retry = 0;
  }

  get isHost() { return !!this.id && this.id === this.hostId; }
  get connected() { return this.ws?.readyState === 1; }

  url() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url());
      this.ws = ws;
      const fail = () => reject(new Error('Could not reach the game server.'));
      ws.addEventListener('open', () => { ws.removeEventListener('error', fail); resolve(); }, { once: true });
      ws.addEventListener('error', fail, { once: true });
      ws.addEventListener('message', (e) => this.onMessage(e));
      ws.addEventListener('close', (e) => this.onClose(e));
    });
  }

  handshake(msg) {
    return new Promise((resolve, reject) => {
      const off1 = this.on('welcome', (w) => { off1(); off2(); resolve(w); });
      const off2 = this.on('fail', (e) => { off1(); off2(); reject(new Error(e.msg)); });
      this.raw(msg);
    });
  }

  async create(name) {
    this.name = name;
    await this.open();
    const w = await this.handshake({ t: 'create', name });
    this.remember(w);
    return w;
  }

  async join(room, name) {
    this.name = name;
    room = room.toUpperCase();
    await this.open();
    let token = null;
    try { token = sessionStorage.getItem(TOKEN_KEY(room)); } catch { /* ignore */ }
    const w = await this.handshake({ t: 'join', room, name, token });
    this.remember(w);
    return w;
  }

  remember(w) {
    this.id = w.id;
    this.room = w.room;
    this.hostId = w.hostId;
    this.token = w.token;
    this.peers = new Map(w.peers.map((p) => [p.id, p]));
    try { sessionStorage.setItem(TOKEN_KEY(w.room), w.token); } catch { /* ignore */ }
  }

  raw(msg) { if (this.connected) this.ws.send(JSON.stringify(msg)); }

  /** to: 'host' | 'all' | clientId | [clientIds] */
  send(to, data) { this.raw({ t: 'send', to, data }); }
  kick(id) { this.raw({ t: 'kick', id }); }

  onMessage(e) {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    switch (msg.t) {
      case 'welcome': this.emit('welcome', msg); break;
      case 'error': this.emit('fail', msg); this.emit('server-error', msg); break;
      case 'msg': this.emit('msg', msg); break;
      case 'peer-join':
        this.peers.set(msg.id, { id: msg.id, name: msg.name, connected: true });
        this.emit('peer-join', msg);
        break;
      case 'peer-leave': {
        const p = this.peers.get(msg.id);
        if (p) p.connected = false;
        if (msg.gone) this.peers.delete(msg.id);
        this.emit('peer-leave', msg);
        break;
      }
      case 'host-left': this.emit('host-left', msg); break;
      default:
    }
  }

  onClose() {
    if (this.closedByUs || !this.room) { this.emit('closed'); return; }
    // Unexpected drop: try to get our seat back.
    this.emit('reconnecting');
    const attempt = async () => {
      this.retry++;
      try {
        await this.open();
        const w = await this.handshake({ t: 'join', room: this.room, name: this.name, token: this.token });
        this.remember(w);
        this.retry = 0;
        this.emit('reconnected', w);
      } catch {
        if (this.retry < 20) setTimeout(attempt, Math.min(5000, 800 * this.retry));
        else this.emit('lost');
      }
    };
    setTimeout(attempt, 600);
  }

  close() {
    this.closedByUs = true;
    try { this.ws?.close(); } catch { /* ignore */ }
  }

  shareLink() {
    const u = new URL(location.href);
    u.search = `?room=${this.room}`;
    u.hash = '';
    return u.toString();
  }
}
