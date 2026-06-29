import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Image,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useChatStore, Chat } from '../state/chatStore';
import { useAuthStore } from '../state/authStore';
import { LogOut, MessageSquare, Plus, X, Search, Settings as SettingsIcon } from 'lucide-react-native';
import api from '../services/api';

export default function ChatListScreen() {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuthStore();
  const { chats, onlineUsers, loadChats, isLoading, createChat } = useChatStore();
  const [refreshing, setRefreshing] = useState(false);

  // Add contact modal state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [startingChat, setStartingChat] = useState(false);

  useEffect(() => {
    loadChats();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadChats();
    setRefreshing(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError('');
    setSearchResult(null);
    try {
      const res = await api.get(`/api/auth/find-user?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchResult(res.data);
    } catch (err: any) {
      setSearchError(err.response?.data?.error || 'User not found');
    } finally {
      setSearching(false);
    }
  };

  const handleStartChat = async () => {
    if (!searchResult) return;
    setStartingChat(true);
    try {
      await createChat(searchResult.id, searchResult.displayName);
      await loadChats();
      setAddModalVisible(false);
      setSearchQuery('');
      setSearchResult(null);
    } catch (e) {
      setSearchError('Failed to start chat');
    } finally {
      setStartingChat(false);
    }
  };

  const openAddModal = () => {
    setSearchQuery('');
    setSearchResult(null);
    setSearchError('');
    setAddModalVisible(true);
  };

  const navigateToChat = (chat: Chat) => {
    // Set active chat in state
    useChatStore.getState().setActiveChat(chat.id);
    navigation.navigate('ChatDetail', {
      chatId: chat.id,
      recipientName: chat.name,
      recipientId: chat.participants[0]?.id
    });
  };

  const renderChatItem = ({ item }: { item: Chat }) => {
    const recipient = item.participants[0];
    const isOnline = onlineUsers[recipient?.id] === 'online';
    const lastMsg = item.lastMessage;
    
    // Check if the last message is unread and sent by the other user
    const isUnread = lastMsg && lastMsg.status !== 'read' && lastMsg.senderId !== user?.id;

    return (
      <TouchableOpacity
        style={styles.chatCard}
        onPress={() => navigateToChat(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <Image source={{ uri: recipient?.avatar_url || 'https://api.dicebear.com/7.x/initials/svg?seed=U' }} style={styles.avatar} />
          <View style={[styles.statusDot, { backgroundColor: isOnline ? '#10b981' : '#64748b' }]} />
        </View>
        
        <View style={styles.chatDetails}>
          <View style={styles.chatHeaderRow}>
            <Text style={styles.chatName}>{item.name}</Text>
            {lastMsg && (
              <Text style={styles.chatTime}>
                {new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
          </View>
          
          <View style={styles.chatBodyRow}>
            <Text
              style={[styles.lastMessage, isUnread && styles.unreadMessageText]}
              numberOfLines={1}
            >
              {lastMsg ? (
                lastMsg.type === 'image' ? '📷 Photo backup payload' :
                lastMsg.type === 'file' ? `📁 Document: ${lastMsg.fileName}` :
                lastMsg.type === 'location' ? '📍 Real-time GPS stream' :
                lastMsg.content
              ) : (
                'Start secure chat stream...'
              )}
            </Text>
            
            {isUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>!</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Sleek Dark Header */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <Image source={{ uri: user?.avatarUrl || 'https://api.dicebear.com/7.x/adventurer/svg?seed=user' }} style={styles.userAvatar} />
          <View style={styles.userText}>
            <Text style={styles.welcomeText}>Walkie-Talkie</Text>
            <Text style={styles.displayNameText}>{user?.displayName}</Text>
          </View>
        </View>
        
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={openAddModal}
            activeOpacity={0.7}
          >
            <Plus {...({ color: "#25d366", size: 20 } as any)} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('SettingsTab')}
            activeOpacity={0.7}
          >
            <SettingsIcon {...({ color: "#94a3b8", size: 20 } as any)} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, styles.logoutBtn]}
            onPress={logout}
            activeOpacity={0.7}
          >
            <LogOut {...({ color: "#ef4444", size: 20 } as any)} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Active Channels</Text>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Syncing channels...</Text>
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MessageSquare {...({ color: "#475569", size: 48, style: styles.emptyIcon } as any)} />
          <Text style={styles.emptyTitle}>No Nodes Connected</Text>
          <Text style={styles.emptyText}>
            Pull down to scan network directory and link with active nodes.
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          renderItem={renderChatItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#3b82f6"
              colors={['#3b82f6']}
            />
          }
        />
      )}

      {/* ── + FAB ── */}
      <TouchableOpacity style={styles.fab} onPress={openAddModal} activeOpacity={0.85}>
        <Plus size={26} color="#fff" />
      </TouchableOpacity>

      {/* ── Add Contact Modal ── */}
      <Modal visible={addModalVisible} animationType="slide" transparent
        onRequestClose={() => setAddModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Chat</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)} style={styles.modalClose}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>Enter a @tag or UUID to find someone</Text>

            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="@username or UUID"
                placeholderTextColor="#475569"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                selectionColor="#25d366"
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
              <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} activeOpacity={0.8}>
                {searching ? <ActivityIndicator size="small" color="#fff" /> : <Search size={18} color="#fff" />}
              </TouchableOpacity>
            </View>

            {searchError ? (
              <Text style={styles.searchError}>{searchError}</Text>
            ) : null}

            {searchResult && (
              <View style={styles.resultCard}>
                <Image source={{ uri: searchResult.avatarUrl }} style={styles.resultAvatar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName}>{searchResult.displayName}</Text>
                  <Text style={styles.resultTag}>@{searchResult.username}</Text>
                  <Text style={styles.resultUuid} numberOfLines={1} ellipsizeMode="middle">
                    {searchResult.uuid}
                  </Text>
                </View>
              </View>
            )}

            {searchResult && (
              <TouchableOpacity style={styles.startChatBtn} onPress={handleStartChat}
                activeOpacity={0.85} disabled={startingChat}>
                {startingChat
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.startChatBtnText}>Start Chat with {searchResult.displayName}</Text>}
              </TouchableOpacity>
            )}

          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090b11',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  userText: {
    marginLeft: 12,
  },
  welcomeText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  displayNameText: {
    fontSize: 16,
    color: '#f8fafc',
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  logoutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    borderColor: 'rgba(239, 68, 68, 0.1)',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  chatCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#090b11',
  },
  chatDetails: {
    flex: 1,
    marginLeft: 14,
  },
  chatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  chatTime: {
    fontSize: 12,
    color: '#64748b',
  },
  chatBodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 13,
    color: '#94a3b8',
    flex: 1,
    marginRight: 8,
  },
  unreadMessageText: {
    color: '#60a5fa',
    fontWeight: '600',
  },
  unreadBadge: {
    backgroundColor: '#3b82f6',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#94a3b8',
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: 64,
  },
  emptyIcon: {
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e2e8f0',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#25d366',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1f2c34',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#e9edef',
  },
  modalClose: {
    padding: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#8696a0',
    marginBottom: 16,
  },
  searchRow: {
    flexDirection: 'row',
    backgroundColor: '#2a3942',
    borderRadius: 12,
    alignItems: 'center',
    paddingLeft: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: '#e9edef',
    fontSize: 15,
  },
  searchBtn: {
    backgroundColor: '#25d366',
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchError: {
    color: '#ef4444',
    fontSize: 13,
    marginBottom: 12,
    paddingLeft: 4,
  },
  resultCard: {
    flexDirection: 'row',
    backgroundColor: '#111b21',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  resultAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 16,
    backgroundColor: '#1f2c34',
  },
  resultName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e9edef',
    marginBottom: 2,
  },
  resultTag: {
    fontSize: 13,
    color: '#25d366',
    fontWeight: '600',
    marginBottom: 4,
  },
  resultUuid: {
    fontSize: 11,
    color: '#8696a0',
    fontFamily: 'monospace',
  },
  startChatBtn: {
    backgroundColor: '#25d366',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startChatBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
