import { productInfo } from "@prayerteam/domain";
import { StyleSheet, Text, View } from "react-native";

export default function Home() {
  return (
    <View style={styles.container}>
      <Text testID="home-app-name" style={styles.title}>
        {productInfo.name}
      </Text>
      <Text testID="home-tagline" style={styles.tagline}>
        {productInfo.tagline}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
  title: { fontSize: 28, fontWeight: "600" },
  tagline: { fontSize: 16, opacity: 0.7 },
});
