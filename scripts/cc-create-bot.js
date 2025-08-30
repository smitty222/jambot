// scripts/cc-create-bot.js
import 'dotenv/config';
import { buildUrl, makeRequest } from '../src/utils/networking.js';

const app = '2794843576a0c391';
const key = '193427bb5702bab7';
const bot = process.env.BOT_USER_UUID;    

if (!app || !key || !bot) {
  console.error('Set CHAT_API_KEY, CHAT_TOKEN, CHAT_USER_ID first.');
  process.exit(1);
}

const host = `${app}.apiclient-us.cometchat.io`;
const headers = { appid: app, apikey: key, 'content-type': 'application/json' };
const url = (parts, params) => buildUrl(host, parts, params);

(async () => {
  const body = JSON.stringify({ uid: bot, name: 'Allen' });
  const res = await makeRequest(url(['v3.0','users']), { method: 'POST', body, headers });
  console.log('Create bot result:', res?.data || res);
})().catch(e => {
  console.error('Create bot error:', e?.response?.status, e?.response?.data || e?.message);
  process.exit(1);
});
