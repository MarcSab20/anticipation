import Cookies from 'js-cookie';

const ACCESS_TOKEN_KEY = 'smp_access_token';
const REFRESH_TOKEN_KEY = 'smp_refresh_token';
const USER_INFO_KEY = 'smp_user_info';

export interface UserInfo {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
  organizations: string[];
}

// Export avec le nom getAccessToken pour maintenir la cohérence
export const getAccessToken = (): string | null => {
  return Cookies.get(ACCESS_TOKEN_KEY) || null;
};

// Alias pour compatibilité
export const getAuthToken = getAccessToken;

export const getRefreshToken = (): string | null => {
  return Cookies.get(REFRESH_TOKEN_KEY) || null;
};

export const getUserInfo = (): UserInfo | null => {
  const userInfo = Cookies.get(USER_INFO_KEY);
  return userInfo ? JSON.parse(userInfo) : null;
};

export const setAuth = (accessToken: string, refreshToken?: string, userInfo?: UserInfo) => {
  // Tokens avec httpOnly pour sécurité
  Cookies.set(ACCESS_TOKEN_KEY, accessToken, {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires: 1 // 1 jour
  });

  if (refreshToken) {
    Cookies.set(REFRESH_TOKEN_KEY, refreshToken, {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: 7 // 7 jours
    });
  }

  if (userInfo) {
    Cookies.set(USER_INFO_KEY, JSON.stringify(userInfo), {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: 1
    });
  }
};

export const removeAuth = () => {
  Cookies.remove(ACCESS_TOKEN_KEY);
  Cookies.remove(REFRESH_TOKEN_KEY);
  Cookies.remove(USER_INFO_KEY);
};

export const isAuthenticated = (): boolean => {
  return !!getAccessToken();
};