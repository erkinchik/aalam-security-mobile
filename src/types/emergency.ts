export type EmergencyStatus = "NEW" | "ASSIGNED" | "IN_PROGRESS" | "CLOSED";

export interface EmergencyLocation {
  id?: string;
  sessionId?: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  createdAt?: string;
}

/** Приходит с бэка при старте SOS; координаты филиала для режима «объект» */
export interface EmergencyVenueRef {
  id: string;
  name?: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  /** Детали входа — нужны ГБР, чтобы попасть в здание. */
  apartment?: string | null;
  floor?: string | null;
  entrance?: string | null;
  doorCode?: string | null;
  addressNotes?: string | null;
}

export interface EmergencySession {
  id: string;
  userId: string;
  assignedOperatorId?: string | null;
  status: EmergencyStatus;
  createdAt: string;
  closedAt?: string | null;
  resolution?: string | null;
  locations?: EmergencyLocation[];
  venueId?: string | null;
  emergencyType?: "PERSONAL" | "VENUE";
  venue?: EmergencyVenueRef | null;
  organization?: { id: string; name: string } | null;
  user?: {
    id: string;
    email: string;
    role: "USER" | "OPERATOR" | "ADMIN";
    displayName?: string | null;
    phone?: string | null;
  };
  assignedOperator?: {
    id: string;
    email: string;
  } | null;
}

/** Состояние смены оператора — GET/POST /dispatch/shift* */
export interface OperatorShift {
  onShift: boolean;
  shiftStartedAt: string | null;
  activeSessionCount: number;
}
