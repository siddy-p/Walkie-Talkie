import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  SafeAreaView,
  ActivityIndicator,
  StatusBar,
  Linking
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useChatStore, Message } from '../state/chatStore';
import { useAuthStore } from '../state/authStore';
import {
  emitSendMessage,
  emitTyping,
  emitReadMessages
} from '../services/socket';
import { pickDeviceFile, getDeviceLocation, uploadFileToBackend } from '../services/nativeSync';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Send,
  Video,
  Paperclip,
  MapPin,
  Camera
} from 'lucide-react-native';
import MessageBubble from '../components/MessageBubble';

export default function ChatDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const { chatId, recipientName, recipientId } = route.params;

  const [text, setText] = useState('');
  const [isTypingLocal, setIsTypingLocal] = useState(false);
  const typingTimeoutRef = useRef<any>(null);
  
  const { user } = useAuthStore();
  const { messages, typingStatus, onlineUsers, addMessage, loadMessages } = useChatStore();
  
  const chatMessages = messages[chatId] || [];
  const isOnline = onlineUsers[recipientId] === 'online';
  const isRecipientTyping = typingStatus[chatId]?.[recipientId] || false;
  
  const flatListRef = useRef<FlatList>(null);

  // Load message history on load
  useEffect(() => {
    loadMessages(chatId);
    
    // Read all existing messages
    emitReadMessages(chatId, recipientId);

    return () => {
      // Clear active chat state
      useChatStore.getState().setActiveChat(null);
    };
  }, [chatId]);

  // Read message when new ones arrive
  useEffect(() => {
    if (chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (lastMsg && lastMsg.senderId !== user?.id && lastMsg.status !== 'read') {
        emitReadMessages(chatId, recipientId);
      }
    }
  }, [chatMessages.length]);

  const handleSend = () => {
    if (!text.trim()) return;

    const messageId = 'msg_' + Math.random().toString(36).substr(2, 9);
    const newMsg: Message = {
      id: messageId,
      chatId,
      senderId: user?.id || '',
      content: text.trim(),
      type: 'text',
      status: 'sent',
      timestamp: Date.now()
    };

    // Optimistically add to store
    addMessage(chatId, newMsg);
    
    // Emit socket message
    emitSendMessage({
      id: messageId,
      chatId,
      recipientId,
      content: text.trim(),
      type: 'text'
    });

    setText('');
    handleTyping(false);
  };

  const handleTyping = (typing: boolean) => {
    if (typing !== isTypingLocal) {
      setIsTypingLocal(typing);
      emitTyping(chatId, typing);
    }

    if (typing) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setIsTypingLocal(false);
        emitTyping(chatId, false);
      }, 3000);
    }
  };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Photo Library permissions are required to share photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      const asset = result.assets[0];
      const messageId = 'msg_' + Math.random().toString(36).substr(2, 9);
      
      // Optimistically show local message
      const tempMsg: Message = {
        id: messageId,
        chatId,
        senderId: user?.id || '',
        content: 'Uploading photo...',
        type: 'image',
        status: 'sent',
        timestamp: Date.now(),
        fileUrl: asset.uri
      };
      addMessage(chatId, tempMsg);

      try {
        const uploadResult = await uploadFileToBackend(
          asset.uri, 
          asset.fileName || 'photo.jpg', 
          asset.mimeType || 'image/jpeg', 
          'photos'
        );
        
        emitSendMessage({
          id: messageId,
          chatId,
          recipientId,
          content: 'Sent a photo',
          type: 'image',
          fileUrl: uploadResult.fileUrl
        });
      } catch (err) {
        console.error("Media upload failed:", err);
        alert('Failed to upload photo. Server connection error.');
      }
    }
  };

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Photo Library permissions are required to share videos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos, // Restrict to Videos only
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      const asset = result.assets[0];
      const messageId = 'msg_' + Math.random().toString(36).substr(2, 9);
      
      // Optimistically show local message
      const tempMsg: Message = {
        id: messageId,
        chatId,
        senderId: user?.id || '',
        content: 'Uploading video...',
        type: 'video' as any,
        status: 'sent',
        timestamp: Date.now(),
        fileUrl: asset.uri
      };
      addMessage(chatId, tempMsg);

      try {
        const uploadResult = await uploadFileToBackend(
          asset.uri, 
          asset.fileName || 'video.mp4', 
          asset.mimeType || 'video/mp4', 
          'photos'
        );
        
        emitSendMessage({
          id: messageId,
          chatId,
          recipientId,
          content: 'Sent a video',
          type: 'video' as any,
          fileUrl: uploadResult.fileUrl
        });
      } catch (err) {
        console.error("Media upload failed:", err);
        alert('Failed to upload video. Server connection error.');
      }
    }
  };

  const pickFile = async () => {
    const file = await pickDeviceFile();
    if (file) {
      const messageId = 'msg_' + Math.random().toString(36).substr(2, 9);
      
      // Optimistically show uploading status
      const tempMsg: Message = {
        id: messageId,
        chatId,
        senderId: user?.id || '',
        content: `Uploading ${file.name}...`,
        type: 'file',
        status: 'sent',
        timestamp: Date.now(),
        fileName: file.name,
        fileSize: file.size
      };
      addMessage(chatId, tempMsg);

      try {
        const uploadResult = await uploadFileToBackend(file.uri, file.name, file.mimeType, 'files');
        
        emitSendMessage({
          id: messageId,
          chatId,
          recipientId,
          content: `Sent file: ${file.name}`,
          type: 'file',
          fileUrl: uploadResult.fileUrl,
          fileName: file.name,
          fileSize: file.size
        });
      } catch (err) {
        console.error("File upload failed:", err);
        alert("Failed to upload file.");
      }
    }
  };

  const sendLocation = async () => {
    const loc = await getDeviceLocation();
    const messageId = 'msg_' + Math.random().toString(36).substr(2, 9);
    
    const newMsg: Message = {
      id: messageId,
      chatId,
      senderId: user?.id || '',
      content: `Location shared: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`,
      type: 'location',
      status: 'sent',
      timestamp: Date.now(),
      latitude: loc.latitude,
      longitude: loc.longitude
    };

    addMessage(chatId, newMsg);

    emitSendMessage({
      id: messageId,
      chatId,
      recipientId,
      content: `Location shared`,
      type: 'location',
      latitude: loc.latitude,
      longitude: loc.longitude
    });
  };

  const renderMessageItem = ({ item }: { item: Message }) => {
    return <MessageBubble item={item} currentUserId={user?.id || ''} />;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Dynamic Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft {...({ color: "#f1f5f9", size: 24 } as any)} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.recipientName}>{recipientName}</Text>
          <Text style={[styles.onlineStatus, isOnline && styles.onlineText]}>
            {isOnline ? 'Online (Compliance Lock)' : 'Offline'}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        ref={flatListRef}
        data={chatMessages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessageItem}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Typing Indicator Overlay */}
      {isRecipientTyping && (
        <View style={styles.typingIndicator}>
          <ActivityIndicator size="small" color="#64748b" style={{ marginRight: 6 }} />
          <Text style={styles.typingText}>{recipientName} is sharing keystrokes...</Text>
        </View>
      )}

      {/* Input controls container */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          <View style={styles.attachmentPanel}>
            <TouchableOpacity style={styles.attachBtn} onPress={pickPhoto}>
              <Camera {...({ color: "#94a3b8", size: 20 } as any)} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachBtn} onPress={pickVideo}>
              <Video {...({ color: "#94a3b8", size: 20 } as any)} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachBtn} onPress={pickFile}>
              <Paperclip {...({ color: "#94a3b8", size: 20 } as any)} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachBtn} onPress={sendLocation}>
              <MapPin {...({ color: "#94a3b8", size: 20 } as any)} />
            </TouchableOpacity>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Send encrypted signal..."
              placeholderTextColor="#475569"
              value={text}
              onChangeText={(val) => {
                setText(val);
                handleTyping(val.length > 0);
              }}
              multiline
            />
            
            <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
              <Send {...({ color: "#ffffff", size: 18 } as any)} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
  },
  backBtn: {
    padding: 8,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  recipientName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
  },
  onlineStatus: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  onlineText: {
    color: '#10b981',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
    width: '100%',
  },
  myMessageRow: {
    justifyContent: 'flex-end',
  },
  theirMessageRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  myBubble: {
    backgroundColor: '#1d4ed8',
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  messageText: {
    color: '#f1f5f9',
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
  },
  timestampText: {
    fontSize: 10,
    color: '#94a3b8',
    marginRight: 4,
  },
  tickIcon: {
    marginLeft: 2,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
  },
  typingText: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: '#0f172a',
  },
  attachmentPanel: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  attachBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 100,
    color: '#f8fafc',
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    maxWidth: 220,
  },
  fileDetails: {
    marginLeft: 10,
    flex: 1,
  },
  fileName: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700',
  },
  fileSize: {
    color: '#94a3b8',
    fontSize: 11,
  },
  locationContainer: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    width: 180,
  },
  locationTitle: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
    marginTop: 4,
  },
  locationCoords: {
    color: '#94a3b8',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
