// ============================================================
// HomeScreen - Map + Bottom Sheet with station list
// Placeholder structure for the mobile app.
// ============================================================

import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      {/* Map placeholder */}
      <View style={styles.mapPlaceholder}>
        <Text style={styles.placeholderText}>
          Map (react-native-maps) wird hier eingebunden
        </Text>
      </View>

      {/* Bottom sheet placeholder */}
      <View style={styles.bottomSheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Tankstellen in der Nähe</Text>
        <Text style={styles.subtitle}>
          Die vollständige Mobile-Implementierung teilt sich die Business-Logik
          aus `@tankpilot/core` - Recommendation Engine, API Service, Zod Validation
          und Storage Abstraction.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  bottomSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 20,
  },
});
