// src/libs/cometchat.js
import { v4 as uuidv4 } from 'uuid';
import { buildUrl, makeRequest } from '../utils/networking.js';

const startTimeStamp = Math.floor(Date.now() / 1000);

/* ────────────────────────────────────────────────────────────────
 * Headers / Auth
 * ──────────────────────────────────────────────────────────────── */
const baseHeaders = () => ({
  appid: process.env.CHAT_API_KEY,
  authtoken: process.env.CHAT_TOKEN,
  apikey: process.env.CHAT_TOKEN,
  dnt: 1,
  origin: 'https://tt.live',
  referer: 'https://tt.live/',
  sdk: 'javascript@3.0.10'
});

/* ────────────────────────────────────────────────────────────────
 * Utils
 * ──────────────────────────────────────────────────────────────── */
export function toSec(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n)) return 0;
  return n > 2e10 ? Math.floor(n / 1000) : Math.floor(n);
}

const normalizeHex = (v) => {
  if (!v) return '#FFFFFFFF';
  let s = String(v).trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (s.length === 6) s += 'FF';
  if (s.length !== 8) s = 'FFFFFFFF';
  return `#${s.toUpperCase()}`;
};

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

const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

const getMessageId = (m) =>
  m?.id ?? m?._id ?? m?.guid ?? m?.messageId ?? m?.meta?.id ?? m?.data?.id ?? null;

const mergeUniqueById = (a = [], b = []) => {
  const out = [...a];
  const seen = new Set(a.map(getMessageId).filter(Boolean));
  for (const item of b) {
    const id = getMessageId(item);
    if (!id || !seen.has(id)) {
      out.push(item);
      if (id) seen.add(id);
    }
  }
  return out;
};

// Best-effort timestamp extractor for cursoring DM polls
const dmTime = (m) => {
  const cands = [
    m?.sentAt, m?.sent_at,
    m?.data?.sentAt, m?.data?.sent_at,
    m?.updatedAt, m?.createdAt, m?.data?.createdAt
  ];
  const nums = cands.map(toSec).filter(Boolean);
  return nums.length ? Math.max(...nums) : 0;
};

// Parse a comma-separated env string into a unique list
const parseEnvList = (v) => uniq(String(v || '').split(',').map(s => s.trim()));

/* ────────────────────────────────────────────────────────────────
 * Live Chat Identity
 * ──────────────────────────────────────────────────────────────── */
let chatIdentity = {
  avatarId: process.env.CHAT_AVATAR_ID || 'lovable-pixel',
  userName: process.env.CHAT_NAME || 'Allen',
  userUuid: process.env.CHAT_USER_ID,
  color: normalizeHex(process.env.CHAT_COLOUR || process.env.CHAT_COLOR || '#FF4D97')
};

export function setChatIdentity({ avatarId, userName, userUuid, color } = {}) {
  if (avatarId) chatIdentity.avatarId = avatarId;
  if (userName) chatIdentity.userName = userName;
  if (userUuid) chatIdentity.userUuid = userUuid;
  if (color)    chatIdentity.color    = normalizeHex(color);
}

export function getChatIdentity() {
  return { ...chatIdentity };
}

/* ────────────────────────────────────────────────────────────────
 * Send message (group or user)
 * ──────────────────────────────────────────────────────────────── */
export const postMessage = async (options) => {
  const headers = baseHeaders();
  const paths = ['v3.0', 'messages'];

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
    userUuid: ident.userUuid,
    badges: ['VERIFIED', 'STAFF'],
    id: uuidv4()
  };

  if (options.mentions) {
    chatMessageMetadata.mentions = options.mentions.map((m) => ({
      start: m.position,
      userNickname: m.nickname,
      userUuid: m.userId
    }));
  }
  if (options.customData?.songs) chatMessageMetadata.songs = options.customData.songs;

  let type = 'text';
  const data = {};
  if (options.images || options.gifs) {
    type = 'image';
    const media = options.images || options.gifs;
    data.attachments = media.map((url) => {
      const filename = url.split('/').pop() || 'image';
      const ext = (filename.split('.').pop() || 'jpeg').toLowerCase();
      const mimeType = ext === 'gif' ? 'image/gif' : `image/${ext}`;
      return { url, name: filename, mimeType, extension: ext, size: 'unknown' };
    });
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
  return makeRequest(url, { method: 'POST', body: JSON.stringify(payload) }, headers);
};

export const sendDirectMessage = async (receiverUUID, message, options = {}) => {
  if (!receiverUUID) throw new Error('sendDirectMessage: receiverUUID is required');
  return postMessage({
    message,
    receiverType: 'user',
    receiver: receiverUUID,
    images: options.images,
    gifs: options.gifs,
    mentions: options.mentions,
    customData: options.customData,
    identity: options.identity,
    color: options.color,
    disableDedupe: options.disableDedupe ?? false
  });
};

/* ────────────────────────────────────────────────────────────────
 * Join group
 * ──────────────────────────────────────────────────────────────── */
export const joinChat = async (roomId) => {
  const headers = baseHeaders();
  const url = buildUrl(`${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`, ['v3.0', 'groups', roomId, 'members']);
  return makeRequest(url, { headers, method: 'POST' });
};

/* ────────────────────────────────────────────────────────────────
 * Conversations (DM) helpers
 * ──────────────────────────────────────────────────────────────── */
const _convCache = new Map(); // peerUid -> conversationId

function extractConversationId(items, botUid, peerUid) {
  for (const c of items) {
    const cid = c?.conversationId || c?.conversation_id || c?.id;
    if (!cid) continue;

    const peer =
      c?.conversationWith?.uid ||
      c?.withUser?.uid ||
      c?.peer?.uid ||
      (Array.isArray(c?.participants) ? c.participants.find(p => p?.uid && p.uid !== botUid)?.uid : null);

    const type = c?.conversationType || c?.type;
    if (type && String(type).toLowerCase() !== 'user') continue;

    if (!peerUid || peer === peerUid) return cid;
    if (String(cid).includes(peerUid) && String(cid).includes(botUid)) return cid;
  }
  return null;
}

async function lookupConversationId(peerUid) {
  if (!peerUid) return null;
  if (_convCache.has(peerUid)) return _convCache.get(peerUid) || null;

  const headers = baseHeaders();
  const host = `${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`;
  const botUid = process.env.CHAT_USER_ID;
  headers.onBehalfOf = botUid;

  const attempts = [];
  const add = (label, path, params) => attempts.push({
    label, url: buildUrl(host, path, params)
  });

  // Tight filters first
  add('users/{bot}/conversations?withUser',
    ['v3.0', 'users', botUid, 'conversations'],
    [['conversationType', 'user'], ['withUser', peerUid], ['limit', 50]]
  );
  add('conversations?uid&withUser',
    ['v3.0', 'conversations'],
    [['conversationType', 'user'], ['uid', botUid], ['withUser', peerUid], ['limit', 50]]
  );

  // Opposite direction
  add('users/{peer}/conversations?withUser',
    ['v3.0', 'users', peerUid, 'conversations'],
    [['conversationType', 'user'], ['withUser', botUid], ['limit', 50]]
  );

  // Broad list then filter client-side
  add('users/{bot}/conversations (broad)',
    ['v3.0', 'users', botUid, 'conversations'],
    [['conversationType', 'user'], ['limit', 100]]
  );

  for (const a of attempts) {
    try {
      const res = await makeRequest(a.url, { headers });
      const items = normalizeMessagesArray(res);
      const cid = extractConversationId(items, botUid, peerUid);
      if (cid) {
        _convCache.set(peerUid, cid);
        return cid;
      }
    } catch (e) {
      console.error(`[CometChat] ← GET error (${a.label})`, e);
    }
  }

  _convCache.set(peerUid, null);
  return null;
}

/* ────────────────────────────────────────────────────────────────
 * Fetch messages (group or DM)
 * Prefers conversationId for DMs; falls back to other variants.
 * ──────────────────────────────────────────────────────────────── */
export const getMessages = async (
  roomOrUserId,
  fromTimestamp = startTimeStamp,
  receiverType = 'group',
  otherUserId // DM peer (recommended)
) => {
  const headers = baseHeaders();
  const host = `${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`;
  const since = Math.max(0, toSec(fromTimestamp) - 30);
  const botUid = process.env.CHAT_USER_ID;

  if (receiverType === 'group') {
    const url = buildUrl(host, ['v3.0', 'groups', roomOrUserId, 'messages'], [
      ['per_page', 50],
      ['hideMessagesFromBlockedUsers', 0],
      ['unread', 0],
      ['withTags', 0],
      ['hideDeleted', 0],
      ['fromTimestamp', since],
      ['category', 'message']
    ]);
    const res = await makeRequest(url, { headers });
    return normalizeMessagesArray(res);
  }

  if (receiverType === 'user') {
    headers.onBehalfOf = botUid;

    // Figure out which peer we should poll for
    const peer =
      otherUserId ||
      process.env.CHAT_OWNER_ID ||
      process.env.CHAT_TEST_USER_ID ||
      process.env.CHAT_REPLY_ID ||
      null;

    const peerList = uniq([peer]).filter(Boolean);

    // If we know the peer, try conversationId-first with short-circuit
    if (peerList.length) {
      for (const p of peerList) {
        const cid = await lookupConversationId(p);
        if (cid) {
          // Phase 1: /messages?conversationId=...
          const phase1 = [];
          const add1 = (label, path, params) => phase1.push({ label, url: buildUrl(host, path, params) });

          add1('messages?conversationId&fromTimestamp',
            ['v3.0', 'messages'],
            [['conversationId', cid], ['fromTimestamp', since], ['affix', 'append'], ['limit', 100], ['category', 'message']]
          );
          add1('messages?conversationId&sentAt',
            ['v3.0', 'messages'],
            [['conversationId', cid], ['sentAt', since], ['affix', 'append'], ['limit', 100], ['category', 'message']]
          );

          let merged = [];
          for (const a of phase1) {
            try {
              const res = await makeRequest(a.url, { headers });
              const out = normalizeMessagesArray(res);
              merged = mergeUniqueById(merged, out);
            } catch (e) {
              console.error(`[CometChat] ← GET error (${a.label})`, e);
            }
          }

          // Short-circuit if phase 1 produced any results
          if (merged.length) return merged;

          // Phase 2: /conversations/{id}/messages ...
          const phase2 = [];
          const add2 = (label, path, params) => phase2.push({ label, url: buildUrl(host, path, params) });

          add2('conversations/{id}/messages?fromTimestamp',
            ['v3.0', 'conversations', cid, 'messages'],
            [['fromTimestamp', since], ['affix', 'append'], ['limit', 100], ['category', 'message']]
          );
          add2('conversations/{id}/messages?sentAt',
            ['v3.0', 'conversations', cid, 'messages'],
            [['sentAt', since], ['affix', 'append'], ['limit', 100], ['category', 'message']]
          );

          for (const a of phase2) {
            try {
              const res = await makeRequest(a.url, { headers });
              const out = normalizeMessagesArray(res);
              merged = mergeUniqueById(merged, out);
            } catch (e) {
              console.error(`[CometChat] ← GET error (${a.label})`, e);
            }
          }

          if (merged.length) return merged;
        }
      }
    }

    // Fallback: legacy DM shapes
    const attempts = [];
    const add = (label, path, params) => attempts.push({
      label, url: buildUrl(host, path, params)
    });

    const peers = peerList.length ? peerList : [null]; // null → broad inbox fallback

    for (const p of peers) {
      if (p) {
        // Peer inbox
        add('users/{other}/messages?fromTimestamp',
          ['v3.0', 'users', p, 'messages'],
          [['fromTimestamp', since], ['affix', 'append'], ['limit', 100], ['withTags', 0], ['hideDeleted', 0], ['category', 'message']]
        );
        add('users/{other}/messages?sentAt',
          ['v3.0', 'users', p, 'messages'],
          [['sentAt', since], ['affix', 'append'], ['limit', 100], ['withTags', 0], ['hideDeleted', 0], ['category', 'message']]
        );

        // Bot inbox filtered by peer
        add('users/{bot}/messages?withUser={other}&fromTimestamp',
          ['v3.0', 'users', botUid, 'messages'],
          [['withUser', p], ['fromTimestamp', since], ['affix', 'append'], ['limit', 100], ['withTags', 0], ['hideDeleted', 0], ['category', 'message']]
        );
        add('users/{bot}/messages?withUser={other}&sentAt',
          ['v3.0', 'users', botUid, 'messages'],
          [['withUser', p], ['sentAt', since], ['affix', 'append'], ['limit', 100], ['withTags', 0], ['hideDeleted', 0], ['category', 'message']]
        );

        // Generic messages filters
        add('messages?receiverType=user&withUser={other}&sentAt',
          ['v3.0', 'messages'],
          [['receiverType', 'user'], ['withUser', p], ['sentAt', since], ['affix', 'append'], ['limit', 100], ['category', 'message']]
        );
        add('messages?receiverType=user&uid={bot}&withUser={other}&sentAt',
          ['v3.0', 'messages'],
          [['receiverType', 'user'], ['uid', botUid], ['withUser', p], ['sentAt', since], ['affix', 'append'], ['limit', 100], ['category', 'message']]
        );
        add('messages?receiverType=user&uid={other}&withUser={bot}&sentAt',
          ['v3.0', 'messages'],
          [['receiverType', 'user'], ['uid', p], ['withUser', botUid], ['sentAt', since], ['affix', 'append'], ['limit', 100], ['category', 'message']]
        );
      } else {
        // Broad inbox (no peer yet)
        add('users/{bot}/messages?fromTimestamp',
          ['v3.0', 'users', botUid, 'messages'],
          [['fromTimestamp', since], ['affix', 'append'], ['limit', 100], ['withTags', 0], ['hideDeleted', 0], ['category', 'message']]
        );
        add('users/{bot}/messages?sentAt',
          ['v3.0', 'users', botUid, 'messages'],
          [['sentAt', since], ['affix', 'append'], ['limit', 100], ['withTags', 0], ['hideDeleted', 0], ['category', 'message']]
        );
      }
    }

    for (const a of attempts) {
      try {
        const res = await makeRequest(a.url, { headers });
        const out = normalizeMessagesArray(res);
        if (out.length) return out;
      } catch (e) {
        console.error(`[CometChat] ← GET error (${a.label})`, e);
      }
    }

    return [];
  }

  throw new Error(`getMessages: invalid receiverType "${receiverType}"`);
};

/* ────────────────────────────────────────────────────────────────
 * NEW: Multi-peer DM helpers (for polling multiple users)
 * ──────────────────────────────────────────────────────────────── */

/**
 * Return the configured DM peers from env.
 * CHAT_DM_PEERS takes precedence, then CHAT_OWNER_ID / CHAT_TEST_USER_ID / CHAT_REPLY_ID.
 */
export function getConfiguredDMPeers() {
  const envList = parseEnvList(process.env.CHAT_DM_PEERS);
  if (envList.length) return envList;
  return uniq(
    [process.env.CHAT_OWNER_ID, process.env.CHAT_TEST_USER_ID, process.env.CHAT_REPLY_ID]
      .filter(Boolean)
  );
}

/**
 * Convenience wrapper to fetch DMs for a single peer (keeps your current shape).
 */
export async function getDirectMessagesForPeer(peerUid, fromTimestamp = startTimeStamp) {
  if (!peerUid) return [];
  return getMessages(null, fromTimestamp, 'user', peerUid);
}

/**
 * Batch fetch DMs for many peers with per-peer cursors.
 * @param {string[]} peers - list of peer UUIDs
 * @param {Object} sinceByPeer - map of peer -> unix seconds "since"; optional
 * @param {number} defaultSince - fallback "since" if peer not in sinceByPeer
 * @returns {{ byPeer: Record<string, any[]>, maxTsByPeer: Record<string, number>, flat: any[] }}
 */
export async function getDirectMessagesForPeers(peers = [], sinceByPeer = {}, defaultSince = startTimeStamp) {
  const list = uniq(peers).filter(Boolean);
  const byPeer = {};
  const maxTsByPeer = {};
  let flat = [];

  for (const peer of list) {
    const since = toSec(sinceByPeer[peer] ?? defaultSince);
    const items = await getDirectMessagesForPeer(peer, since);
    byPeer[peer] = items;

    // compute next cursor
    let maxTs = since;
    for (const m of items) {
      const t = dmTime(m);
      if (t > maxTs) maxTs = t;
    }
    maxTsByPeer[peer] = maxTs;

    flat = mergeUniqueById(flat, items);
  }

  return { byPeer, maxTsByPeer, flat };
}
