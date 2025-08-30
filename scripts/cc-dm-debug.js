// scripts/cc-dm-debug.js
import 'dotenv/config';
import { buildUrl, makeRequest } from '../../../Downloads/src/utils/networking.js';

const host = () => `${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`;

const baseHeaders = () => ({
  appid: process.env.CHAT_API_KEY,
  authtoken: process.env.CHAT_TOKEN,
  apikey: process.env.CHAT_TOKEN,
  onBehalfOf: process.env.CHAT_USER_ID,
  dnt: 1,
  origin: 'https://tt.live',
  referer: 'https://tt.live/',
  sdk: 'javascript@3.0.10'
});

function url(pathParts, params) {
  return buildUrl(host(), pathParts, params);
}

async function main() {
  const headers = baseHeaders();
  const uid = process.env.CHAT_USER_ID;
  if (!uid) {
    console.error('CHAT_USER_ID is not set. This must be the CometChat UID of your bot user.');
    process.exit(1);
  }

  console.log('App:', process.env.CHAT_API_KEY);
  console.log('Bot UID (CHAT_USER_ID):', uid);

  // 1) Does this user exist in CometChat?
  try {
    const u = await makeRequest(url(['v3.0','users', uid]), { headers });
    console.log('[users/{uid}] status OK, user found.');
  } catch (e) {
    console.error('[users/{uid}] FAILED. This likely means CHAT_USER_ID is NOT a valid CometChat user in this app.');
    console.error('Error:', e?.response?.status, e?.response?.data || e?.message);
    process.exit(2);
  }

  // 2) Conversations (user)
  try {
    const convUrl = url(['v3.0','users', uid, 'conversations'], [
      ['conversationType','user'],
      ['per_page', 25],
      ['uid', uid]
    ]);
    const convRes = await makeRequest(convUrl, { headers });
    const convs = Array.isArray(convRes?.data?.data) ? convRes.data.data
                : Array.isArray(convRes?.data) ? convRes.data : [];
    console.log(`[conversations] count=${convs.length}`);
    if (convs.length) {
      const first = convs[0];
      console.log('First conversation keys:', Object.keys(first));
      if (first?.lastMessage) {
        console.log('First lastMessage keys:', Object.keys(first.lastMessage));
      }
    }
  } catch (e) {
    console.error('[conversations] error:', e?.response?.status, e?.response?.data || e?.message);
  }

  // 3) Messages where bot is the receiver (sentAt)
  try {
    const since = Math.floor(Date.now()/1000) - 300; // last 5 minutes
    const msgUrl = url(['v3.0','messages'], [
      ['receiverType','user'],
      ['receiver', uid],
      ['sentAt', since],
      ['affix', 'append'],
      ['per_page', 50],
      ['uid', uid]
    ]);
    const msgRes = await makeRequest(msgUrl, { headers });
    const items = Array.isArray(msgRes?.data?.data) ? msgRes.data.data
                : Array.isArray(msgRes?.data) ? msgRes.data
                : Array.isArray(msgRes) ? msgRes : [];
    console.log(`[messages:sentAt] count=${items.length}`);
  } catch (e) {
    console.error('[messages:sentAt] error:', e?.response?.status, e?.response?.data || e?.message);
  }

  // 4) Messages where bot is the receiver (updatedAt)
  try {
    const since = Math.floor(Date.now()/1000) - 300; // last 5 minutes
    const msgUrl = url(['v3.0','messages'], [
      ['receiverType','user'],
      ['receiver', uid],
      ['updatedAt', since],
      ['affix', 'append'],
      ['per_page', 50],
      ['uid', uid]
    ]);
    const msgRes = await makeRequest(msgUrl, { headers });
    const items = Array.isArray(msgRes?.data?.data) ? msgRes.data.data
                : Array.isArray(msgRes?.data) ? msgRes.data
                : Array.isArray(msgRes) ? msgRes : [];
    console.log(`[messages:updatedAt] count=${items.length}`);
  } catch (e) {
    console.error('[messages:updatedAt] error:', e?.response?.status, e?.response?.data || e?.message);
  }

  // 5) v3 user messages (unread)
  try {
    const uMsgUrl = url(['v3','users', uid, 'messages'], [
      ['limit', 50],
      ['unread', 1],
      ['uid', uid]
    ]);
    const uMsgRes = await makeRequest(uMsgUrl, { headers });
    const items = Array.isArray(uMsgRes?.data?.data) ? uMsgRes.data.data
                : Array.isArray(uMsgRes?.data) ? uMsgRes.data
                : Array.isArray(uMsgRes) ? uMsgRes : [];
    console.log(`[v3 user messages (unread)] count=${items.length}`);
  } catch (e) {
    console.error('[v3 user messages] error:', e?.response?.status, e?.response?.data || e?.message);
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error('Fatal:', e?.response?.data || e?.message || e);
  process.exit(1);
});
