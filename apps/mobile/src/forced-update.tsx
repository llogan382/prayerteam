import { productName } from "@prayerteam/domain";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

// PLACEHOLDER store listings until the app is published (#15).
const storeUrl = Platform.select({
  ios: "https://apps.apple.com/app/id0000000000",
  android: "https://play.google.com/store/apps/details?id=org.prayerteam.app",
});

// Shown instead of every route once the API says this native app is too
// old (426 upgrade_required). The web is never blocked, so it never shows.
export function ForcedUpdate() {
  return (
    <View testID="forced-update" style={styles.container}>
      <Text style={styles.title}>A new version of {productName} is ready</Text>
      <Text style={styles.body}>
        This version is no longer supported. Get the new version to keep praying with your Team.
      </Text>
      {storeUrl ? (
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => void Linking.openURL(storeUrl)}>
          <Text style={styles.buttonText}>Get the new version</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  title: { fontSize: 24, fontWeight: "600" },
  body: { fontSize: 16, textAlign: "center", opacity: 0.8 },
  button: { paddingVertical: 12, paddingHorizontal: 32, borderRadius: 8, backgroundColor: "#2f5d8a" },
  buttonText: { color: "white", fontSize: 16, fontWeight: "600" },
});
