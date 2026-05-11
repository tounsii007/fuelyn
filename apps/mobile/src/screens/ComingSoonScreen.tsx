import { View, Text, StyleSheet } from 'react-native';

interface Props {
  label: string;
}

export function ComingSoonScreen({ label }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{label}</Text>
      <Text style={styles.body}>Coming soon</Text>
      <Text style={styles.hint}>
        Die mobile App ist noch im Stub-Stadium. Volle Funktionalität gibt es
        aktuell nur im Web-Client unter https://localhost:49443.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 32,
  },
  title: { fontSize: 20, fontWeight: '600', color: '#0F172A', marginBottom: 8 },
  body: { fontSize: 16, color: '#475569', marginBottom: 16 },
  hint: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
});
