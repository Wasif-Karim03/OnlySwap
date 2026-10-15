// Chat send + Realtime Broadcast delivery over WebSocket (Phoenix vsn 1.0.0), the way supabase-js joins private channels.
// Each VU: buyer opens a socket, joins private channel `chat:<id>` and `user:<buyer>`, the seller sends via send_message RPC
// every few seconds; we measure server->socket delivery latency (body carries the send timestamp).
import ws from 'k6/ws';
import { sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { rpc, chats, jwt, WS, ANON, uuidv4, pick, stages500to1000, thresholds } from './lib.js';
const joinOk = new Counter('ws_join_ok'), joinFail = new Counter('ws_join_fail'), recv = new Counter('ws_msgs_received'),
  wsErr = new Counter('ws_errors'), deliver = new Trend('ws_delivery_ms', true), delivered = new Rate('ws_delivery_rate');
export const options = { scenarios: { chat: { executor: 'ramping-vus', stages: stages500to1000(Number(__ENV.SCALE || 0.5)), gracefulRampDown: '40s' } },
  thresholds: { ...thresholds, ws_delivery_ms: ['p(95)<1500'] }, summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'] };
export default function () {
  const [chatId, b, s] = pick(chats);
  const url = `${WS}/realtime/v1/websocket?apikey=${ANON}&vsn=1.0.0`;
  let ref = 0, sent = 0;
  const join = (socket, topic) => socket.send(JSON.stringify({ topic, event: 'phx_join', ref: String(++ref), join_ref: String(ref),
    payload: { config: { broadcast: { ack: false, self: false }, presence: { key: '' }, postgres_changes: [], private: true }, access_token: jwt(b) } }));
  const res = ws.connect(url, {}, (socket) => {
    socket.on('open', () => {
      join(socket, `realtime:chat:${chatId}`);
      join(socket, `realtime:user:${'50000000-0000-4000-8000-' + String(b).padStart(12, '0')}`);
      socket.setInterval(() => socket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) })), 25000);
      socket.setInterval(() => { sent++; rpc(s, 'send_message', { chat_id: chatId, body: 't=' + Date.now(), client_id: uuidv4(), kind: 'text', photo_path: null }); }, 4000);
    });
    socket.on('message', (data) => {
      let m; try { m = JSON.parse(data); } catch (e) { return; }
      if (m.event === 'phx_reply' && m.topic !== 'phoenix') { if (m.payload && m.payload.status === 'ok') joinOk.add(1); else { joinFail.add(1); if (__ITER < 2) console.log('join fail', JSON.stringify(m.payload).slice(0, 200)); } }
      else if (m.event === 'broadcast' && m.payload && m.payload.event === 'message') {
        const body = m.payload.payload && m.payload.payload.body; const t = body && Number(String(body).replace('t=', ''));
        recv.add(1); if (t) deliver.add(Date.now() - t);
      }
    });
    socket.on('error', () => wsErr.add(1));
    socket.setTimeout(() => socket.close(), 25000);
  });
  if (!res || res.status !== 101) wsErr.add(1);
  sleep(1);
}
