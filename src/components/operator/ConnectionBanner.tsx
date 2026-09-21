import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { WifiOff } from "lucide-react-native";
import { useWebsocketStore } from "../../stores/websocketStore";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";

/**
 * Без сокета оператор не получит ни одного вызова, поэтому обрыв нужно показать.
 * Задержка — чтобы плашка не мигала на каждом переподключении: смена вышки или
 * возврат из фона рвут соединение на секунду, и это не повод тревожить.
 */
const GRACE_MS = 4000;

export const ConnectionBanner = () => {
  const connected = useWebsocketStore((state) => state.connected);
  const { tokens } = useAppTheme();
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (connected) {
      setVisible(false);
      return;
    }
    const id = setTimeout(() => setVisible(true), GRACE_MS);
    return () => clearTimeout(id);
  }, [connected]);

  if (!visible) return null;

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: tokens.colors.surface + "F2", borderColor: tokens.colors.warning },
      ]}
    >
      <WifiOff size={16} color={tokens.colors.warning} strokeWidth={2} />
      <Text style={[styles.text, { color: tokens.colors.warning }]} numberOfLines={1}>
        {ru.operatorScreens.noConnection}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: { fontSize: 13, fontWeight: "700" },
});
