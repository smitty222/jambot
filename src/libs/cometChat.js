// ========== Helpers ==========

export const buildHeaders = () => ({
  'Content-Type': 'application/json',
  appid: process.env.COMETCHAT_APP_ID,
  authToken: process.env.TTL_USER_TOKEN
});

export const buildApiKeyHeaders = () => ({
  'Content-Type': 'application/json',
  appid: process.env.COMETCHAT_APP_ID,
  apiKey: process.env.COMETCHAT_API_KEY
});

export const buildUrl = (host, paths, searchParams = []) => {
  const url = new URL(`https://${host}/${paths.join('/')}`);
  for (const [key, value] of searchParams) {
    url.searchParams.append(key, value);
  }
  return url.toString();
};

export const makeRequest = async (url, options = {}) => {
  const finalOptions = {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body || undefined
  };

  const response = await fetch(url, finalOptions);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const err = new Error(`HTTP ${response.status}`);
    err.status = response.status;
    err.response = errorBody;
    throw err;
  }

  return response.json();
};

// ========== Chat Functions ==========

export const joinChat = async (groupUUID) => {
  const headers = buildHeaders();
  const body = {
    guid: groupUUID,
    joinedBy: 'api',
    type: 'public'
  };

  const url = buildUrl(
    `${process.env.COMETCHAT_APP_ID}.api-us.cometchat.io`,
    ['v3.0', 'groups', 'join']
  );

  try {
    const response = await makeRequest(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    console.log(`✅ Joined group chat: ${groupUUID}`);
    return response;
  } catch (error) {
    console.error(`❌ Failed to join group ${groupUUID}:`, error.response || error.message);
    throw error;
  }
};

export const getMessages = async (roomOrUserId, fromTimestamp, receiverType = 'group') => {
  const headers = buildHeaders();
  const messageLimit = 50;

  const searchParams = [
    ['per_page', messageLimit],
    ['hideMessagesFromBlockedUsers', 0],
    ['unread', 0],
    ['withTags', 0],
    ['hideDeleted', 0],
    ['sentAt', fromTimestamp],
    ['affix', 'append']
  ];

  let paths;
  if (receiverType === 'group') {
    paths = ['v3.0', 'groups', roomOrUserId, 'messages'];
  } else if (receiverType === 'user') {
    paths = ['v3.0', 'users', roomOrUserId, 'messages'];
  } else {
    throw new Error(`Invalid receiverType "${receiverType}"`);
  }

  const url = buildUrl(`${process.env.COMETCHAT_APP_ID}.api-us.cometchat.io`, paths, searchParams);

  try {
    const response = await makeRequest(url, { headers });
    return response;
  } catch (error) {
    console.error(`❌ Failed to get messages for ${receiverType} ${roomOrUserId}:`, error.message);
    throw error;
  }
};

export const sendDirectMessage = async (receiverUUID, messageText) => {
  const headers = buildHeaders();

  const body = {
    receiver: receiverUUID,
    receiverType: 'user',
    category: 'message',
    type: 'text',
    data: {
      text: messageText
    }
  };

  const url = buildUrl(
    `${process.env.COMETCHAT_APP_ID}.api-us.cometchat.io`,
    ['v3.0', 'messages']
  );

  try {
    const response = await makeRequest(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    console.log(`📩 Sent DM to ${receiverUUID}: ${messageText}`);
    return response;
  } catch (error) {
    console.error(`❌ Error sending DM to ${receiverUUID}:`, error.response || error.message);
    throw error;
  }
};

export const sendGroupMessage = async (groupUUID, messageText) => {
  const headers = buildHeaders();

  const body = {
    receiver: groupUUID,
    receiverType: 'group',
    category: 'message',
    type: 'text',
    data: {
      text: messageText
    }
  };

  const url = buildUrl(
    `${process.env.COMETCHAT_APP_ID}.api-us.cometchat.io`,
    ['v3.0', 'messages']
  );

  try {
    const response = await makeRequest(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    console.log(`📢 Sent group message to ${groupUUID}: ${messageText}`);
    return response;
  } catch (error) {
    console.error(`❌ Error sending group message to ${groupUUID}:`, error.response || error.message);
    throw error;
  }
};
