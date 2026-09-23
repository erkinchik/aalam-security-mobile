import { Linking, Platform } from "react-native";
import { toastBus } from "../ui/feedback/toastBus";
import { ru } from "../locale/ru";

/**
 * Открывает внешнее приложение с запасным вариантом. `canOpenURL` здесь не
 * годится: на Android 11+ он врёт про незадекларированные схемы, поэтому
 * пробуем открыть по-настоящему и падаем на веб-ссылку.
 */
const openWithFallback = async (primary: string, fallback: string | null, failMessage: string) => {
  try {
    await Linking.openURL(primary);
    return;
  } catch (primaryError) {
    if (!fallback) {
      toastBus.show({ message: failMessage, severity: "error" });
      console.warn("openWithFallback: не открылось", primary, primaryError);
      return;
    }
  }
  try {
    await Linking.openURL(fallback);
  } catch (fallbackError) {
    toastBus.show({ message: failMessage, severity: "error" });
    console.warn("openWithFallback: не открылся и запасной вариант", fallback, fallbackError);
  }
};

/** Набор номера заявителя одним касанием — самое частое действие по тревоге. */
export const callPhone = (phone: string) => {
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits) {
    toastBus.show({ message: ru.operatorScreens.callFail, severity: "error" });
    return;
  }
  void openWithFallback(`tel:${digits}`, null, ru.operatorScreens.callFail);
};

/** Маршрут в штатных картах: оператору надо доехать, а не переписывать адрес. */
export const openRoute = (
  coords: { latitude: number; longitude: number },
  label?: string | null,
) => {
  const point = `${coords.latitude},${coords.longitude}`;
  const title = encodeURIComponent(label ?? ru.operatorScreens.markerEmergency);
  const primary =
    Platform.OS === "ios"
      ? `maps://?daddr=${point}&dirflg=d`
      : `google.navigation:q=${point}`;
  const fallback =
    Platform.OS === "ios"
      ? `https://maps.apple.com/?daddr=${point}&dirflg=d`
      : `geo:${point}?q=${point}(${title})`;
  void openWithFallback(primary, fallback, ru.operatorScreens.routeFail);
};

/**
 * Маршрут по адресу — когда координат нет (объект без точки на карте). Раньше
 * кнопка в этом случае просто гасла, хотя адрес был.
 */
export const openRouteToAddress = (address: string) => {
  const q = encodeURIComponent(address);
  const primary =
    Platform.OS === "ios" ? `maps://?daddr=${q}&dirflg=d` : `google.navigation:q=${q}`;
  const fallback =
    Platform.OS === "ios" ? `https://maps.apple.com/?daddr=${q}&dirflg=d` : `geo:0,0?q=${q}`;
  void openWithFallback(primary, fallback, ru.operatorScreens.routeFail);
};
