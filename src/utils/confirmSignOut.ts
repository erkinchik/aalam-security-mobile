import { Alert } from "react-native";
import { ru } from "../locale/ru";

/**
 * Выход одним касанием без подтверждения — в том числе с открытым вызовом у
 * оператора или идущей тревогой у заявителя. Спрашиваем всегда, а о том, что
 * именно потеряется, говорим прямо.
 */
export const confirmSignOut = (onConfirm: () => void, busyMessage?: string) => {
  Alert.alert(ru.profileCommon.signOutConfirmTitle, busyMessage ?? ru.profileCommon.signOutConfirmMsg, [
    { text: ru.profileCommon.signOutConfirmCancel, style: "cancel" },
    { text: ru.profileCommon.signOutConfirmOk, style: "destructive", onPress: onConfirm },
  ]);
};
