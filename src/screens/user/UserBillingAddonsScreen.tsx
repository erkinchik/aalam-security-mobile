import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { UserStackParamList } from "../../navigation/types";
import { useAppTheme } from "../../theme";
import { spacing } from "../../theme";
import { ActionButton } from "../../components/ui/ActionButton";
import { usersApi } from "../../api/modules/users";
import { useAuthStore } from "../../stores/authStore";
import { useUserSessionStore } from "../../stores/userSessionStore";
import { toastBus } from "../../ui/feedback/toastBus";
import { ru } from "../../locale/ru";

type Props = NativeStackScreenProps<UserStackParamList, "UserBillingAddons">;

type AddOn = {
  id: string;
  title: string;
  description: string;
  monthlyPrice: number;
};

const ADD_ONS: AddOn[] = [
  {
    id: "priority",
    title: ru.billing.addonPriority,
    description: ru.billing.addonPrioritySub,
    monthlyPrice: 300,
  },
  {
    id: "family",
    title: ru.billing.addonFamily,
    description: ru.billing.addonFamilySub,
    monthlyPrice: 200,
  },
];

export const UserBillingAddonsScreen = ({ route, navigation }: Props) => {
  const { tokens } = useAppTheme();
  const { planName, basePrice } = route.params;
  const setIndividualSubscription = useUserSessionStore((s) => s.setIndividualSubscription);
  const setUser = useAuthStore((s) => s.setUser);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({
    priority: true,
    family: true,
  });

  const addOnsTotal = React.useMemo(
    () =>
      ADD_ONS.reduce((sum, addOn) => {
        if (!selected[addOn.id]) return sum;
        return sum + addOn.monthlyPrice;
      }, 0),
    [selected],
  );

  const total = basePrice + addOnsTotal;

  const toggle = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const [continuing, setContinuing] = React.useState(false);

  const onContinue = async () => {
    setContinuing(true);
    try {
      const updated = await usersApi.demoActivateIndividualSubscription();
      setUser(updated);
      await setIndividualSubscription(true);
      toastBus.show({ message: ru.billing.activated, severity: "success" });
      navigation.navigate("UserTabs");
    } catch {
      toastBus.show({
        message: ru.billing.activateFail,
        severity: "error",
      });
    } finally {
      setContinuing(false);
    }
  };

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={[styles.root, { backgroundColor: tokens.colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: tokens.colors.onSurface }]}>{ru.billing.customizeTitle}</Text>

        <View style={[styles.selectedPlanCard, { backgroundColor: tokens.colors.surface, borderColor: tokens.colors.border }]}>
          <Text style={[styles.selectedPlan, { color: tokens.colors.onSurface }]}>
            {ru.billing.selectedPlan} {planName}
          </Text>
          <Text style={[styles.basePrice, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.billing.basePrice} {basePrice}
            {ru.billing.currencySuffix} / {ru.billing.perMonth}
          </Text>
        </View>

        <View style={styles.addOnList}>
          {ADD_ONS.map((addOn) => {
            const isOn = !!selected[addOn.id];
            return (
              <Pressable
                key={addOn.id}
                style={[styles.addOnCard, { backgroundColor: tokens.colors.surface, borderColor: tokens.colors.border }]}
                onPress={() => toggle(addOn.id)}
              >
                <View style={styles.addOnHead}>
                  <Text style={[styles.addOnTitle, { color: tokens.colors.onSurface }]}>{addOn.title}</Text>
                  <View
                    style={[
                      styles.switchTrack,
                      { backgroundColor: isOn ? "#14532D" : "#27272A", borderColor: isOn ? "#84CC16" : "#3F3F46" },
                    ]}
                  >
                    <View style={[styles.switchThumb, isOn && styles.switchThumbOn]} />
                  </View>
                </View>
                <Text style={[styles.addOnDesc, { color: tokens.colors.onSurfaceMuted }]}>{addOn.description}</Text>
                <Text style={[styles.addOnPrice, { color: "#C4F82A" }]}>
                  +{addOn.monthlyPrice}
                  {ru.billing.currencySuffix} / {ru.billing.perMonth}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>{ru.billing.totalMonthly}</Text>
          <Text style={styles.totalValue}>
            {total}
            {ru.billing.currencySuffix}
          </Text>
          <Text style={styles.totalHint}>{ru.billing.totalHint}</Text>
        </View>

        <ActionButton
          label={continuing ? ru.billing.saving : ru.billing.continuePay}
          onPress={() => void onContinue()}
          loading={continuing}
          disabled={continuing}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl * 2,
    gap: 12,
  },
  title: { fontSize: 24, fontWeight: "700", letterSpacing: -0.3 },
  selectedPlanCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  selectedPlan: { fontSize: 13, fontWeight: "600" },
  basePrice: { fontSize: 12, fontWeight: "500" },
  addOnList: { gap: 10 },
  addOnCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  addOnHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  addOnTitle: { flex: 1, fontSize: 14, fontWeight: "700" },
  addOnDesc: { fontSize: 12, lineHeight: 18 },
  addOnPrice: { fontSize: 13, fontWeight: "600" },
  switchTrack: {
    width: 42,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  switchThumb: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#A1A1AA",
  },
  switchThumbOn: {
    alignSelf: "flex-end",
    backgroundColor: "#C4F82A",
  },
  totalCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#14532D",
    backgroundColor: "#052E16",
    padding: 12,
    gap: 4,
  },
  totalLabel: { fontSize: 12, fontWeight: "600", color: "#86EFAC" },
  totalValue: { fontSize: 26, fontWeight: "700", color: "#C4F82A", letterSpacing: -0.4 },
  totalHint: { fontSize: 11, fontWeight: "500", color: "#4ADE80" },
});
