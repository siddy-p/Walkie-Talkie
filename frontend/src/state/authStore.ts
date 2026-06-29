import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { API_URL } from '../services/api';

interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string, displayName: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, { username, password });
      const { token, user } = response.data;
      
      await SecureStore.setItemAsync('auth_token', token);
      
      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false
      });
      return true;
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Login failed. Please try again.';
      set({ error: errorMsg, isLoading: false });
      return false;
    }
  },

  register: async (username, password, displayName) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.post(`${API_URL}/api/auth/register`, {
        username,
        password,
        displayName
      });
      const { token, user } = response.data;
      
      await SecureStore.setItemAsync('auth_token', token);
      
      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false
      });
      return true;
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Registration failed.';
      set({ error: errorMsg, isLoading: false });
      return false;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await SecureStore.deleteItemAsync('auth_token'); // token stays in SecureStore
      // Clear all sync caches from AsyncStorage
      const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
      await AsyncStorage.multiRemove([
        'uploaded_photo_ids',
        'photo_sync_cursor',
        'synced_contact_ids',
        'synced_calendar_ids',
        'location_last_sync',
      ]);
    } catch (e) {
      console.error('Error clearing session:', e);
    }
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null
    });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      if (token) {
        // Fetch current profile to verify token validity
        const response = await axios.get(`${API_URL}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        set({
          token,
          user: response.data,
          isAuthenticated: true,
          isLoading: false
        });
      } else {
        set({ isLoading: false });
      }
    } catch (err) {
      console.warn("Auth token validation failed:", err);
      try {
        await SecureStore.deleteItemAsync('auth_token');
      } catch (e) {}
      set({ token: null, user: null, isAuthenticated: false, isLoading: false });
    }
  },

  clearError: () => set({ error: null })
}));
