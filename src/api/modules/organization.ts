import { apiClient } from "../client";

export interface OrganizationMember {
  id: string;
  organizationId: string;
  role: string;
  /** null = org-wide member (organization invite); set = bound to a single venue */
  venueId?: string | null;
  organization: {
    id: string;
    name: string;
    type: string;
    slug: string;
    venues: Venue[];
    _count?: { members: number };
  };
}

export interface Venue {
  id: string;
  organizationId: string;
  name: string;
  address?: string | null;
  apartment?: string | null;
  floor?: string | null;
  entrance?: string | null;
  doorCode?: string | null;
  addressNotes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** Склеивает поля адреса точки для отображения (как на форме). */
export function formatVenueAddress(v: Pick<Venue, "address" | "apartment" | "floor" | "entrance" | "doorCode" | "addressNotes" | "latitude" | "longitude">): string {
  const bits: string[] = [];
  if (v.address?.trim()) bits.push(v.address.trim());
  if (v.apartment?.trim()) bits.push(`кв. ${v.apartment.trim()}`);
  if (v.floor?.trim()) bits.push(`эт. ${v.floor.trim()}`);
  if (v.entrance?.trim()) bits.push(`подъезд ${v.entrance.trim()}`);
  if (v.doorCode?.trim()) bits.push(`домофон: ${v.doorCode.trim()}`);
  if (v.addressNotes?.trim()) bits.push(v.addressNotes.trim());
  if (bits.length === 0 && v.latitude != null && v.longitude != null) {
    return `${v.latitude.toFixed(5)}, ${v.longitude.toFixed(5)}`;
  }
  return bits.join(" · ");
}

export const organizationApi = {
  async getMyOrganizations() {
    const { data } = await apiClient.get<OrganizationMember[]>("/organization/my");
    return data;
  },
  async create(payload: { name: string }) {
    const { data } = await apiClient.post<OrganizationMember["organization"]>("/organization", payload);
    return data;
  },
};

export type BindVenueResponse =
  | {
      bindType: "venue";
      id: string;
      name: string;
      organization: { id: string; name: string };
    }
  | {
      bindType: "organization";
      organization: { id: string; name: string };
    };

export const venueApi = {
  async list(organizationId: string) {
    const { data } = await apiClient.get<Venue[]>(`/venue/organization/${organizationId}`);
    return data;
  },
  async create(
    organizationId: string,
    payload: {
      name: string;
      address?: string;
      apartment?: string;
      floor?: string;
      entrance?: string;
      doorCode?: string;
      addressNotes?: string;
      latitude?: number;
      longitude?: number;
    },
  ) {
    const { data } = await apiClient.post<Venue>(`/venue/organization/${organizationId}`, payload);
    return data;
  },
  async bind(inviteCode: string): Promise<BindVenueResponse> {
    const { data } = await apiClient.post<BindVenueResponse>("/venue/bind", {
      inviteCode: inviteCode.trim().toUpperCase(),
    });
    return data;
  },
};
