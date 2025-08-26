// src/libs/cometchat.js
import { v4 as uuidv4 } from 'uuid';
import { buildUrl, makeRequest } from '../utils/networking.js';

const startTimeStamp = Math.floor(Date.now() / 1000);

/* ────────────────────────────────────────────────────────────────
 * Headers / Auth
 * ──────────────────────────────────────────────────────────────── */
const baseHeaders = () => ({
  appid: process.env.CHAT_API_KEY,
  authtoken: process.env.CHAT_TOKEN, // keep for backward-compat with your infra
  apikey: process.env.CHAT_TOKEN,    // CometChat REST expects "apikey"
  dnt: 1,
  origin: 'https://tt.live',
  referer: 'https://tt.live/',
  sdk: 'javascript@3.0.10'
});

/* ────────────────────────────────────────────────────────────────
 * Utils
 * ──────────────────────────────────────────────────────────────── */
const normalizeHex = (v) => {
  if (!v) return '#FFFFFFFF';
  let s = String(v).trim();
  if (s.startsWith('#')) s = s.slice(1);
  // Accept 6 or 8 hex chars; add alpha if missing
  if (s.length === 6) s += 'FF';
  // Fallback if malformed
  if (s.length !== 8) s = 'FFFFFFFF';
  return `#${s.toUpperCase()}`;
};

/** Ensure timestamp is in SECONDS (down-convert ms if needed) */
function toSec(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n)) return 0;
  return n > 2e10 ? Math.floor(n / 1000) : Math.floor(n);
}

/** Unwrap common response shapes into a plain messages array */
function normalizeMessagesArray(res) {
  const body = res?.data ?? res;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data?.data)) return body.data.data;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.messages)) return body.messages;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.results)) return body.results;
  if (body && typeof body === 'object' && (body.id || body.text || body.message)) return [body];
  return [];
}

/* ────────────────────────────────────────────────────────────────
 * Live Chat Identity (avatarId + color used in message metadata)
 *   - Can be changed at runtime via setChatIdentity(...)
 *   - Defaults come from env for backward compatibility
 * Env keys supported:
 *   CHAT_AVATAR_ID, CHAT_NAME, CHAT_USER_ID, CHAT_COLOUR or CHAT_COLOR
 * ──────────────────────────────────────────────────────────────── */
let chatIdentity = {
  avatarId: process.env.CHAT_AVATAR_ID || 'lovable-pixel',
  userName: process.env.CHAT_NAME || 'Allen',
  userUuid: process.env.CHAT_USER_ID,
  color: normalizeHex(process.env.CHAT_COLOUR || process.env.CHAT_COLOR || '#FF4D97')
};

/** Update the identity used by postMessage() going forward */
export function setChatIdentity({ avatarId, userName, userUuid, color } = {}) {
  if (avatarId) chatIdentity.avatarId = avatarId;
  if (userName) chatIdentity.userName = userName;
  if (userUuid) chatIdentity.userUuid = userUuid;
  if (color)    chatIdentity.color    = normalizeHex(color);
}

/** Read-only clone of current identity */
export function getChatIdentity() {
  return { ...chatIdentity };
}

/* ────────────────────────────────────────────────────────────────
 * Send message (group or user DM)
 *   options:
 *     - room: group GUID (for group messages)
 *     - receiverType: 'group' | 'user' (default 'group')
 *     - receiver: user UUID (for DMs)
 *     - message: string
 *     - images | gifs: string[] (auto builds attachments)
 *     - mentions: [{ position, nickname, userId }]
 *     - customData: { songs?: any }
 *     - identity: { avatarId?, userName?, userUuid?, color? } // overrides for this call
 *     - color: '#RRGGBB[AA]' // quick override for this call
 * ──────────────────────────────────────────────────────────────── */
export const postMessage = async (options) => {
  const headers = baseHeaders();
  const paths = ['v3.0', 'messages'];

  // Allow per-call identity override
  const override = options.identity || {};
  const ident = {
    avatarId: override.avatarId ?? chatIdentity.avatarId,
    userName: override.userName ?? chatIdentity.userName,
    userUuid: override.userUuid ?? chatIdentity.userUuid,
    color:    normalizeHex(override.color ?? options.color ?? chatIdentity.color)
  };

  const chatMessageMetadata = {
    message: options.message || '',
    avatarId: ident.avatarId,
    userName: ident.userName,
    color: ident.color,
    mentions: [],
    userUuid: ident.userUuid, // CometChat UID of the bot
    badges: ['VERIFIED', 'STAFF'],
    id: uuidv4()
  };

  if (options.mentions) {
    chatMessageMetadata.mentions = options.mentions.map((mention) => ({
      start: mention.position,
      userNickname: mention.nickname,
      userUuid: mention.userId
    }));
  }

  if (options.customData?.songs) {
    chatMessageMetadata.songs = options.customData.songs;
  }

  let type = 'text';
  const data = {};

  if (options.images || options.gifs) {
    type = 'image';
    data.attachments = [];
    const mediaUrls = options.images || options.gifs;
    for (const url of mediaUrls) {
      const filename = url.split('/').pop();
      const ext = (filename?.split('.').pop() || '').toLowerCase();
      const mimeType = ext === 'gif' ? 'image/gif' : `image/${ext || 'jpeg'}`;
      data.attachments.push({ url, name: filename || 'image', mimeType, extension: ext, size: 'unknown' });
    }
  } else {
    data.text = options.message || '';
  }

  data.metadata = { chatMessage: chatMessageMetadata };

  const payload = {
    type,
    receiverType: options.receiverType === 'user' ? 'user' : 'group',
    category: 'message',
    receiver: options.receiverType === 'user' ? options.receiver : options.room,
    data
  };

  const url = buildUrl(`${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`, paths);
  const messageResponse = await makeRequest(
    url,
    { method: 'POST', body: JSON.stringify(payload) },
    headers
  );

  return { message: options.message, messageResponse };
};

/* ────────────────────────────────────────────────────────────────
 * Direct message (user → user)
 * ──────────────────────────────────────────────────────────────── */
export const sendDirectMessage = async (receiverUUID, message) => {
  try {
    return await postMessage({ message, receiver: receiverUUID, receiverType: 'user' });
  } catch (error) {
    console.error(`Failed to send direct message to ${receiverUUID}: ${error.message}`);
  }
};

/* ────────────────────────────────────────────────────────────────
 * Join group
 * ──────────────────────────────────────────────────────────────── */
export const joinChat = async (roomId) => {
  const headers = baseHeaders();
  const paths = ['v3.0', 'groups', roomId, 'members'];
  const url = buildUrl(`${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`, paths);
  return makeRequest(url, { headers, method: 'POST' });
};

/* ────────────────────────────────────────────────────────────────
 * Fetch messages (group or bot DM inbox)
 *  - For groups: GET /v3.0/groups/{guid}/messages
 *  - For user DMs: GET /v3.0/users/{CHAT_USER_ID}/messages with onBehalfOf=<CHAT_USER_ID>
 * Always returns a plain array.
 * ──────────────────────────────────────────────────────────────── */
export const getMessages = async (roomOrUserId, fromTimestamp = startTimeStamp, receiverType = 'group') => {
  const headers = baseHeaders();
  const messageLimit = 50;
  const since = toSec(fromTimestamp);

  let paths;
  const searchParams = [
    ['per_page', messageLimit],
    ['hideMessagesFromBlockedUsers', 0],
    ['unread', 0],
    ['withTags', 0],
    ['hideDeleted', 0],
    ['sentAt', since],
    ['affix', 'append']
  ];

  if (receiverType === 'group') {
    // group GUID should be a CometChat group id (your ROOM_UUID)
    paths = ['v3.0', 'groups', roomOrUserId, 'messages'];
  } else if (receiverType === 'user') {
    // IMPORTANT:
    //  - Use the CometChat UID of the *bot user* here
    //  - Add onBehalfOf so the REST API acts as that user
    const botChatUID = process.env.CHAT_USER_ID;
    paths = ['v3.0', 'users', botChatUID, 'messages'];
    headers.onBehalfOf = botChatUID;
  } else {
    throw new Error(`getMessages: invalid receiverType "${receiverType}"`);
  }

  const url = buildUrl(`${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`, paths, searchParams);
  const res = await makeRequest(url, { headers });

  return normalizeMessagesArray(res);
};
