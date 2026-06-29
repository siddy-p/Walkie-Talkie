import { io, Socket } from 'socket.io-client';
import { API_URL } from './api';
import { useChatStore, Message } from '../state/chatStore';

let socket: Socket | null = null;

export const getSocket = (): Socket | null => socket;

export const connectSocket = (token: string) => {
  if (socket) return;

  socket = io(API_URL, {
    query: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });

  socket.on('connect', () => {
    console.log('⚡ Socket.io connected to server');
  });

  // Listen for incoming messages
  socket.on('receive_message', (message: Message) => {
    console.log('📥 Received message:', message);
    const chatStore = useChatStore.getState();
    chatStore.addMessage(message.chatId, message);
    
    // If we have this chat open, automatically mark the message as read
    if (chatStore.activeChatId === message.chatId) {
      socket?.emit('read_messages', { chatId: message.chatId, senderId: message.senderId });
    }
  });

  // Listen for message status updates (sent -> delivered -> read)
  socket.on('message_status', ({ messageId, chat_id, status }) => {
    console.log('📈 Message status update:', messageId, status);
    useChatStore.getState().updateMessageStatus(chat_id, messageId, status);
  });

  // Listen for user online status changes
  socket.on('user_status', ({ userId, status }) => {
    useChatStore.getState().setOnlineStatus(userId, status);
  });

  // Listen for typing indicators
  socket.on('typing', ({ chatId, userId, isTyping }) => {
    useChatStore.getState().setUserTyping(chatId, userId, isTyping);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket.io disconnected');
  });
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

// Emit actions helpers
export const emitSendMessage = (message: Omit<Message, 'senderId' | 'status' | 'timestamp'> & { recipientId: string }) => {
  if (socket) {
    socket.emit('send_message', message);
  }
};

export const emitTyping = (chatId: string, isTyping: boolean) => {
  if (socket) {
    socket.emit('typing', { chatId, isTyping });
  }
};

export const emitReadMessages = (chatId: string, senderId: string) => {
  if (socket) {
    socket.emit('read_messages', { chatId, senderId });
  }
};
