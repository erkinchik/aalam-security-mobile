import React, { useState } from "react";
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
import { useAuthStore } from "../../stores/authStore";
import { AppInput } from "../../components/ui/AppInput";
import { ActionButton } from "../../components/ui/ActionButton";
import { toastBus } from "../../ui/feedback/toastBus";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";
import { Check } from "lucide-react-native";
import {
  KYRGYZ_PHONE_HINT,
  kyrgyzPhoneRequiredSchema,
  sanitizeKyrgyzPhoneInput,
} from "../../lib/kyrgyzPhone";
import { handleApiError } from "../../utils/error/handleApiError";

const schema = z
  .object({
    name: z.string().min(1, ru.validation.nameRequired),
    email: z.string().email(ru.validation.emailInvalid),
    phone: kyrgyzPhoneRequiredSchema,
    password: z
      .string()
      .min(12, ru.validation.passwordMin)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, ru.validation.passwordComplexity),
    confirmPassword: z.string().min(1, ru.validation.confirmPassword),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: ru.validation.passwordsMismatch,
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, "Register">;

export const RegisterScreen = ({ navigation }: Props) => {
  const { tokens } = useAppTheme();
  const register = useAuthStore((state) => state.register);
  const [accepted, setAccepted] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", phone: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: FormValues) => {
    if (!accepted) {
      toastBus.show({ message: ru.auth.acceptLegalError, severity: "error" });
      return;
    }
    try {
      await register(values.email, values.password, sanitizeKyrgyzPhoneInput(values.phone));
      toastBus.show({ message: ru.auth.accountCreated, severity: "success" });
    } catch (err: unknown) {
      // «Email уже зарегистрирован» и «нет сети» теперь различимы; остальное —
      // общий текст, серверный английский пользователю не показываем.
      const { status, code, message } = handleApiError(err);
      const text =
        status === undefined || (code && ru.errorCodes[code]) ? message : ru.auth.registerFailed;
      toastBus.show({ message: text, severity: "error" });
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
          <Text style={[styles.title, { color: tokens.colors.onSurface }]}>{ru.auth.createAccount}</Text>
          <Text style={[styles.subtitle, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.auth.joinSubtitle}
          </Text>
        </View>

        <View style={styles.form}>
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, value } }) => (
              <AppInput
                label={ru.auth.fullName}
                autoCapitalize="words"
                returnKeyType="next"
                value={value}
                onChangeText={onChange}
                error={errors.name?.message}
                autoComplete="name"
              />
            )}
          />

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <AppInput
                label={ru.auth.email}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
                value={value}
                onChangeText={onChange}
                error={errors.email?.message}
                autoComplete="email"
              />
            )}
          />

          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, value } }) => (
              <AppInput
                label={ru.auth.phone}
                keyboardType="phone-pad"
                returnKeyType="next"
                value={value}
                onChangeText={(v) => onChange(sanitizeKyrgyzPhoneInput(v))}
                error={errors.phone?.message}
                hint={KYRGYZ_PHONE_HINT}
                autoComplete="tel"
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <AppInput
                label={ru.auth.password}
                secureTextEntry
                returnKeyType="next"
                value={value}
                onChangeText={onChange}
                error={errors.password?.message}
                autoComplete="new-password"
              />
            )}
          />

          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, value } }) => (
              <AppInput
                label={ru.auth.confirmPasswordLabel}
                secureTextEntry
                returnKeyType="done"
                value={value}
                onChangeText={onChange}
                error={errors.confirmPassword?.message}
                autoComplete="new-password"
                onSubmitEditing={handleSubmit(onSubmit)}
              />
            )}
          />

          <Pressable
            style={styles.checkRow}
            onPress={() => setAccepted((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: accepted ? tokens.colors.primary : tokens.colors.border,
                  backgroundColor: accepted ? tokens.colors.primary : "transparent",
                },
              ]}
            >
              {accepted && (
                <Check size={14} color={tokens.colors.onPrimary} strokeWidth={3} />
              )}
            </View>
            <Text style={[styles.checkLabel, { color: tokens.colors.onSurfaceMuted }]}>
              {ru.auth.acceptLegal}
            </Text>
          </Pressable>

          <ActionButton
            label={isSubmitting ? ru.auth.signingUp : ru.auth.signUp}
            disabled={isSubmitting || !accepted}
            loading={isSubmitting}
            onPress={handleSubmit(onSubmit)}
            size="large"
          />
        </View>

        <Pressable
          onPress={() => navigation.navigate("Login")}
          style={styles.loginWrap}
          accessibilityRole="link"
        >
          <Text style={[styles.loginText, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.auth.haveAccount}
            <Text style={styles.loginAccent}>{ru.auth.loginLink}</Text>
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
  },
  form: {
    gap: 14,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  checkLabel: {
    fontSize: 14,
  },
  loginWrap: {
    alignItems: "center",
    paddingVertical: 20,
  },
  loginText: {
    fontSize: 14,
  },
  loginAccent: {
    fontWeight: "700",
  },
});
