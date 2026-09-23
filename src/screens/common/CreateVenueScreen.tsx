import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import MapView, { Marker } from "react-native-maps";
import { HAS_MAP_SUPPORT, MAP_PROVIDER } from "../../components/maps/mapProvider";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { MapPin } from "lucide-react-native";
import { CommonStackParamList } from "../../navigation/types";
import { venueApi } from "../../api/modules/organization";
import { AppInput } from "../../components/ui/AppInput";
import { ActionButton } from "../../components/ui/ActionButton";
import { toastBus } from "../../ui/feedback/toastBus";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";
import { ENV } from "../../config/env";
import { fetchGoogleFormattedAddress } from "../../utils/googleMapsGeocode";

// Бишкек: сюда карта открывается, если геолокация недоступна. Раньше — Москва.
const DEFAULT_REGION = { latitude: 42.8746, longitude: 74.5698, latitudeDelta: 0.012, longitudeDelta: 0.012 };
const MOVE_ANIM_MS = 380;

function formatGeocodedAddress(a: Location.LocationGeocodedAddress): string {
  const line1 = [a.street, a.streetNumber].filter(Boolean).join(a.streetNumber ? ", " : "");
  const parts = [line1 || a.name, a.city || a.district, a.region, a.country].filter(
    (x): x is string => Boolean(x),
  );
  return parts.join(", ");
}

/** Собирает одну строку адреса для API из базы (карта/геокод) и деталей. */
function composeVenueAddressLine(v: {
  address?: string;
  apartment?: string;
  floor?: string;
  entrance?: string;
  doorCode?: string;
  addressNotes?: string;
}): string | undefined {
  const base = v.address?.trim() ?? "";
  const bits: string[] = [];
  if (v.apartment?.trim()) bits.push(`кв. ${v.apartment.trim()}`);
  if (v.floor?.trim()) bits.push(`эт. ${v.floor.trim()}`);
  if (v.entrance?.trim()) bits.push(`подъезд ${v.entrance.trim()}`);
  if (v.doorCode?.trim()) bits.push(`домофон: ${v.doorCode.trim()}`);
  if (v.addressNotes?.trim()) bits.push(v.addressNotes.trim());
  const detail = bits.join(" · ");
  if (!base && !detail) return undefined;
  if (!detail) return base || undefined;
  if (!base) return detail;
  return `${base} · ${detail}`;
}

const buildSchema = () =>
  z
    .object({
      name: z.string().min(1, ru.validation.nameRequired),
      address: z.string().optional(),
      apartment: z.string().optional(),
      floor: z.string().optional(),
      entrance: z.string().optional(),
      doorCode: z.string().optional(),
      addressNotes: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.latitude == null || data.longitude == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: ru.validation.venueLocationRequired,
          path: ["latitude"],
        });
      }
    });

type FormValues = z.infer<ReturnType<typeof buildSchema>>;
type Props = NativeStackScreenProps<CommonStackParamList, "CreateVenue">;

export const CreateVenueScreen = ({ route, navigation }: Props) => {
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { organizationId, organizationName } = route.params;
  const queryClient = useQueryClient();
  const schema = React.useMemo(() => buildSchema(), []);
  const hasMapKey = HAS_MAP_SUPPORT;

  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      address: "",
      apartment: "",
      floor: "",
      entrance: "",
      doorCode: "",
      addressNotes: "",
      latitude: undefined,
      longitude: undefined,
    },
  });

  const latitude = watch("latitude");
  const longitude = watch("longitude");
  const addressText = watch("address");
  const apartment = watch("apartment");
  const floor = watch("floor");
  const entrance = watch("entrance");
  const doorCode = watch("doorCode");
  const addressNotes = watch("addressNotes");

  const composedAddressPreview = React.useMemo(
    () =>
      composeVenueAddressLine({
        address: addressText || undefined,
        apartment: apartment || undefined,
        floor: floor || undefined,
        entrance: entrance || undefined,
        doorCode: doorCode || undefined,
        addressNotes: addressNotes || undefined,
      }),
    [addressText, apartment, floor, entrance, doorCode, addressNotes],
  );

  const [mapOpen, setMapOpen] = useState(false);
  const [draft, setDraft] = useState({ lat: DEFAULT_REGION.latitude, lng: DEFAULT_REGION.longitude });
  const [mapLoading, setMapLoading] = useState(false);
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [showUserLocation, setShowUserLocation] = useState(false);
  const [poiHint, setPoiHint] = useState<string | null>(null);
  const [markerAnimating, setMarkerAnimating] = useState(false);
  const [addressResolving, setAddressResolving] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  const markerRef = useRef<React.ComponentRef<typeof Marker>>(null);
  const draftSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPoiClickAt = useRef(0);

  const clearDraftSyncTimer = () => {
    if (draftSyncTimer.current) {
      clearTimeout(draftSyncTimer.current);
      draftSyncTimer.current = null;
    }
  };

  const resolveAddressLine = useCallback(
    async (lat: number, lng: number, placeId?: string) => {
      setAddressResolving(true);
      // Ответ геокодера мог прийти уже после «Отмены» и затереть восстановленный
      // адрес — пишем, только пока карта открыта.
      const applyAddress = (value: string) => {
        if (mapOpenRef.current) setValue("address", value, { shouldValidate: true });
      };
      try {
        const apiKey = Platform.OS === "ios" ? ENV.mapsApiKeyIos : ENV.mapsApiKeyAndroid;
        if (apiKey) {
          const g = await fetchGoogleFormattedAddress(apiKey, lat, lng, placeId);
          if (g) {
            applyAddress(g);
            return;
          }
        }
        try {
          const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          const first = places[0];
          const formatted = first ? formatGeocodedAddress(first) : "";
          applyAddress(formatted || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        } catch {
          applyAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
      } finally {
        setAddressResolving(false);
      }
    },
    [setValue],
  );

  const movePinSmooth = useCallback(
    (lat: number, lng: number, poiName: string | null | undefined, placeId?: string) => {
      clearDraftSyncTimer();
      setPoiHint(poiName ?? null);
      setMarkerAnimating(true);
      markerRef.current?.animateMarkerToCoordinate({ latitude: lat, longitude: lng }, MOVE_ANIM_MS);
      mapRef.current?.animateToRegion(
        {
          latitude: lat,
          longitude: lng,
          latitudeDelta: DEFAULT_REGION.latitudeDelta,
          longitudeDelta: DEFAULT_REGION.longitudeDelta,
        },
        MOVE_ANIM_MS,
      );
      draftSyncTimer.current = setTimeout(() => {
        setDraft({ lat, lng });
        setMarkerAnimating(false);
        draftSyncTimer.current = null;
        void resolveAddressLine(lat, lng, placeId);
      }, MOVE_ANIM_MS);
    },
    [resolveAddressLine],
  );

  const addressBeforeMapRef = React.useRef("");
  const mapOpenRef = React.useRef(false);

  const openMapPicker = useCallback(async () => {
    if (Platform.OS === "android" && !hasMapKey) {
      toastBus.show({
        message: ru.operatorScreens.mapNotConfigured,
        severity: "warning",
      });
      return;
    }

    setMapLoading(true);
    // Карта пишет адрес в форму на каждом сдвиге точки. Запоминаем, что было, —
    // «Отмена» должна вернуть и точку, и адрес, а не оставить новый текст при
    // старых координатах.
    addressBeforeMapRef.current = getValues("address") ?? "";
    mapOpenRef.current = true;
    setMapOpen(true);
    setPoiHint(null);
    clearDraftSyncTimer();

    let lat = latitude ?? null;
    let lng = longitude ?? null;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setShowUserLocation(status === Location.PermissionStatus.GRANTED);
      if ((lat == null || lng == null) && status === Location.PermissionStatus.GRANTED) {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }
    } catch {
      toastBus.show({ message: ru.venueForm.mapInitError, severity: "info" });
      setShowUserLocation(false);
    }

    if (lat == null || lng == null) {
      lat = DEFAULT_REGION.latitude;
      lng = DEFAULT_REGION.longitude;
    }

    setDraft({ lat, lng });
    setMarkerAnimating(false);
    setMapLoading(false);
  }, [hasMapKey, latitude, longitude]);

  const confirmMapPick = useCallback(async () => {
    setGeocodeBusy(true);
    try {
      const lat = draft.lat;
      const lng = draft.lng;
      setValue("latitude", lat, { shouldValidate: true });
      setValue("longitude", lng, { shouldValidate: true });

      // Адрес для новой точки ещё ищется — в форме пока адрес старой. Берём не
      // его, а ищем сами: поздний ответ после закрытия карты уже не запишется.
      let base = addressResolving ? "" : (getValues("address")?.trim() ?? "");
      const looksLikeCoordsOnly = /^\s*-?\d+\.\d+\s*,\s*-?\d+\.\d+\s*$/.test(base);

      if (!base || looksLikeCoordsOnly) {
        const apiKey = Platform.OS === "ios" ? ENV.mapsApiKeyIos : ENV.mapsApiKeyAndroid;
        if (apiKey) {
          base = (await fetchGoogleFormattedAddress(apiKey, lat, lng)) || "";
        }
        if (!base) {
          try {
            const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
            const first = places[0];
            base = first ? formatGeocodedAddress(first) : "";
          } catch {
            base = "";
          }
        }
        if (!base) base = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }

      const merged =
        poiHint && poiHint.trim().length > 0 && !base.includes(poiHint.trim())
          ? `${poiHint.trim()}, ${base}`
          : base;
      setValue("address", merged, { shouldValidate: true });
    } catch {
      setValue("address", `${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}`, { shouldValidate: true });
    } finally {
      setGeocodeBusy(false);
      mapOpenRef.current = false;
      setMapOpen(false);
      setPoiHint(null);
      clearDraftSyncTimer();
    }
  }, [draft.lat, draft.lng, poiHint, getValues, setValue, addressResolving]);

  const closeMapModal = useCallback(() => {
    clearDraftSyncTimer();
    setMarkerAnimating(false);
    mapOpenRef.current = false;
    setMapOpen(false);
    setPoiHint(null);
    // Без проверки: «Отмена» на пустой форме не должна сразу подсвечивать ошибку.
    setValue("address", addressBeforeMapRef.current);
  }, [setValue]);

  const createMutation = useMutation({
    mutationFn: (payload: FormValues) => {
      if (payload.latitude == null || payload.longitude == null) {
        return Promise.reject(new Error("location"));
      }
      return venueApi.create(organizationId, {
        name: payload.name,
        address: payload.address?.trim() || undefined,
        apartment: payload.apartment?.trim() || undefined,
        floor: payload.floor?.trim() || undefined,
        entrance: payload.entrance?.trim() || undefined,
        doorCode: payload.doorCode?.trim() || undefined,
        addressNotes: payload.addressNotes?.trim() || undefined,
        latitude: payload.latitude,
        longitude: payload.longitude,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venues", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toastBus.show({ message: ru.orgFlow.venueAdded, severity: "success" });
      navigation.goBack();
    },
    onError: () => {
      toastBus.show({ message: ru.orgFlow.venueAddFail, severity: "error" });
    },
  });

  const onSubmit = (values: FormValues) => {
    createMutation.mutate(values);
  };

  const hasPoint = latitude != null && longitude != null;

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
          <Text style={[styles.orgLabel, { color: tokens.colors.onSurfaceMuted }]}>{organizationName}</Text>
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: tokens.colors.surface,
              borderColor: tokens.colors.border,
            },
          ]}
        >
          <View style={styles.form}>
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, value } }) => (
                <AppInput
                  label={ru.venueForm.name}
                  placeholder={ru.venueForm.namePh}
                  value={value}
                  onChangeText={onChange}
                  error={errors.name?.message}
                  autoComplete="off"
                />
              )}
            />

            <View style={styles.addressBlock}>
              <Text style={[styles.sectionLabel, { color: tokens.colors.onSurfaceMuted }]}>
                {ru.venueForm.addressSection}
              </Text>
              <View
                style={[
                  styles.addressPreview,
                  {
                    backgroundColor: tokens.colors.background,
                    borderColor: tokens.colors.border,
                  },
                ]}
              >
                <MapPin size={20} color={tokens.colors.primary} strokeWidth={2} />
                <Text
                  style={[styles.addressPreviewText, { color: tokens.colors.onSurface }]}
                  numberOfLines={6}
                >
                  {hasPoint
                    ? composedAddressPreview ||
                      addressText ||
                      `${latitude!.toFixed(5)}, ${longitude!.toFixed(5)}`
                    : ru.venueForm.addressEmpty}
                </Text>
              </View>
              {errors.latitude?.message ? (
                <Text style={[styles.fieldError, { color: tokens.colors.danger }]}>
                  {errors.latitude.message}
                </Text>
              ) : null}
              <ActionButton
                variant="secondary"
                label={hasPoint ? ru.venueForm.changeOnMap : ru.venueForm.pickOnMap}
                onPress={() => void openMapPicker()}
                size="large"
              />
            </View>

            <View style={styles.detailsBlock}>
              <Text style={[styles.sectionLabel, { color: tokens.colors.onSurfaceMuted }]}>
                {ru.venueForm.addressDetailsSection}
              </Text>
              <Text style={[styles.detailsHint, { color: tokens.colors.onSurfaceMuted }]}>
                {ru.venueForm.addressDetailsHint}
              </Text>
              <View style={styles.detailsRow}>
                <View style={styles.detailsHalf}>
                  <Controller
                    control={control}
                    name="apartment"
                    render={({ field: { onChange, value } }) => (
                      <AppInput
                        placeholder={ru.venueForm.apartment}
                        value={value || ""}
                        onChangeText={onChange}
                        autoComplete="off"
                      />
                    )}
                  />
                </View>
                <View style={styles.detailsHalf}>
                  <Controller
                    control={control}
                    name="floor"
                    render={({ field: { onChange, value } }) => (
                      <AppInput
                        placeholder={ru.venueForm.floor}
                        value={value || ""}
                        onChangeText={onChange}
                        keyboardType="numbers-and-punctuation"
                        autoComplete="off"
                      />
                    )}
                  />
                </View>
              </View>
              <View style={styles.detailsRow}>
                <View style={styles.detailsHalf}>
                  <Controller
                    control={control}
                    name="entrance"
                    render={({ field: { onChange, value } }) => (
                      <AppInput
                        placeholder={ru.venueForm.entrance}
                        value={value || ""}
                        onChangeText={onChange}
                        autoComplete="off"
                      />
                    )}
                  />
                </View>
                <View style={styles.detailsHalf}>
                  <Controller
                    control={control}
                    name="doorCode"
                    render={({ field: { onChange, value } }) => (
                      <AppInput
                        placeholder={ru.venueForm.doorCode}
                        value={value || ""}
                        onChangeText={onChange}
                        autoComplete="off"
                      />
                    )}
                  />
                </View>
              </View>
              <Controller
                control={control}
                name="addressNotes"
                render={({ field: { onChange, value } }) => (
                  <AppInput
                    placeholder={ru.venueForm.addressNotes}
                    value={value || ""}
                    onChangeText={onChange}
                    multiline
                    textAlignVertical="top"
                    style={styles.notesInput}
                    autoComplete="off"
                  />
                )}
              />
            </View>

            <ActionButton
              label={createMutation.isPending ? ru.venueForm.adding : ru.venueForm.submit}
              onPress={handleSubmit(onSubmit)}
              loading={createMutation.isPending}
              disabled={createMutation.isPending || isSubmitting}
              size="large"
              style={styles.submit}
            />
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={mapOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent={Platform.OS === "android"}
        onRequestClose={closeMapModal}
      >
        <View style={[styles.mapModalRoot, { backgroundColor: tokens.colors.background, paddingTop: insets.top }]}>
          <View style={[styles.mapHeader, { borderBottomColor: tokens.colors.border }]}>
            <Text style={[styles.mapTitle, { color: tokens.colors.onSurface }]} numberOfLines={2}>
              {ru.venueForm.mapPickTitle}
            </Text>
            <Text style={[styles.mapHint, { color: tokens.colors.onSurfaceMuted }]} numberOfLines={4}>
              {ru.venueForm.mapPickHint}
            </Text>
            {poiHint ? (
              <Text style={[styles.poiChip, { color: tokens.colors.primary, borderColor: tokens.colors.border }]} numberOfLines={2}>
                {poiHint}
              </Text>
            ) : null}
            {addressResolving ? (
              <View style={styles.mapAddressRow}>
                <ActivityIndicator size="small" color={tokens.colors.primary} />
                <Text style={[styles.mapResolvedAddress, { color: tokens.colors.onSurfaceMuted }]}>
                  {ru.venueForm.resolvingAddress}
                </Text>
              </View>
            ) : addressText?.trim() ? (
              <Text style={[styles.mapResolvedAddress, { color: tokens.colors.onSurface }]} numberOfLines={4}>
                {addressText}
              </Text>
            ) : null}
          </View>

          <View style={styles.mapArea}>
            {mapLoading ? (
              <View style={styles.mapLoading}>
                <ActivityIndicator size="large" color={tokens.colors.primary} />
              </View>
            ) : (
              <MapView
                ref={mapRef}
                provider={MAP_PROVIDER}
                style={StyleSheet.absoluteFill}
                showsUserLocation={showUserLocation}
                showsMyLocationButton={false}
                rotateEnabled
                pitchEnabled={false}
                toolbarEnabled={false}
                poiClickEnabled
                initialRegion={{
                  latitude: draft.lat,
                  longitude: draft.lng,
                  latitudeDelta: DEFAULT_REGION.latitudeDelta,
                  longitudeDelta: DEFAULT_REGION.longitudeDelta,
                }}
                onPress={(e) => {
                  if (Date.now() - lastPoiClickAt.current < 450) return;
                  const c = e.nativeEvent.coordinate;
                  if (!c) return;
                  movePinSmooth(c.latitude, c.longitude, null);
                }}
                onPoiClick={(e) => {
                  lastPoiClickAt.current = Date.now();
                  const { coordinate, name, placeId } = e.nativeEvent;
                  movePinSmooth(
                    coordinate.latitude,
                    coordinate.longitude,
                    name ?? null,
                    typeof placeId === "string" && placeId.length > 0 ? placeId : undefined,
                  );
                }}
                onMapReady={() => {
                  mapRef.current?.animateToRegion(
                    {
                      latitude: draft.lat,
                      longitude: draft.lng,
                      latitudeDelta: DEFAULT_REGION.latitudeDelta,
                      longitudeDelta: DEFAULT_REGION.longitudeDelta,
                    },
                    200,
                  );
                }}
              >
                <Marker
                  ref={markerRef}
                  coordinate={{ latitude: draft.lat, longitude: draft.lng }}
                  draggable
                  anchor={{ x: 0.5, y: 1 }}
                  onDragStart={() => {
                    clearDraftSyncTimer();
                    setPoiHint(null);
                    setMarkerAnimating(false);
                  }}
                  onDragEnd={(e) => {
                    const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
                    setDraft({ lat, lng });
                    void resolveAddressLine(lat, lng);
                  }}
                />
              </MapView>
            )}
          </View>

          <SafeAreaView edges={["bottom"]} style={[styles.mapFooterSafe, { borderTopColor: tokens.colors.border }]}>
            <View style={styles.mapFooterRow}>
              <ActionButton
                variant="secondary"
                label={ru.venueForm.mapCancel}
                onPress={closeMapModal}
                style={styles.mapFooterBtn}
              />
              <ActionButton
                label={geocodeBusy ? ru.venueForm.geocoding : ru.venueForm.mapConfirm}
                onPress={() => void confirmMapPick()}
                loading={geocodeBusy}
                disabled={geocodeBusy || mapLoading || markerAnimating}
                style={styles.mapFooterBtn}
              />
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, padding: 20, paddingBottom: 40 },
  header: { marginBottom: 20, gap: 4 },
  orgLabel: { fontSize: 12, fontWeight: "600" },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  form: { gap: 14 },
  addressBlock: { gap: 10 },
  detailsBlock: { gap: 10 },
  detailsHint: { fontSize: 12, lineHeight: 17 },
  detailsRow: { flexDirection: "row", gap: 10, width: "100%" },
  detailsHalf: { flex: 1, minWidth: 0 },
  notesInput: { minHeight: 88, paddingTop: 14 },
  sectionLabel: { fontSize: 12, fontWeight: "600" },
  addressPreview: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    minHeight: 52,
  },
  addressPreviewText: { flex: 1, fontSize: 14, lineHeight: 20 },
  fieldError: { fontSize: 12, fontWeight: "600" },
  submit: { marginTop: 8 },
  mapModalRoot: { flex: 1 },
  mapHeader: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
    flexShrink: 0,
    maxHeight: 200,
  },
  poiChip: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  mapTitle: { fontSize: 17, fontWeight: "700" },
  mapHint: { fontSize: 13, lineHeight: 18 },
  mapAddressRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  mapResolvedAddress: { fontSize: 13, lineHeight: 18, flex: 1 },
  mapArea: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  mapLoading: { flex: 1, justifyContent: "center", alignItems: "center" },
  mapFooterSafe: {
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  mapFooterRow: { flexDirection: "row", gap: 10, paddingBottom: 4 },
  mapFooterBtn: { flex: 1, minWidth: 0 },
});
