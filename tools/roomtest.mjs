// Smoke test for online rooms on a live URL: host creates, guest joins, host
// sends a message, guest receives it.   node tools/roomtest.mjs wss://host/ws
import WebSocket from "ws";

const url = process.argv[2];
const open = () => new Promise((res, rej) => { const w = new WebSocket(url); w.once('open', () => res(w)); w.once('error', rej); });
const next = (w, t) => new Promise((res) => w.on('message', function f(b) { const m = JSON.parse(b); if (m.t === t) { w.off('message', f); res(m); } }));

const host = await open();
host.send(JSON.stringify({ t: 'create', name: 'מארח' }));
const hw = await next(host, 'welcome');
console.log('room created', hw.room);

const guest = await open();
guest.send(JSON.stringify({ t: 'join', room: hw.room, name: 'אורח' }));
const [gw, pj] = await Promise.all([next(guest, 'welcome'), next(host, 'peer-join')]);
console.log('guest joined', gw.room, '- host saw', pj.name);

host.send(JSON.stringify({ t: 'send', to: 'all', data: { hello: 'שלום' } }));
const got = await next(guest, 'msg');
console.log('guest received', JSON.stringify(got.data));
host.close(); guest.close();
process.exit(0);
