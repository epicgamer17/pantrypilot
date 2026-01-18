import Constants from 'expo-constants';

type Auth0Config = {
  auth0Domain?: string;
  auth0ClientId?: string;
  apiBaseUrl?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Auth0Config;

export const AUTH0_DOMAIN = extra.auth0Domain ?? '';
export const AUTH0_CLIENT_ID = extra.auth0ClientId ?? '';
export const API_BASE_URL = extra.apiBaseUrl ?? 'http://localhost:3001';
