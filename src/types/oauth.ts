/**
 * OAuth Authority Types
 * 
 * Defines the structure for OAuth providers as authorities (CEO 051).
 * Each Google service becomes a separate provider authority.
 */

export type OAuthProvider = 
  | "google-drive"
  | "google-contacts"
  | "google-gmail"
  | "google-calendar"
  | "google-maps"
  | "google-business-profile";

export interface OAuthProviderConfig {
  id: OAuthProvider;
  name: string;
  description: string;
  scopes: string[];
  enabled: boolean;
}

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: string;
}

export interface OAuthAuthority {
  version: string;
  providers: OAuthProviderConfig[];
  generatedAt: string;
}
