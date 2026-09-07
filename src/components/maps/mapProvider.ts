import { Platform } from "react-native";
import { PROVIDER_GOOGLE } from "react-native-maps";
import { ENV } from "../../config/env";

/**
 * Провайдер карты по платформе.
 *
 * На iOS используем встроенные Apple Maps: PROVIDER_GOOGLE требует, чтобы
 * Google Maps SDK был слинкован на этапе нативной сборки (и ключ был известен
 * уже тогда). В Expo Go этого SDK нет вообще, а в облачной сборке ключ из
 * локального .env недоступен — карта выходила пустой. Apple Maps ключа не
 * требуют и работают везде.
 *
 * На Android остаётся Google Maps: это штатный провайдер, ключ подставляется
 * в манифест из EXPO_PUBLIC_MAPS_API_KEY_ANDROID.
 */
export const MAP_PROVIDER = Platform.OS === "ios" ? undefined : PROVIDER_GOOGLE;

/** Можно ли вообще показать карту: на iOS — всегда, на Android — если есть ключ. */
export const HAS_MAP_SUPPORT =
  Platform.OS === "ios" ? true : Boolean(ENV.mapsApiKeyAndroid);
