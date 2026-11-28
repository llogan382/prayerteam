import { productName, productTagline } from "@prayerteam/domain";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { api } from "../api";

export default function Home() {
  const meta = api.query.useQuery("get", "/api/meta");

  return (
    <View style={styles.container}>
      {meta.isPending ? (
        <ActivityIndicator testID="home-loading" />
      ) : meta.isError ? (
        <Text testID="home-error" style={styles.error}>
          Couldn't reach {productName}. Check your connection and try again.
        </Text>
      ) : (
        <Text testID="home-app-name" style={styles.title}>
          {meta.data.name}
        </Text>
      )}
      <Text testID="home-tagline" style={styles.tagline}>
        {productTagline}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
  title: { fontSize: 28, fontWeight: "600" },
  tagline: { fontSize: 16, opacity: 0.7 },
  error: { fontSize: 16, textAlign: "center" },
});
