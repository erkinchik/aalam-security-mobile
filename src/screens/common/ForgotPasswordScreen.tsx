import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthStackParamList } from "../../navigation/types";
import { authApi } from "../../api/modules/auth";
import { AppInput } from "../../components/ui/AppInput";
import { ActionButton } from "../../components/ui/ActionButton";
import { toastBus } from "../../ui/feedback/toastBus";
import { handleApiError } from "../../utils/error/handleApiError";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";

const schema = z.object({
  email: z.string().email(ru.validation.emailInvalid),
});

type FormValues = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

export const ForgotPasswordScreen = ({ navigation }: Props) => {
  const { tokens } = useAppTheme();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await authApi.forgotPassword(values.email);
      toastBus.show({
        message: ru.auth.resetEmailHint,
        severity: "success",
      });
      navigation.navigate("Login");
    } catch (error) {
      // Сервер отвечает кодом PASSWORD_RESET_UNAVAILABLE, пока не подключён
      // почтовый провайдер, — показываем его текст, а не общий «сбой».
      const { message } = handleApiError(error);
      toastBus.show({ message: message || ru.auth.requestFailed, severity: "error" });
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: tokens.colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: tokens.colors.onSurface }]}>
            {ru.auth.recoveryTitle}
          </Text>
          <Text style={[styles.subtitle, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.auth.recoverySubtitle}
          </Text>
        </View>

        <View style={styles.form}>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <AppInput
                label={ru.auth.email}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="done"
                value={value}
                onChangeText={onChange}
                error={errors.email?.message}
                autoComplete="email"
                onSubmitEditing={handleSubmit(onSubmit)}
              />
            )}
          />

          <ActionButton
            label={isSubmitting ? ru.auth.sending : ru.auth.sendResetLink}
            disabled={isSubmitting}
            loading={isSubmitting}
            onPress={handleSubmit(onSubmit)}
            size="large"
          />
        </View>

        <Pressable
          onPress={() => navigation.navigate("Login")}
          style={styles.backWrap}
          accessibilityRole="link"
        >
          <Text style={[styles.backText, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.auth.backToLogin}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 28,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  form: {
    gap: 16,
  },
  backWrap: {
    alignItems: "center",
    paddingVertical: 20,
  },
  backText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
