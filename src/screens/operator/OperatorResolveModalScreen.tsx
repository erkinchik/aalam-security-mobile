import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { OperatorStackParamList } from "../../navigation/types";
import { dispatchApi } from "../../api/modules/dispatch";
import { ActionButton } from "../../components/ui/ActionButton";
import { AppInput } from "../../components/ui/AppInput";
import { toastBus } from "../../ui/feedback/toastBus";
import { useOperatorStore } from "../../stores/operatorStore";
import { handleApiError } from "../../utils/error/handleApiError";
import { useQueryClient } from "@tanstack/react-query";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";

/**
 * Печатать на ходу неудобно, а свободный текст оседает в базе мусором. Чип
 * подставляет причину целиком — комментарий остаётся дописать по желанию.
 */
const QUICK_REASONS = [
  ru.operatorScreens.reasonHelped,
  ru.operatorScreens.reasonFalseAlarm,
  ru.operatorScreens.reasonNotConfirmed,
  ru.operatorScreens.reasonHandedOver,
];

/**
 * Причина и комментарий — отдельные поля. Раньше чип записывал причину прямо в
 * текст комментария: выбор чипа стирал уже написанное, а стоило дописать слово —
 * чип гас. Склеиваем при отправке; нужно хотя бы одно из двух.
 */
const schema = z
  .object({
    reason: z.string(),
    note: z.string(),
  })
  .refine((v) => v.reason.trim() !== "" || v.note.trim() !== "", {
    message: ru.operatorScreens.resolutionRequired,
    path: ["note"],
  });

type FormValues = z.infer<typeof schema>;
type Props = NativeStackScreenProps<OperatorStackParamList, "OperatorResolveModal">;

export const OperatorResolveModalScreen = ({ route, navigation }: Props) => {
  const { tokens } = useAppTheme();
  const { sessionId } = route.params;
  const removeActiveSession = useOperatorStore((state) => state.removeActiveSession);
  const removePoolSession = useOperatorStore((state) => state.removePoolSession);
  const queryClient = useQueryClient();
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "", note: "" },
  });

  /**
   * Карточку убираем по ответу сервера, а не по событию emergency:closed. Сокет
   * часто лежит ровно в этот момент — оператор только что вернулся из звонка
   * или навигатора, — и без события карточка «В работе» висела до перезапуска.
   */
  const dropLocally = () => {
    removeActiveSession(sessionId);
    removePoolSession(sessionId);
    void queryClient.invalidateQueries({ queryKey: ["operator-active"] });
    void queryClient.invalidateQueries({ queryKey: ["operator-history"] });
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const resolution = [values.reason.trim(), values.note.trim()].filter(Boolean).join(". ");
      await dispatchApi.resolve(sessionId, resolution);
      dropLocally();
      toastBus.show({ message: ru.operator.resolved, severity: "success" });
      navigation.goBack();
    } catch (error) {
      const { code } = handleApiError(error);
      // Вызов уже закрыт или снят с оператора, пока тот был без связи: закрывать
      // нечего, но и держать карточку на экране незачем.
      if (code === "SESSION_ALREADY_CLOSED" || code === "NOT_ASSIGNED_TO_SESSION") {
        dropLocally();
        toastBus.show({
          message:
            code === "SESSION_ALREADY_CLOSED" ? ru.operator.alreadyClosed : ru.operator.notYoursAnymore,
          severity: "warning",
        });
        navigation.goBack();
        return;
      }
      toastBus.show({ message: ru.operator.resolveFail, severity: "error" });
    }
  };

  const reason = watch("reason");

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          <Text style={[styles.subtitle, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.operatorScreens.resolveSub}
          </Text>

          <Text style={[styles.label, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.operatorScreens.quickReason}
          </Text>
          <View style={styles.chips}>
            {QUICK_REASONS.map((option) => {
              const selected = reason === option;
              return (
                <Pressable
                  key={option}
                  // Повторное касание снимает выбор.
                  onPress={() => {
                    setValue("reason", selected ? "" : option);
                    // Ошибка «нужна причина или комментарий» висит на поле note —
                    // перепроверяем его, иначе она оставалась после выбора чипа.
                    void trigger("note");
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? tokens.colors.primary + "22"
                        : tokens.colors.surfaceVariant,
                      borderColor: selected ? tokens.colors.primary : tokens.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? tokens.colors.primary : tokens.colors.onSurface },
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Controller
            control={control}
            name="note"
            render={({ field: { value, onChange } }) => (
              <AppInput
                label={ru.operatorScreens.resolveNote}
                placeholder={ru.operatorScreens.resolveNotePh}
                value={value}
                onChangeText={onChange}
                multiline
                numberOfLines={6}
                error={errors.note?.message}
                style={styles.textarea}
                textAlignVertical="top"
              />
            )}
          />

          <View style={styles.actions}>
            <ActionButton
              variant="secondary"
              label={ru.operatorScreens.cancel}
              onPress={() => navigation.goBack()}
              style={styles.cancelBtn}
            />
            <ActionButton
              variant="danger"
              label={isSubmitting ? ru.operatorScreens.resolving : ru.operatorScreens.resolveBtn}
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting}
              disabled={isSubmitting}
              style={styles.resolveBtn}
              accessibilityLabel={ru.operatorScreens.confirmResolveA11y}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, padding: 20, gap: 16 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: "700", marginBottom: -8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  // 44 pt — минимальная цель касания; раньше чип был ~34 pt.
  chip: { paddingHorizontal: 14, minHeight: 44, justifyContent: "center", borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: "700" },
  textarea: { minHeight: 140 },
  actions: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1 },
  resolveBtn: { flex: 2 },
});
