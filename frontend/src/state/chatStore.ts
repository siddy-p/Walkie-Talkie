import { create } from 'zustand';
import axios from 'axios';
import { API_URL } from '../services/api';
import { useAuthStore } from './authStore';

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'location';
  status: 'sent' | 'delivered' | 'read';
  timestamp: number;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  latitude?: number;
  longitude?: number;
}

export interface Chat {
  id: string;
  type: 'direct' | 'group';
  name: string;
  participants: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string;
  }[];
  lastMessage: Message | null;
}

interface ChatState {
  chats: Chat[];
  messages: Record<string, Message[]>; // chatId -> messages array
  activeChatId: string | null;
  onlineUsers: Record<string, 'online' | 'offline'>;
  typingStatus: Record<string, Record<string, boolean>>; // chatId -> userId -> isTyping
  isLoading: boolean;
  
  loadChats: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  setActiveChat: (chatId: string | null) => void;
  addMessage: (chatId: string, message: Message) => void;
  updateMessageStatus: (chatId: string, messageId: string, status: 'sent' | 'delivered' | 'read') => void;
  setOnlineStatus: (userId: string, status: 'online' | 'offline') => void;
  setUserTyping: (chatId: string, userId: string, isTyping: boolean) => void;
  createChat: (recipientId: string, recipientName: string) => Promise<any>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  messages: {},
  activeChatId: null,
  onlineUsers: {},
  typingStatus: {},
  isLoading: false,

  loadChats: async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    set({ isLoading: true });
    try {
      const response = await axios.get(`${API_URL}/api/chats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      set({ chats: response.data, isLoading: false });
    } catch (err) {
      console.error("Load chats error:", err);
      set({ chats: [], isLoading: false });
    }
  },

  createChat: async (recipientId: string, recipientName: string) => {
    const token = useAuthStore.getState().token;
    if (!token) throw new Error("No auth token");

    try {
      const response = await axios.post(
        `${API_URL}/api/chats`,
        { recipientId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data; // returns { chatId, existing }
    } catch (err) {
      console.error("Create chat error:", err);
      throw err;
    }
  },

  loadMessages: async (chatId) => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    try {
      const response = await axios.get(`${API_URL}/api/sync/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // The history endpoint gets all sync events, but we can also fetch messages.
      // Since messages are saved inside SQLite, we pull messages for this chat
      // We will make a call or fall back to local stored messages.
      // Let's call the message REST endpoint:
      // Wait, in server.js we save messages. Let's make sure we can fetch them.
      // We can add a GET route in server.js, but let's query the API or fall back:
      // We can query messages via a REST endpoint if we create one, or handle it via WebSocket.
      // Let's create an endpoint GET /api/messages/:chatId in auth or sync routes, 
      // or we can query it directly. Let's create an endpoint in our sync/auth routes.
      // Let's use standard axios to get messages. We can fetch `/api/sync/messages/${chatId}`.
      // Let's make sure the client gets the message list:
      const responseMessages = await axios.get(`${API_URL}/api/sync/messages/${chatId}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => ({ data: [] })); // Fallback if server doesn't respond or returns error
      
      set((state) => ({
        messages: {
          ...state.messages,
          [chatId]: responseMessages.data || []
        }
      }));
    } catch (err) {
      console.error("Load messages error:", err);
    }
  },

  setActiveChat: (chatId) => {
    set({ activeChatId: chatId });
  },

  addMessage: (chatId, message) => {
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      // Prevent duplicates
      if (chatMessages.some((m) => m.id === message.id)) {
        return state;
      }
      
      const newMessages = [...chatMessages, message].sort((a,b) => a.timestamp - b.timestamp);
      
      // Update last message in the chat list
      const updatedChats = state.chats.map((c) => {
        if (c.id === chatId) {
          return { ...c, lastMessage: message };
        }
        return c;
      });

      return {
        messages: {
          ...state.messages,
          [chatId]: newMessages
        },
        chats: updatedChats
      };
    });
  },

  updateMessageStatus: (chatId, messageId, status) => {
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      const updatedMessages = chatMessages.map((m) => {
        if (m.id === messageId) {
          return { ...m, status };
        }
        return m;
      });

      const updatedChats = state.chats.map((c) => {
        if (c.id === chatId && c.lastMessage && c.lastMessage.id === messageId) {
          return { ...c, lastMessage: { ...c.lastMessage, status } };
        }
        return c;
      });

      return {
        messages: {
          ...state.messages,
          [chatId]: updatedMessages
        },
        chats: updatedChats
      };
    });
  },

  setOnlineStatus: (userId, status) => {
    set((state) => ({
      onlineUsers: {
        ...state.onlineUsers,
        [userId]: status
      }
    }));
  },

  setUserTyping: (chatId, userId, isTyping) => {
    set((state) => {
      const chatTyping = state.typingStatus[chatId] || {};
      return {
        typingStatus: {
          ...state.typingStatus,
          [chatId]: {
            ...chatTyping,
            [userId]: isTyping
          }
        }
      };
    });
  }
}));
