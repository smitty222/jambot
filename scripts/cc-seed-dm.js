// scripts/cc-seed-dm.js
import 'dotenv/config';
import { buildUrl, makeRequest } from '../src/utils/networking.js';

const app = '2794843576a0c391';
const key = 'ebeedf5041e4b3dbecb03e5e1cacf0c48a8ad291';
const bot = process.env.CHAT_USER_ID;                     // bot's CometChat UID (== BOT_USER_UUID in your tenant)
const to  = process.argv[2] || process.env.SMITTY_UUID;   // receiver (you)
const msg = process.argv.slice(3).join(' ') || 'hello from bot';

if (!app || !key || !bot || !to) {
  console.error('Missing env: CHAT_API_KEY, CHAT_TOKEN, CHAT_USER_ID, SMITTY_UUID (or pass receiver as argv[2]).');
  process.exit(1);
}

const host = `${app}.api-us.cometchat.io`;
const headers = {
  apikey: key,
  'content-type': 'application/json',
  onBehalfOf: bot, // send AS the bot
};

const url = (parts, params) => buildUrl(host, parts, params);

(async () => {
  console.log('App:', app);
  console.log('Bot UID:', bot);
  console.log('Sending to:', to);

  const payload = {
    receiver: to,
    receiverType: 'user',
    type: 'text',
    category: 'message',
    data: { text: msg }
  };

  const res = await makeRequest(url(['v3','messages']), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  console.log('DM sent result:', res?.data || res);
})().catch(e => {
  console.error('[seed] error:', e?.response?.status, e?.response?.data || e?.message);
  process.exit(1);
});
