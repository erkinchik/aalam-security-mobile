import { apiClient } from "../client";

export interface OrganizationApplicationBranch {
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
}

export interface OrganizationApplicationAttachmentInput {
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface CreateOrganizationApplicationPayload {
  organizationName: string;
  organizationType: string;
  branches: OrganizationApplicationBranch[];
  contactEmail: string;
  contactPhone: string;
  description?: string;
  attachments?: OrganizationApplicationAttachmentInput[];
}

export interface OrganizationApplicationAttachment {
  id: string;
  applicationId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  storageKey: string | null;
  createdAt: string;
}

export interface OrganizationApplication {
  id: string;
  userId: string;
  organizationName: string;
  organizationType: string;
  branches: OrganizationApplicationBranch[];
  contactEmail: string;
  contactPhone: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  attachments: OrganizationApplicationAttachment[];
}

export const organizationApplicationApi = {
  async create(payload: CreateOrganizationApplicationPayload) {
    const { data } = await apiClient.post<OrganizationApplication>(
      "/organization-applications",
      payload,
    );
    return data;
  },
};
