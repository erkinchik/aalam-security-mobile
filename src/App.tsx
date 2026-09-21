import "react-native-reanimated";
import React from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from "@expo-google-fonts/manrope";
import { SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { AppProviders } from "./providers/AppProviders";
import { AppLifecycleManager } from "./lifecycle/AppLifecycleManager";
import { RootNavigator } from "./navigation/RootNavigator";
import { useAuthBootstrap } from "./hooks/useAuthBootstrap";
import { useTokenRefresh } from "./hooks/useTokenRefresh";
import { useEmergencySocketEvents } from "./hooks/useEmergencySocketEvents";
import { useEmergencyLocationSender } from "./hooks/useEmergencyLocationSender";
import { useHeartbeat } from "./hooks/useHeartbeat";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { useOperatorShift } from "./hooks/useOperatorShift";
import { useOfferAlarm } from "./hooks/useOfferAlarm";
import { useSkipCooldown } from "./hooks/useSkipCooldown";
import { useKeepAwakeDuringCall } from "./hooks/useKeepAwakeDuringCall";
import { AppErrorBoundary } from "./components/error/AppErrorBoundary";
import { OfflineBanner } from "./components/ui/OfflineBanner";
import { BackgroundLocationPrompt } from "./components/sos/BackgroundLocationPrompt";
import { telemetry } from "./services/telemetry";
// Side-effect import: registers the TaskManager task for background SOS location updates.
import "./services/locationTrackingService";

// Initialize Sentry before any React tree mounts so render-phase errors are captured.
telemetry.init();


const AppInner = () => {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_700Bold,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useAuthBootstrap();
  useTokenRefresh();
  useEmergencySocketEvents();
  useEmergencyLocationSender(5000);
  useHeartbeat(15000);
  useOperatorShift();
  useOfferAlarm();
  useSkipCooldown();
  useKeepAwakeDuringCall();
  usePushNotifications();

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: "#0A0A0A" }} />;
  }

  return (
    <>
      <StatusBar style="light" />
      <RootNavigator />
      <OfflineBanner />
      <BackgroundLocationPrompt />
    </>
  );
};

const App = () => (
  <AppErrorBoundary>
    <AppProviders>
      <AppLifecycleManager>
        <AppInner />
      </AppLifecycleManager>
    </AppProviders>
  </AppErrorBoundary>
);

export default telemetry.wrap(App);
