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

const schema = z.object({
  resolution: z.string().min(1, ru.operatorScreens.resolutionRequired),
});

type FormValues = z.infer<typeof schema>;
type Props = NativeStackScreenProps<OperatorStackParamList, "OperatorResolveModal">;

export const OperatorResolveModalScreen = ({ route, navigation }: Props) => {
  const { tokens } = useAppTheme();
  const { sessionId } = route.params;
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { resolution: "" },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await dispatchApi.resolve(sessionId, values.resolution);
      toastBus.show({ message: ru.operator.resolved, severity: "success" });
      navigation.goBack();
    } catch {
      toastBus.show({ message: ru.operator.resolveFail, severity: "error" });
    }
  };

  const resolution = watch("resolution");

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
            {QUICK_REASONS.map((reason) => {
              const selected = resolution === reason;
              return (
                <Pressable
                  key={reason}
                  onPress={() => setValue("resolution", reason, { shouldValidate: true })}
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
                    {reason}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Controller
            control={control}
            name="resolution"
            render={({ field: { value, onChange } }) => (
              <AppInput
                label={ru.operatorScreens.resolveNote}
                placeholder={ru.operatorScreens.resolveNotePh}
                value={value}
                onChangeText={onChange}
                multiline
                numberOfLines={6}
                error={errors.resolution?.message}
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
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: "700" },
  textarea: { minHeight: 140 },
  actions: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1 },
  resolveBtn: { flex: 2 },
});
