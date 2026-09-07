import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useAuthStore } from "../stores/authStore";
import { usersApi } from "../api/modules/users";
import { navigateToOperatorHome } from "../navigation/navigationRef";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const usePushNotifications = () => {
  const role = useAuthStore((state) => state.role);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accessToken = useAuthStore((state) => state.accessToken);
  const hasRegistered = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || role !== "OPERATOR" || !accessToken) return;
    if (hasRegistered.current) return;

    let cancelled = false;

    const register = async () => {
      if (!Device.isDevice) return;

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("sos-emergency", {
          name: "SOS Emergency",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          sound: "default",
        });
      }

      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") return;

      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;
      if (!projectId) return;

      try {
        const { data } = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        if (cancelled) return;
        await usersApi.registerPushToken(data);
        hasRegistered.current = true;
      } catch {
        // Ignore token registration errors
      }
    };

    void register();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, role, accessToken]);

  // Тап по push-уведомлению открывает экран входящего вызова. Без этого пуш
  // ничего не даёт: оператор видит баннер, но нажать на него некуда.
  useEffect(() => {
    if (!isAuthenticated || role !== "OPERATOR") return;

    const openFromResponse = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data as
        | { type?: string; sessionId?: string }
        | undefined;
      if (data?.type !== "emergency:new") return;
      navigateToOperatorHome();
    };

    // Холодный старт: приложение подняли тапом по уведомлению.
    void Notifications.getLastNotificationResponseAsync().then(openFromResponse);
    const subscription =
      Notifications.addNotificationResponseReceivedListener(openFromResponse);

    return () => subscription.remove();
  }, [isAuthenticated, role]);
};
