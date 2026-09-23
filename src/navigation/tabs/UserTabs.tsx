import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { House, History, User } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserTabParamList } from "../types";
import {
  USER_TAB_BAR_PADDING_BOTTOM_INNER,
  USER_TAB_BAR_PADDING_HORIZONTAL,
  USER_TAB_BAR_PADDING_TOP,
} from "../userTabBarLayout";
import { UserHomeScreen } from "../../screens/user/UserHomeScreen";
import { UserEmergencyHistoryScreen } from "../../screens/user/UserEmergencyHistoryScreen";
import { UserProfileScreen } from "../../screens/user/UserProfileScreen";
import { useSyncCurrentVenue } from "../../hooks/useSyncCurrentVenue";
import { fonts } from "../../theme/fonts";
import { ru } from "../../locale/ru";

const Tab = createBottomTabNavigator<UserTabParamList>();

/** Pencil 7MxmM — Lucide house / history / user, Manrope 11 */
const TAB_ICONS = {
  Home: House,
  History: History,
  Profile: User,
} as const;

const TAB_COLORS = {
  grad0: "#0A0A0A00",
  grad1: "#0A0A0A",
  pillBg: "#18181B",
  pillBorder: "#27272A",
  active: "#C4F82A",
  inactive: "#52525B",
} as const;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TabItem({
  name,
  focused,
  activeColor,
  inactiveColor,
  onPress,
}: {
  name: keyof UserTabParamList;
  focused: boolean;
  activeColor: string;
  inactiveColor: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const Icon = TAB_ICONS[name];
  const labels: Record<keyof UserTabParamList, string> = {
    Home: ru.tabs.home,
    History: ru.tabs.history,
    Profile: ru.tabs.profile,
  };
  const color = focused ? activeColor : inactiveColor;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 16, stiffness: 420 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      style={[styles.tabCell, animatedStyle]}
      accessibilityRole="tab"
      accessibilityLabel={labels[name]}
      accessibilityState={{ selected: focused }}
    >
      <Icon size={20} color={color} strokeWidth={2} />
      <Text
        style={[
          styles.tabLabel,
          { color },
          focused ? styles.tabLabelActive : styles.tabLabelInactive,
        ]}
        numberOfLines={1}
      >
        {labels[name]}
      </Text>
    </AnimatedPressable>
  );
}

export const UserTabs = () => {
  const insets = useSafeAreaInsets();
  const C = TAB_COLORS;
  const activeColor = TAB_COLORS.active;

  // Hydrate currentVenueId / currentVenueName from backend membership on
  // mount and whenever /organization/my changes. Без этого SOS уходил GPS-ом
  // даже у привязанного к точке менеджера после релогина.
  useSyncCurrentVenue();

  return (
    <Tab.Navigator
      tabBar={({ state, navigation }) => (
        <View style={styles.tabBarRoot} pointerEvents="box-none">
          <LinearGradient
            colors={[C.grad0, C.grad1]}
            locations={[0, 0.3]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[
              styles.gradientPad,
              {
                paddingTop: USER_TAB_BAR_PADDING_TOP,
                paddingHorizontal: USER_TAB_BAR_PADDING_HORIZONTAL,
                paddingBottom: insets.bottom + USER_TAB_BAR_PADDING_BOTTOM_INNER,
              },
            ]}
          >
            <View
              style={[
                styles.pill,
                {
                  backgroundColor: C.pillBg,
                  borderColor: C.pillBorder,
                },
              ]}
            >
              {state.routes.map((route, index) => {
                const focused = state.index === index;
                return (
                  <TabItem
                    key={route.key}
                    name={route.name as keyof UserTabParamList}
                    focused={focused}
                    activeColor={activeColor}
                    inactiveColor={C.inactive}
                    onPress={() => {
                      const event = navigation.emit({
                        type: "tabPress",
                        target: route.key,
                        canPreventDefault: true,
                      });
                      if (!focused && !event.defaultPrevented) {
                        navigation.navigate(route.name);
                      }
                    }}
                  />
                );
              })}
            </View>
          </LinearGradient>
        </View>
      )}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={UserHomeScreen} />
      <Tab.Screen name="History" component={UserEmergencyHistoryScreen} />
      <Tab.Screen name="Profile" component={UserProfileScreen} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBarRoot: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  gradientPad: {
    width: "100%",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    minHeight: 62,
    borderRadius: 9999,
    borderWidth: 1,
    padding: 4,
  },
  tabCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 4,
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    fontFamily: fonts.manropeSemiBold,
  },
  tabLabelInactive: {
    fontFamily: fonts.manropeMedium,
  },
});
