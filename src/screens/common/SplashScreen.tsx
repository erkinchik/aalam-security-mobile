import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { MapPin, ReceiptText, Shield, Zap } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RootStackParamList, roleToRootScreen } from "../../navigation/types";
import { useAuthStore } from "../../stores/authStore";
import { fonts } from "../../theme/fonts";
import { ru } from "../../locale/ru";

type Props = NativeStackScreenProps<RootStackParamList, "Splash">;

/** Pencil lLaAD (Welcome) + 9GX6B (Safety Intro) — OLED + lime gradient CTAs */
const C = {
  bg: "#0A0A0A",
  lime: "#C4F82A",
  lime2: "#84CC16",
  onLime: "#0A0A0A",
  muted: "#A1A1AA",
  link: "#71717A",
  dotInactive: "#3F3F46",
  card: "#18181B",
  cardBorder: "#27272A",
  heroGrad0: "#14532D",
  heroGrad1: "#052E16",
  heroStroke: "#84CC16",
} as const;

const ONBOARDING_KEY = "sos_security_onboarding_complete_v1";
const { width: SCREEN_W } = Dimensions.get("window");

export const SplashScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [gate, setGate] = useState<"loading" | "ready">("loading");

  const isBootstrapped = useAuthStore((s) => s.isBootstrapped);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  const goAuthLogin = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    navigation.reset({
      index: 0,
      routes: [{ name: "Auth", params: { screen: "Login" } }],
    });
  }, [navigation]);

  useEffect(() => {
    // Wait for the stored session: going to Login first showed the login screen
    // on every cold start and left the user there if the restore was slow.
    if (!isBootstrapped || isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const done = await AsyncStorage.getItem(ONBOARDING_KEY);
      if (cancelled) return;
      if (done === "1") {
        navigation.replace("Auth", { screen: "Login" });
        return;
      }
      setGate("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [isBootstrapped, isAuthenticated, navigation]);

  useEffect(() => {
    if (!isBootstrapped || !isAuthenticated || !user) return;
    navigation.reset({
      index: 0,
      routes: [{ name: roleToRootScreen[user.role] }],
    });
  }, [isBootstrapped, isAuthenticated, user, navigation]);

  const goPage = useCallback((i: number) => {
    scrollRef.current?.scrollTo({ x: i * SCREEN_W, animated: true });
  }, []);

  if (gate === "loading") {
    return <View style={[styles.root, { backgroundColor: C.bg }]} />;
  }

  const bottomPad = Math.max(insets.bottom, 24);

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        {/* Page 1 — Splash Welcome (lLaAD) */}
        <View style={[styles.page, { width: SCREEN_W }]}>
          <View style={[styles.pageInner, { paddingTop: 8 + insets.top, paddingBottom: bottomPad }]}>
            <View style={styles.topSpacer} />
            <View style={styles.heroRing}>
              <LinearGradient
                colors={[C.heroGrad0, C.heroGrad1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroGrad}
              >
                <Shield size={52} color={C.lime} strokeWidth={2} />
              </LinearGradient>
            </View>

            <Text style={styles.appName}>SOS Security</Text>
            <Text style={styles.desc}>{ru.splash.tagline}</Text>

            <View style={styles.flexSpacer} />

            <View style={styles.dots}>
              <View style={[styles.dot, { backgroundColor: C.lime }]} />
              <View style={[styles.dot, { backgroundColor: C.dotInactive }]} />
            </View>

            <GradientCta label={ru.splash.getStarted} onPress={() => goPage(1)} />

            <Pressable onPress={goAuthLogin} accessibilityRole="button">
              <Text style={styles.linkMuted}>{ru.splash.haveAccount}</Text>
            </Pressable>
          </View>
        </View>

        {/* Page 2 — Safety Intro (9GX6B) */}
        <View style={[styles.page, { width: SCREEN_W }]}>
          <View
            style={[styles.pageInner, { paddingTop: 8 + insets.top, paddingBottom: bottomPad, gap: 12 }]}
          >
            <Text style={styles.headline2}>{ru.splash.staySafeTitle}</Text>
            <Text style={styles.subHead}>{ru.splash.staySafeSub}</Text>

            <View style={styles.featureList}>
              <FeatureRow Icon={Zap} label={ru.splash.featSos} />
              <FeatureRow Icon={MapPin} label={ru.splash.featGeo} />
              <FeatureRow Icon={ReceiptText} label={ru.splash.featHistory} />
            </View>

            <View style={styles.flexSpacer} />

            <View style={styles.dots}>
              <View style={[styles.dot, { backgroundColor: C.dotInactive }]} />
              <View style={[styles.dot, { backgroundColor: C.lime }]} />
            </View>

            <GradientCta label={ru.splash.continueSignIn} onPress={goAuthLogin} />

            <Pressable onPress={goAuthLogin} accessibilityRole="button" style={styles.skipWrap}>
              <Text style={styles.linkMuted}>{ru.splash.skip}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

function GradientCta({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.ctaOuter}>
      <LinearGradient
        colors={[C.lime, C.lime2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.ctaGrad}
      >
        <Text style={styles.ctaLabel}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function FeatureRow({
  Icon,
  label,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
}) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureRowInner}>
        <Icon size={18} color="#FFFFFF" strokeWidth={2} />
        <Text style={styles.featureText}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { flex: 1 },
  pageInner: {
    flex: 1,
    paddingHorizontal: 24,
    gap: 16,
  },
  topSpacer: {
    height: 80,
  },
  heroRing: {
    alignSelf: "center",
    width: 136,
    height: 136,
    borderRadius: 68,
    padding: 2,
    backgroundColor: C.heroStroke,
  },
  heroGrad: {
    flex: 1,
    borderRadius: 66,
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    fontFamily: fonts.spaceGroteskBold,
    fontSize: 34,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.4,
  },
  desc: {
    fontFamily: fonts.manropeMedium,
    fontSize: 14,
    color: C.muted,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 4,
  },
  headline2: {
    fontFamily: fonts.spaceGroteskBold,
    fontSize: 30,
    color: "#FFFFFF",
    letterSpacing: -0.35,
  },
  subHead: {
    fontFamily: fonts.manropeMedium,
    fontSize: 14,
    color: C.muted,
  },
  featureList: {
    gap: 8,
  },
  featureCard: {
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  featureRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  featureText: {
    flex: 1,
    fontFamily: fonts.manropeSemiBold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  flexSpacer: {
    flex: 1,
    minHeight: 16,
  },
  dots: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ctaOuter: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
  },
  ctaGrad: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaLabel: {
    fontFamily: fonts.manropeBold,
    fontSize: 15,
    color: C.onLime,
  },
  linkMuted: {
    fontFamily: fonts.manropeSemiBold,
    fontSize: 13,
    color: C.link,
    textAlign: "center",
  },
  skipWrap: {
    alignItems: "center",
    paddingVertical: 4,
  },
});
