import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { HAS_MAP_SUPPORT, MAP_PROVIDER } from "./mapProvider";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { MapPin } from "lucide-react-native";
import { ActionButton } from "../ui/ActionButton";
import { useAppTheme } from "../../theme";
import { ru } from "../../locale/ru";
import { ENV } from "../../config/env";
import { fetchGoogleFormattedAddress } from "../../utils/googleMapsGeocode";
import { toastBus } from "../../ui/feedback/toastBus";

export const DEFAULT_MAP_REGION = {
  latitude: 55.751244,
  longitude: 37.618423,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};
const MOVE_ANIM_MS = 380;

function formatGeocodedAddress(a: Location.LocationGeocodedAddress): string {
  const line1 = [a.street, a.streetNumber].filter(Boolean).join(a.streetNumber ? ", " : "");
  const parts = [line1 || a.name, a.city || a.district, a.region, a.country].filter(
    (x): x is string => Boolean(x),
  );
  return parts.join(", ");
}

export type MapAddressValue = {
  address: string;
  latitude: number;
  longitude: number;
};

type Props = {
  address: string;
  latitude?: number;
  longitude?: number;
  onChange: (next: MapAddressValue) => void;
  error?: string;
};

/**
 * Превью адреса + открытие полноэкранной карты (как на экране создания точки).
 */
export function MapAddressPicker({ address, latitude, longitude, onChange, error }: Props) {
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const hasMapKey = HAS_MAP_SUPPORT;

  const [mapOpen, setMapOpen] = useState(false);
  const [draft, setDraft] = useState({
    lat: DEFAULT_MAP_REGION.latitude,
    lng: DEFAULT_MAP_REGION.longitude,
  });
  const [mapLoading, setMapLoading] = useState(false);
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [showUserLocation, setShowUserLocation] = useState(false);
  const [poiHint, setPoiHint] = useState<string | null>(null);
  const [markerAnimating, setMarkerAnimating] = useState(false);
  const [addressResolving, setAddressResolving] = useState(false);
  const [previewInModal, setPreviewInModal] = useState("");
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

  const resolveAddressLine = useCallback(async (lat: number, lng: number, placeId?: string) => {
    setAddressResolving(true);
    try {
      const apiKey = Platform.OS === "ios" ? ENV.mapsApiKeyIos : ENV.mapsApiKeyAndroid;
      if (apiKey) {
        const g = await fetchGoogleFormattedAddress(apiKey, lat, lng, placeId);
        if (g) {
          setPreviewInModal(g);
          return;
        }
      }
      try {
        const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const first = places[0];
        const formatted = first ? formatGeocodedAddress(first) : "";
        setPreviewInModal(formatted || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      } catch {
        setPreviewInModal(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
    } finally {
      setAddressResolving(false);
    }
  }, []);

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
          latitudeDelta: DEFAULT_MAP_REGION.latitudeDelta,
          longitudeDelta: DEFAULT_MAP_REGION.longitudeDelta,
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

  const openMapPicker = useCallback(async () => {
    if (Platform.OS === "android" && !hasMapKey) {
      toastBus.show({
        message: ru.operatorScreens.mapNotConfigured,
        severity: "warning",
      });
      return;
    }

    setMapLoading(true);
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
      lat = DEFAULT_MAP_REGION.latitude;
      lng = DEFAULT_MAP_REGION.longitude;
    }

    setDraft({ lat, lng });
    setMarkerAnimating(false);
    setPreviewInModal(address?.trim() ?? "");
    setMapLoading(false);
    void resolveAddressLine(lat, lng);
  }, [hasMapKey, latitude, longitude, address, resolveAddressLine]);

  const confirmMapPick = useCallback(async () => {
    setGeocodeBusy(true);
    try {
      const lat = draft.lat;
      const lng = draft.lng;

      let base = address?.trim() ?? "";
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

      onChange({ address: merged, latitude: lat, longitude: lng });
    } catch {
      onChange({ address: `${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}`, latitude: draft.lat, longitude: draft.lng });
    } finally {
      setGeocodeBusy(false);
      setMapOpen(false);
      setPoiHint(null);
      clearDraftSyncTimer();
    }
  }, [draft.lat, draft.lng, poiHint, address, onChange]);

  const closeMapModal = useCallback(() => {
    clearDraftSyncTimer();
    setMarkerAnimating(false);
    setMapOpen(false);
    setPoiHint(null);
  }, []);

  const hasPoint = latitude != null && longitude != null;

  return (
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
        <Text style={[styles.addressPreviewText, { color: tokens.colors.onSurface }]} numberOfLines={6}>
          {hasPoint ? address?.trim() || `${latitude!.toFixed(5)}, ${longitude!.toFixed(5)}` : ru.venueForm.addressEmpty}
        </Text>
      </View>
      {error ? (
        <Text style={[styles.fieldError, { color: tokens.colors.danger }]}>{error}</Text>
      ) : null}
      <ActionButton
        variant="secondary"
        label={hasPoint ? ru.venueForm.changeOnMap : ru.venueForm.pickOnMap}
        onPress={() => void openMapPicker()}
        size="large"
      />

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
              <Text
                style={[styles.poiChip, { color: tokens.colors.primary, borderColor: tokens.colors.border }]}
                numberOfLines={2}
              >
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
            ) : previewInModal?.trim() ? (
              <Text style={[styles.mapResolvedAddress, { color: tokens.colors.onSurface }]} numberOfLines={4}>
                {previewInModal}
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
                  latitudeDelta: DEFAULT_MAP_REGION.latitudeDelta,
                  longitudeDelta: DEFAULT_MAP_REGION.longitudeDelta,
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
                      latitudeDelta: DEFAULT_MAP_REGION.latitudeDelta,
                      longitudeDelta: DEFAULT_MAP_REGION.longitudeDelta,
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
                    const { latitude: plat, longitude: plng } = e.nativeEvent.coordinate;
                    setDraft({ lat: plat, lng: plng });
                    void resolveAddressLine(plat, plng);
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
    </View>
  );
}

const styles = StyleSheet.create({
  addressBlock: { gap: 10 },
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
