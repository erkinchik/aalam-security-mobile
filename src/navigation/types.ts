import { NavigatorScreenParams } from "@react-navigation/native";
import { Role } from "../types/common";

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token: string };
  Terms: undefined;
  Privacy: undefined;
};

export type CommonStackParamList = {
  Forbidden: undefined;
  Profile: undefined;
  NetworkOffline: undefined;
  Terms: undefined;
  Privacy: undefined;
  MyOrganizations: undefined;
  RequestNewOrganization: undefined;
  OrganizationRequestSubmitted: undefined;
  OrganizationVenues: { organizationId: string; organizationName: string };
  CreateVenue: { organizationId: string; organizationName: string };
};

export type UserTabParamList = {
  Home: undefined;
  History: undefined;
  Profile: undefined;
};

export type UserStackParamList = {
  UserTabs: undefined;
  UserActiveEmergency: { sessionId: string } | undefined;
  UserEmergencyDetails: { sessionId: string };
  /** Overview for users with an organization membership (same visual language as Home). */
  UserOrganization: undefined;
  UserBindVenue: undefined;
  UserEditDetails: undefined;
  UserBillingPlans: undefined;
  UserBillingAddons: { planName: string; basePrice: number };
  UserSubscriptionRequest: undefined;
};

export type OperatorTabParamList = {
  Dashboard: undefined;
  History: undefined;
};

export type OperatorStackParamList = {
  OperatorShiftGate: undefined;
  OperatorTabs: NavigatorScreenParams<OperatorTabParamList> | undefined;
  OperatorSessionDetails: { sessionId: string };
  OperatorLiveMap: { sessionId: string };
  OperatorResolveModal: { sessionId: string };
};

export type AdminTabParamList = {
  Home: undefined;
};

export type AdminStackParamList = {
  AdminTabs: undefined;
  AdminCreateOperator: undefined;
  AdminCreateOperatorSuccess: undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  AuthLoading: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  Common: NavigatorScreenParams<CommonStackParamList> | undefined;
  User: NavigatorScreenParams<UserStackParamList> | undefined;
  Operator: NavigatorScreenParams<OperatorStackParamList> | undefined;
  Admin: undefined;
};

export const roleToRootScreen: Record<Role, keyof RootStackParamList> = {
  USER: "User",
  OPERATOR: "Operator",
  ADMIN: "Admin",
};
