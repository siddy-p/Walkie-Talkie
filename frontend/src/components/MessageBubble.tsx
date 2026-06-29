import React from 'react';
import { StyleSheet, Text, View, Image, Platform, TouchableOpacity, Linking } from 'react-native';
import { Paperclip, MapPin, Check, CheckCheck, Play } from 'lucide-react-native';
import { Message } from '../state/chatStore';

interface MessageBubbleProps {
  item: Message;
  currentUserId: string;
}

export default function MessageBubble({ item, currentUserId }: MessageBubbleProps) {
  const isMe = item.senderId === currentUserId;

  const renderStatusTicks = (status: Message['status']) => {
    if (status === 'sent') {
      return <Check {...({ color: "#94a3b8", size: 12, style: styles.tickIcon } as any)} />;
    } else if (status === 'delivered') {
      return <CheckCheck {...({ color: "#94a3b8", size: 14, style: styles.tickIcon } as any)} />;
    } else if (status === 'read') {
      return <CheckCheck {...({ color: "#3b82f6", size: 14, style: styles.tickIcon } as any)} />;
    }
    return null;
  };

  return (
    <View style={[styles.messageRow, isMe ? styles.myMessageRow : styles.theirMessageRow]}>
      <View style={[styles.bubble, isMe ? styles.myBubble : styles.theirBubble]}>
        
        {item.type === 'image' && (
          <Image source={{ uri: item.fileUrl }} style={styles.bubbleImage} resizeMode="cover" />
        )}

        {item.type === 'file' && (
          <View style={styles.fileContainer}>
            <Paperclip {...({ color: isMe ? "#f1f5f9" : "#60a5fa", size: 20 } as any)} />
            <View style={styles.fileDetails}>
              <Text style={[styles.fileName, { color: isMe ? '#ffffff' : '#e2e8f0' }]} numberOfLines={1}>
                {item.fileName}
              </Text>
              {item.fileSize && (
                <Text style={[styles.fileSize, { color: isMe ? 'rgba(255,255,255,0.7)' : '#94a3b8' }]}>
                  {(item.fileSize / 1024).toFixed(1)} KB
                </Text>
              )}
            </View>
          </View>
        )}

        {item.type === 'location' && (
          <View style={styles.locationContainer}>
            <MapPin {...({ color: "#ef4444", size: 20 } as any)} />
            <Text style={[styles.locationTitle, { color: isMe ? '#ffffff' : '#f1f5f9' }]}>GPS Share Node</Text>
            <Text style={[styles.locationCoords, { color: isMe ? 'rgba(255,255,255,0.7)' : '#94a3b8' }]}>
              Lat: {item.latitude?.toFixed(5)}
            </Text>
            <Text style={[styles.locationCoords, { color: isMe ? 'rgba(255,255,255,0.7)' : '#94a3b8' }]}>
              Lng: {item.longitude?.toFixed(5)}
            </Text>
          </View>
        )}

        {item.type === 'video' as any && (
          <TouchableOpacity 
            style={styles.videoContainer}
            onPress={() => {
              if (item.fileUrl) {
                Linking.openURL(item.fileUrl).catch(err => {
                  console.warn("Could not play video:", err);
                });
              }
            }}
            activeOpacity={0.8}
          >
            <View style={styles.videoPlayOverlay}>
              <Play {...({ color: "#25d366", size: 24 } as any)} />
            </View>
            <Text style={styles.videoLabel}>🎥 Video File</Text>
            <Text style={styles.videoTapHint}>Tap to Play Video</Text>
          </TouchableOpacity>
        )}

        {item.type === 'text' && (
          <Text style={[styles.messageText, { color: isMe ? '#ffffff' : '#f1f5f9' }]}>{item.content}</Text>
        )}

        <View style={styles.metaRow}>
          <Text style={[styles.timestampText, { color: isMe ? 'rgba(255,255,255,0.6)' : '#94a3b8' }]}>
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {isMe && renderStatusTicks(item.status)}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    marginRight: 4,
  },
  tickIcon: {
    marginLeft: 2,
  },
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    width: 200,
  },
  fileDetails: {
    marginLeft: 10,
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '700',
  },
  fileSize: {
    fontSize: 11,
  },
  locationContainer: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    width: 180,
  },
  locationTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  locationCoords: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  videoContainer: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    width: 200,
    alignItems: 'center',
  },
  videoPlayOverlay: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  videoLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e2e8f0',
    marginBottom: 2,
  },
  videoTapHint: {
    fontSize: 11,
    color: '#25d366',
    fontWeight: '600',
  },
});
