import cache from './cache';
import SignalAddon from './addons/signal';
import { Context, Messenger } from './interfaces';
import TelegramAddon from './addons/telegram';

/**
 * Escapes special characters for MarkdownV2, HTML, or Markdown formats.
 *
 * @param str - The string to escape.
 * @returns The escaped string.
 */
const strictEscape = (str: string): string => {
  const { parse_mode } = cache.config;
  switch (parse_mode) {
    case 'MarkdownV2':
      // Escape all special MarkdownV2 characters
      return str.replace(/([[\]()_*~`>#+\-=\|{}.!\\])/g, '\\$1');
    case 'HTML':
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'); // Escape single quotes
    case 'Markdown':
      // Escape special Markdown characters (square brackets separately for safety)
      return str
        .replace(/([[\]_*`])/g, '\$1')
        .replace(/(\[|\])/g, '\$1');
    default:
      return str.toString();
  }
};

/**
 * Sends a message through the appropriate messenger addon.
 *
 * @param id - The target identifier.
 * @param messenger - The messenger type.
 * @param msg - The message text.
 * @param extra - Extra options (default includes the configured parse mode).
 */
async function sendMessage (
  id: string | number,
  messenger: string,
  msg: string,
  extra: any = { parse_mode: cache.config.parse_mode }
): Promise<string | null> {
  const messengerType = messenger as Messenger;
  // Remove extra spaces
  const cleanedMsg = msg.replace(/ {2,}/g, ' ');
  
  switch (messengerType) {  
    case Messenger.TELEGRAM:
      return await TelegramAddon.getInstance().sendMessage(id, cleanedMsg, extra);
    case Messenger.SIGNAL:
      return await SignalAddon.getInstance().sendMessage(id, cleanedMsg, extra);
    case Messenger.WEB: {
      const socketId = id.toString().split('WEB')[1];
      cache.io.to(socketId).emit('chat_staff', cleanedMsg);
      return null;
    }
    default:
      throw new Error('Invalid messenger type');
  }
};

/**
 * Renames a forum topic (e.g. to reflect a ticket's open/closed status).
 * No-op for non-Telegram messengers.
 *
 * @param chatId - The staff chat id.
 * @param messenger - The messenger type.
 * @param threadId - The forum topic's message_thread_id.
 * @param name - The new topic name.
 */
async function editForumTopicName(
  chatId: string | number,
  messenger: string,
  threadId: number,
  name: string,
): Promise<void> {
  if ((messenger as Messenger) === Messenger.TELEGRAM) {
    await TelegramAddon.getInstance().editForumTopic(chatId, threadId, name);
  }
}

/**
 * Replies to a message within the given context.
 *
 * @param ctx - The message context.
 * @param msgText - The reply text.
 * @param extra - Extra options (default includes the configured parse mode).
 */
const reply = (
  ctx: Context,
  msgText: string,
  extra: any = { parse_mode: cache.config.parse_mode }
): void => {
  // ctx.message is undefined for callback_query updates (e.g. inline button
  // presses) - fall back to the chat the button's message was posted in.
  const chatId = ctx.message?.chat.id ?? ctx.callbackQuery?.message?.chat.id;
  const threadId = ctx.message?.message_thread_id ?? ctx.callbackQuery?.message?.message_thread_id;
  const finalExtra = threadId && extra.message_thread_id === undefined
    ? { ...extra, message_thread_id: threadId }
    : extra;
  sendMessage(chatId, ctx.messenger, msgText, finalExtra);
};

export { strictEscape, sendMessage, reply, editForumTopicName };
