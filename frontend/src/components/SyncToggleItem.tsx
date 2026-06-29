import React from 'react';
import { StyleSheet, Text, View, Switch } from 'react-native';

interface SyncToggleItemProps {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (val: boolean) => void;
}

export default function SyncToggleItem({ label, description, value, onValueChange }: SyncToggleItemProps) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleInfo}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#334155', true: '#3b82f6' }}
        thumbColor={value ? '#ffffff' : '#94a3b8'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
  },
});
