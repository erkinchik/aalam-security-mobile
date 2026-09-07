import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
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
  textarea: { minHeight: 140 },
  actions: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1 },
  resolveBtn: { flex: 2 },
});
