import React from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AdminStackParamList } from "../../navigation/types";
import { adminApi } from "../../api/modules/admin";
import { AppCard } from "../../components/ui/AppCard";
import { ActionButton } from "../../components/ui/ActionButton";
import { AppInput } from "../../components/ui/AppInput";
import { toastBus } from "../../ui/feedback/toastBus";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";

const schema = z.object({
  email: z.string().email(ru.validation.emailInvalid),
  password: z.string().min(6, ru.validation.passwordMin),
});

type FormValues = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AdminStackParamList, "AdminCreateOperator">;

export const AdminCreateOperatorScreen = ({ navigation }: Props) => {
  const { tokens } = useAppTheme();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await adminApi.createOperator(values);
      toastBus.show({ message: ru.admin.operatorCreated, severity: "success" });
      navigation.navigate("AdminCreateOperatorSuccess");
    } catch {
      toastBus.show({ message: ru.admin.operatorFail, severity: "error" });
    }
  };

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={[styles.subtitle, { color: tokens.colors.onSurfaceMuted }]}>
              {ru.admin.createOperatorSub}
            </Text>
          </View>

          <AppCard>
            <Text style={[styles.sectionLabel, { color: tokens.colors.onSurfaceMuted }]}>
              {ru.admin.accountDetails}
            </Text>

            <View style={styles.form}>
              <Controller
                control={control}
                name="email"
                render={({ field: { value, onChange } }) => (
                  <AppInput
                    label={ru.operatorScreens.operatorEmail}
                    placeholder={ru.operatorScreens.operatorEmailPh}
                    value={value}
                    onChangeText={onChange}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    returnKeyType="next"
                    error={errors.email?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="password"
                render={({ field: { value, onChange } }) => (
                  <AppInput
                    label={ru.operatorScreens.operatorPass}
                    placeholder={ru.operatorScreens.operatorPassPh}
                    value={value}
                    onChangeText={onChange}
                    secureTextEntry
                    returnKeyType="done"
                    error={errors.password?.message}
                    onSubmitEditing={handleSubmit(onSubmit)}
                  />
                )}
              />

              <ActionButton
                label={isSubmitting ? ru.admin.creating : ru.admin.createOperatorBtn}
                onPress={handleSubmit(onSubmit)}
                loading={isSubmitting}
                disabled={isSubmitting}
                size="large"
              />
            </View>
          </AppCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: 20, gap: 16 },
  header: { gap: 4 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  form: { gap: 14 },
});
