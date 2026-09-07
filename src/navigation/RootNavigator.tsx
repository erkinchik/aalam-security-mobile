import React from "react";
import { DarkTheme, NavigationContainer, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthStore } from "../stores/authStore";
import { RootStackParamList, roleToRootScreen } from "./types";
import { AuthStack } from "./stacks/AuthStack";
import { CommonStack } from "./stacks/CommonStack";
import { UserStack } from "./stacks/UserStack";
import { OperatorStack } from "./stacks/OperatorStack";
import { AdminStack } from "./stacks/AdminStack";
import { AuthGuard } from "./guards/AuthGuard";
import { navigationRef } from "./navigationRef";
import { SplashScreen } from "../screens/common/SplashScreen";
import { AuthLoadingScreen } from "../screens/common/AuthLoadingScreen";
import { oledDarkTokens } from "../theme/tokens";

const Stack = createNativeStackNavigator<RootStackParamList>();

// Lock navigation chrome to OLED dark; without this React Navigation falls back to
// its default light theme on Android when the system is in light mode, which causes
// white flashes between screens and light card backgrounds.
const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: oledDarkTokens.colors.background,
    card: oledDarkTokens.colors.surface,
    text: oledDarkTokens.colors.onSurface,
    border: oledDarkTokens.colors.border,
    primary: oledDarkTokens.colors.primary,
    notification: oledDarkTokens.colors.danger,
  },
};

export const RootNavigator = () => {
  const isBootstrapped = useAuthStore((state) => state.isBootstrapped);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  const initialRouteName =
    isBootstrapped && isAuthenticated && user ? roleToRootScreen[user.role] : "Splash";

  return (
    <NavigationContainer theme={navigationTheme} ref={navigationRef}>
      <Stack.Navigator
        key={isAuthenticated ? `auth-${user?.role ?? "none"}` : "guest"}
        initialRouteName={initialRouteName}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="AuthLoading" component={AuthLoadingScreen} />
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : (
          <>
            <Stack.Screen name="Common" component={CommonStack} />
            <Stack.Screen
              name="User"
              children={() => (
                <AuthGuard roles={["USER"]}>
                  <UserStack />
                </AuthGuard>
              )}
            />
            <Stack.Screen
              name="Operator"
              children={() => (
                <AuthGuard roles={["OPERATOR"]}>
                  <OperatorStack />
                </AuthGuard>
              )}
            />
            <Stack.Screen
              name="Admin"
              children={() => (
                <AuthGuard roles={["ADMIN"]}>
                  <AdminStack />
                </AuthGuard>
              )}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
