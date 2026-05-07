import { View, Text, StyleSheet } from 'react-native';

export function VehicleScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Fahrzeug - Implementierung folgt</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  text: { fontSize: 16, color: '#64748B' },
});
