import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { UserStackParamList } from "../../navigation/types";
import { useAppTheme } from "../../theme";
import { AppInput } from "../../components/ui/AppInput";
import { venueApi } from "../../api/modules/organization";
import { useUserSessionStore } from "../../stores/userSessionStore";
import { toastBus } from "../../ui/feedback/toastBus";
import { BackNavLink } from "../../components/navigation/BackNavLink";
import { ru } from "../../locale/ru";
import { handleApiError } from "../../utils/error/handleApiError";

type Props = NativeStackScreenProps<UserStackParamList, "UserBindVenue">;

/** Pencil vJUUf — Venue / Join Invite Code */
const P = {
  lime: "#C4F82A",
  lime2: "#84CC16",
  onLime: "#0A0A0A",
  successBg: "#052E16",
  successBorder: "#166534",
  successLabel: "#86EFAC",
  successBody: "#BBF7D0",
} as const;

export const BindVenueScreen = ({ navigation }: Props) => {
  const queryClient = useQueryClient();
  const { tokens } = useAppTheme();
  const setVenue = useUserSessionStore((s) => s.setVenue);
  const clearVenue = useUserSessionStore((s) => s.clearVenue);
  const currentVenueName = useUserSessionStore((s) => s.currentVenueName);
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [joinedName, setJoinedName] = useState<string | null>(null);
  const [joinedOrgName, setJoinedOrgName] = useState<string | null>(null);

  const showSuccess = joinedName !== null || joinedOrgName !== null || !!currentVenueName;
  const successVenueName = joinedName ?? currentVenueName ?? "";

  const handleBind = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError(ru.bindVenue.codeLen);
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      const result = await venueApi.bind(code);
      if (result.bindType === "organization") {
        await clearVenue();
        setJoinedOrgName(result.organization.name);
        setJoinedName(null);
        toastBus.show({
          message: `${ru.bindVenue.joinedOrgPrefix} ${result.organization.name}`,
          severity: "success",
        });
      } else {
        await setVenue(result.id, result.name);
        setJoinedName(result.name);
        setJoinedOrgName(null);
        toastBus.show({ message: `${ru.bindVenue.joinedPrefix} ${result.name}`, severity: "success" });
      }
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    } catch (err: unknown) {
      // Не каждый отказ — неверный код: без сети человек перепроверял код, а
      // дело было в связи.
      const { status, code, message } = handleApiError(err);
      const text =
        status === 429
          ? ru.auth.tooManyAttempts
          : status === 404 || status === 400
            ? ru.bindVenue.invalidCode
            : // Нет сети, известный код или отказ владельцу — у сервера русский текст.
              status === undefined || status === 409 || (code && ru.errorCodes[code])
              ? message
              : ru.bindVenue.invalidCode;
      toastBus.show({ message: text, severity: "error" });
      setError(text);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: tokens.colors.background }]}
      edges={["top", "left", "right"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.backRow}>
            <BackNavLink color={tokens.colors.primary} onPress={() => navigation.goBack()} />
          </View>

          <Text style={[styles.pageTitle, { color: tokens.colors.onSurface }]}>{ru.bindVenue.title}</Text>
          <Text style={[styles.pageSubtitle, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.bindVenue.subtitle}
          </Text>

          <AppInput
            label={ru.bindVenue.inviteCode}
            value={inviteCode}
            onChangeText={(t) => {
              setInviteCode(t.toUpperCase().slice(0, 6));
              setError(undefined);
            }}
            placeholder={ru.bindVenue.placeholder}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            error={error}
            editable={!loading}
          />

          <Pressable
            onPress={() => void handleBind()}
            disabled={loading || inviteCode.trim().length !== 6}
            style={({ pressed }) => [
              styles.verifyOuter,
              { opacity: pressed || loading || inviteCode.trim().length !== 6 ? 0.75 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={ru.bindVenue.verifyA11y}
          >
            <LinearGradient
              colors={[P.lime, P.lime2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.verifyGradient}
            >
              {loading ? (
                <ActivityIndicator color={P.onLime} />
              ) : (
                <Text style={[styles.verifyLabel, { color: P.onLime }]}>{ru.bindVenue.verify}</Text>
              )}
            </LinearGradient>
          </Pressable>

          {showSuccess && (joinedOrgName || successVenueName) ? (
            <View
              style={[
                styles.successCard,
                { borderColor: P.successBorder, backgroundColor: P.successBg },
              ]}
            >
              <Text style={[styles.successTag, { color: P.successLabel }]}>{ru.bindVenue.successTag}</Text>
              <Text style={[styles.successMsg, { color: P.successBody }]}>
                {joinedOrgName
                  ? `${ru.bindVenue.successOrgJoined} ${joinedOrgName}.`
                  : `${ru.bindVenue.successVenueJoined} ${successVenueName}.`}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => navigation.navigate("UserTabs")}
            style={({ pressed }) => [
              styles.goHome,
              {
                borderColor: tokens.colors.border,
                backgroundColor: tokens.colors.surface,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={ru.bindVenue.goHomeA11y}
          >
            <Text style={[styles.goHomeText, { color: tokens.colors.onSurface }]}>{ru.bindVenue.goHome}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  keyboard: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 12,
  },
  backRow: { marginBottom: 4 },
  pageTitle: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 20,
  },
  verifyOuter: {
    borderRadius: 14,
    overflow: "hidden",
  },
  verifyGradient: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  successCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  successTag: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  successMsg: {
    fontSize: 13,
    fontWeight: "500",
  },
  goHome: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  goHomeText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
