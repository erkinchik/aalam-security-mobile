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
import { useAuthStore } from "../../stores/authStore";
import { AppInput } from "../../components/ui/AppInput";
import { ActionButton } from "../../components/ui/ActionButton";
import { toastBus } from "../../ui/feedback/toastBus";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";
import { handleApiError } from "../../utils/error/handleApiError";

const schema = z.object({
  email: z.string().email(ru.validation.emailInvalid),
  password: z.string().min(6, ru.validation.passwordMin),
});

type FormValues = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export const LoginScreen = ({ navigation }: Props) => {
  const { tokens } = useAppTheme();
  const login = useAuthStore((state) => state.login);
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
      await login(values.email, values.password);
      toastBus.show({ message: ru.auth.signedInOk, severity: "success" });
    } catch (err: unknown) {
      // Раньше любой отказ, включая отсутствие сети, показывался как «неверный
      // пароль» — человек начинал подбирать пароль, хотя дело было в связи.
      const { status, code, message } = handleApiError(err);
      const text =
        status === undefined
          ? message
          : status === 429
            ? // Backend (SEC-6) throttles login to 5 attempts / 15 min per (IP, email).
              ru.auth.tooManyAttempts
            : status === 401
              ? ru.auth.invalidCredentials
              : code && ru.errorCodes[code]
                ? message
                : ru.errors.unknownApi;
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
          <Text style={[styles.title, { color: tokens.colors.onSurface }]}>{ru.auth.welcomeBack}</Text>
          <Text style={[styles.subtitle, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.auth.signInSubtitle}
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
            name="password"
            render={({ field: { onChange, value } }) => (
              <AppInput
                label={ru.auth.password}
                secureTextEntry
                returnKeyType="done"
                value={value}
                onChangeText={onChange}
                error={errors.password?.message}
                autoComplete="current-password"
                onSubmitEditing={handleSubmit(onSubmit)}
              />
            )}
          />

          <Pressable
            onPress={() => navigation.navigate("ForgotPassword")}
            style={styles.forgotWrap}
            // Текст без отступов — цель касания была меньше 44 pt.
            hitSlop={12}
            accessibilityRole="link"
          >
            <Text style={[styles.forgotText, { color: tokens.colors.primary }]}>
              {ru.auth.forgotPassword}
            </Text>
          </Pressable>

          <ActionButton
            label={isSubmitting ? ru.auth.signingIn : ru.auth.login}
            disabled={isSubmitting}
            loading={isSubmitting}
            onPress={handleSubmit(onSubmit)}
            size="large"
          />

          <ActionButton
            variant="secondary"
            label={ru.auth.register}
            onPress={() => navigation.navigate("Register")}
            size="large"
          />
        </View>

        <View style={styles.footer}>
          {/* Две отдельные ссылки. Раньше обе сидели внутри одной «ссылки» без
              действия — скринридер объявлял пустой элемент. */}
          <View style={styles.legalWrap}>
            <Pressable
              onPress={() => navigation.navigate("Terms")}
              hitSlop={10}
              accessibilityRole="link"
            >
              <Text style={[styles.legalLink, { color: tokens.colors.onSurfaceMuted }]}>
                {ru.auth.terms}
              </Text>
            </Pressable>
            <Text style={[styles.legalDot, { color: tokens.colors.onSurfaceMuted }]}>·</Text>
            <Pressable
              onPress={() => navigation.navigate("Privacy")}
              hitSlop={10}
              accessibilityRole="link"
            >
              <Text style={[styles.legalLink, { color: tokens.colors.onSurfaceMuted }]}>
                {ru.auth.privacy}
              </Text>
            </Pressable>
          </View>
        </View>
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
    marginBottom: 32,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    fontStyle: "italic",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
  },
  form: {
    gap: 16,
  },
  forgotWrap: {
    alignSelf: "flex-end",
    marginTop: -6,
    marginBottom: 4,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 8,
  },
  legalWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  legalLink: {
    fontSize: 14,
    fontWeight: "500",
  },
  legalDot: {
    fontSize: 14,
  },
});
