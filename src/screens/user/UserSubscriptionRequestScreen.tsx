import React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { UserStackParamList } from "../../navigation/types";
import { useAppTheme } from "../../theme";
import { spacing } from "../../theme";
import { ActionButton } from "../../components/ui/ActionButton";
import { AppCard } from "../../components/ui/AppCard";
import { AppInput } from "../../components/ui/AppInput";
import { ru } from "../../locale/ru";
import {
  subscriptionRequestApi,
  SubscriptionRequest,
} from "../../api/modules/subscriptionRequest";
import { toastBus } from "../../ui/feedback/toastBus";
import { useAuthStore } from "../../stores/authStore";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = NativeStackScreenProps<
  UserStackParamList,
  "UserSubscriptionRequest"
>;

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export const UserSubscriptionRequestScreen = ({ navigation }: Props) => {
  const { tokens } = useAppTheme();
  const [request, setRequest] = React.useState<SubscriptionRequest | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  // Активна ли подписка — решает профиль, а не статус заявки: заявка остаётся
  // APPROVED навсегда, а подписка выдаётся на срок. Раньше после окончания
  // срока экран показывал «Подписка активна» без формы, и продлить было нельзя.
  const profile = useAuthStore((state) => state.user);
  const subActive = profile?.individualSubscriptionActive === true;

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Профиль перечитываем вместе с заявкой: срок мог истечь, пока экран
      // был закрыт.
      const [data] = await Promise.all([
        subscriptionRequestApi.getCurrent(),
        useAuthStore.getState().refreshMe(),
      ]);
      setRequest(data);
    } catch {
      toastBus.show({
        message: ru.subscriptionRequest.loadFail,
        severity: "error",
      });
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      void load(true);
    });
    return unsubscribe;
  }, [navigation, load]);

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      const created = await subscriptionRequestApi.create({
        comment: comment.trim() ? comment.trim() : undefined,
      });
      setRequest(created);
      setComment("");
      toastBus.show({
        message: ru.subscriptionRequest.submitSuccess,
        severity: "success",
      });
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      const message =
        status === 409
          ? ru.subscriptionRequest.alreadyPending
          : ru.subscriptionRequest.submitError;
      toastBus.show({ message, severity: "error" });
      if (status === 409) {
        void load(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderFormCard = () => (
    <>
      <AppCard>
        <Text style={[styles.title, { color: tokens.colors.onSurface }]}>
          {ru.subscriptionRequest.emptyTitle}
        </Text>
        <Text style={[styles.subtitle, { color: tokens.colors.onSurfaceMuted }]}>
          {ru.subscriptionRequest.emptySubtitle}
        </Text>
      </AppCard>

      <AppCard>
        <Text style={[styles.label, { color: tokens.colors.onSurface }]}>
          {ru.subscriptionRequest.commentLabel}
        </Text>
        <AppInput
          value={comment}
          onChangeText={setComment}
          placeholder={ru.subscriptionRequest.commentPlaceholder}
          multiline
          numberOfLines={3}
          maxLength={500}
          style={styles.textarea}
        />
      </AppCard>

      <ActionButton
        label={
          submitting
            ? ru.subscriptionRequest.submitting
            : ru.subscriptionRequest.submitButton
        }
        onPress={() => void onSubmit()}
        loading={submitting}
        disabled={submitting}
      />
    </>
  );

  const renderPendingCard = (req: SubscriptionRequest) => (
    <AppCard accent={tokens.colors.warning ?? "#F59E0B"}>
      <Text style={[styles.title, { color: tokens.colors.onSurface }]}>
        {ru.subscriptionRequest.pendingTitle}
      </Text>
      <Text style={[styles.subtitle, { color: tokens.colors.onSurfaceMuted }]}>
        {ru.subscriptionRequest.pendingSubtitle}
      </Text>
      <View style={styles.kvRow}>
        <Text style={[styles.kvKey, { color: tokens.colors.onSurfaceMuted }]}>
          {ru.subscriptionRequest.pendingSubmittedAt}
        </Text>
        <Text style={[styles.kvVal, { color: tokens.colors.onSurface }]}>
          {formatDate(req.createdAt)}
        </Text>
      </View>
      {req.comment ? (
        <View style={styles.kvCol}>
          <Text style={[styles.kvKey, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.subscriptionRequest.pendingComment}
          </Text>
          <Text style={[styles.kvVal, { color: tokens.colors.onSurface }]}>
            {req.comment}
          </Text>
        </View>
      ) : null}
    </AppCard>
  );

  const renderApprovedCard = (until: string | null) => (
    <AppCard accent={tokens.colors.success ?? "#22C55E"}>
      <Text style={[styles.title, { color: tokens.colors.onSurface }]}>
        {ru.subscriptionRequest.approvedTitle}
      </Text>
      <View style={styles.kvRow}>
        <Text style={[styles.kvKey, { color: tokens.colors.onSurfaceMuted }]}>
          {ru.subscriptionRequest.approvedUntil}
        </Text>
        <Text style={[styles.kvVal, { color: tokens.colors.onSurface }]}>
          {formatDate(until)}
        </Text>
      </View>
    </AppCard>
  );

  const renderExpiredCard = (endedAt: string | null) => (
    <>
      <AppCard accent={tokens.colors.danger}>
        <Text style={[styles.title, { color: tokens.colors.onSurface }]}>
          {ru.subscriptionRequest.expiredTitle}
        </Text>
        <View style={styles.kvRow}>
          <Text style={[styles.kvKey, { color: tokens.colors.onSurfaceMuted }]}>
            {ru.subscriptionRequest.expiredOn}
          </Text>
          <Text style={[styles.kvVal, { color: tokens.colors.onSurface }]}>
            {formatDate(endedAt)}
          </Text>
        </View>
      </AppCard>
      {renderFormCard()}
    </>
  );

  const renderRejectedCard = (req: SubscriptionRequest) => (
    <>
      <AppCard accent={tokens.colors.danger}>
        <Text style={[styles.title, { color: tokens.colors.onSurface }]}>
          {ru.subscriptionRequest.rejectedTitle}
        </Text>
        {req.rejectionReason ? (
          <View style={styles.kvCol}>
            <Text style={[styles.kvKey, { color: tokens.colors.onSurfaceMuted }]}>
              {ru.subscriptionRequest.rejectedReason}
            </Text>
            <Text style={[styles.kvVal, { color: tokens.colors.onSurface }]}>
              {req.rejectionReason}
            </Text>
          </View>
        ) : null}
      </AppCard>
      {renderFormCard()}
    </>
  );

  let body: React.ReactNode;
  if (loading) {
    body = (
      <View style={styles.loader}>
        <ActivityIndicator color={tokens.colors.primary} />
      </View>
    );
  } else if (request?.status === "PENDING") {
    body = renderPendingCard(request);
  } else if (subActive) {
    body = renderApprovedCard(profile?.subscriptionExpiresAt ?? request?.expiresAt ?? null);
  } else if (request?.status === "REJECTED") {
    body = renderRejectedCard(request);
  } else if (request?.status === "APPROVED") {
    // Одобренная заявка при неактивной подписке — срок вышел, нужна новая.
    body = renderExpiredCard(profile?.subscriptionExpiresAt ?? request.expiresAt);
  } else {
    body = renderFormCard();
  }

  return (
    <SafeAreaView edges={["bottom", "left", "right"]}
      style={[styles.root, { backgroundColor: tokens.colors.background }]}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            tintColor={tokens.colors.primary}
          />
        }
      >
        {body}
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
  title: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
  subtitle: { fontSize: 13, fontWeight: "500", marginTop: 4, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  textarea: {
    minHeight: 80,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  kvCol: { marginTop: 12, gap: 4 },
  kvKey: { fontSize: 12, fontWeight: "500" },
  kvVal: { fontSize: 14, fontWeight: "600" },
  loader: { paddingVertical: 40, alignItems: "center" },
});
