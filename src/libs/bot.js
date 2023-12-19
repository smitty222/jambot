import { SocketClient } from 'ttfm-socket';
import fastJson from 'fast-json-patch';

import { joinChat, getMessages } from './cometchat.js';
import { logger } from '../utils/logging.js';
import { handlers } from '../handlers/index.js';

export class Bot {
  constructor(slug) {
    this.lastMessageIDs = {};
    this.currentTheme = '';
  }

  async connect() {
    logger.debug('Connecting to room');
    await joinChat(process.env.ROOM_UUID);

    this.socket = new SocketClient('https://socket.prod.tt.fm');

    const connection = await this.socket.joinRoom(process.env.TTL_USER_TOKEN, {
      roomUuid: process.env.ROOM_UUID,
    });
    this.state = connection.state;
  }

  async processNewMessages() {
    const response = await getMessages(process.env.ROOM_UUID, this.lastMessageIDs?.fromTimestamp);
    if (response?.data) {
      const messages = response.data;
      if (messages?.length) {
        for (const message in messages) {
          this.lastMessageIDs.fromTimestamp = messages[message].sentAt + 1;
          const customMessage = messages[message]?.data?.customData?.message ?? '';
          if (!customMessage) return;
          const sender = messages[message]?.sender ?? '';
          if ([process.env.CHAT_USER_ID, process.env.CHAT_REPLY_ID].includes(sender)) return;
          handlers.message(
            {
              message: customMessage,
              sender,
              senderName: messages[message]?.data?.customData?.userName,
            },
            process.env.ROOM_UUID
          );
        }
      }
    }
  }

  configureListeners() {
    const self = this;
    logger.debug('Setting up listeners');
    this.socket.on('statefulMessage', (payload) => {
      self.state = fastJson.applyPatch(self.state, payload.statePatch).newDocument;
      logger.debug(`State updated for ${payload.name}`);
      if (handlers[payload.name]) handlers[payload.name](self.state, process.env.ROOM_UUID);
    });
  }

  getSocketInstance() {
    return this.socket;
  }
}
