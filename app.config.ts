import { ExpoConfig, ConfigContext } from "@expo/config";

/**
 * Google Maps API keys are read from .env and injected at prebuild time.
 * You MUST use a development build (npx expo run:ios / run:android), NOT Expo Go.
 * After changing .env, run: npx expo prebuild --clean && npx expo run:android (or run:ios)
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const mapsApiKeyIos = process.env.EXPO_PUBLIC_MAPS_API_KEY_IOS?.trim() || "";
  const mapsApiKeyAndroid = process.env.EXPO_PUBLIC_MAPS_API_KEY_ANDROID?.trim() || "";

  // src/config/env.ts читает `extra` раньше, чем EXPO_PUBLIC_*, а в app.json
  // там зашиты боевые адреса — из-за этого .env не работал вовсе. Здесь
  // переменная окружения перекрывает значение из app.json, а прод остаётся
  // значением по умолчанию, когда её не задали.
  const extra = config.extra ?? {};
  const apiBaseUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || extra.apiBaseUrl;
  const wsUrl = process.env.EXPO_PUBLIC_WS_URL?.trim() || extra.wsUrl;

  return {
    ...config,
    extra: { ...extra, apiBaseUrl, wsUrl },
    ios: {
      ...config.ios,
      config: {
        ...(config.ios?.config ?? {}),
        googleMapsApiKey: mapsApiKeyIos || undefined,
      },
    },
    android: {
      ...config.android,
      config: {
        ...(config.android?.config ?? {}),
        googleMaps: {
          ...(config.android?.config?.googleMaps ?? {}),
          apiKey: mapsApiKeyAndroid || undefined,
        },
      },
    },
  } as ExpoConfig;
};
