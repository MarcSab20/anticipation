import axios, { AxiosInstance } from 'axios';
import { setAuth, removeAuth, getRefreshToken } from './auth.storage';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8090';

interface LoginRequest {
  username: string;
  password: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn: number;
  userInfo?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    roles: string[];
    organizations: string[];
  };
}

interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

class AuthService {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Source': 'web-app',
        'X-Client-Version': '1.0.0'
      }
    });

    // Intercepteur pour ajouter le token
    this.axiosInstance.interceptors.request.use((config) => {
      const token = getRefreshToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Intercepteur pour gérer les erreurs
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          removeAuth();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    try {
      const response = await this.axiosInstance.post<ApiResponse<LoginResponse>>(
        '/api/auth/login', 
        credentials
      );

      if (response.data.success && response.data.data) {
        const loginData = response.data.data;
        
        setAuth(
          loginData.accessToken,
          loginData.refreshToken,
          loginData.userInfo
        );

        return loginData;
      }

      throw new Error('Invalid login response');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async register(userData: RegisterRequest): Promise<LoginResponse> {
    try {
      const response = await this.axiosInstance.post<ApiResponse<LoginResponse>>(
        '/api/auth/register', 
        userData
      );

      if (response.data.success && response.data.data) {
        const registerData = response.data.data;
        
        setAuth(
          registerData.accessToken,
          registerData.refreshToken,
          registerData.userInfo
        );

        return registerData;
      }

      throw new Error('Invalid registration response');
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.axiosInstance.post('/api/auth/logout');
    } catch (error) {
      console.warn('Logout request failed:', error);
    } finally {
      removeAuth();
    }
  }

  async refreshToken(): Promise<string | null> {
    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await this.axiosInstance.post<ApiResponse<LoginResponse>>(
        '/api/auth/refresh', 
        { refreshToken }
      );

      if (response.data.success && response.data.data) {
        const newToken = response.data.data.accessToken;
        setAuth(newToken, response.data.data.refreshToken);
        return newToken;
      }

      throw new Error('Invalid refresh response');
    } catch (error) {
      console.error('Token refresh error:', error);
      removeAuth();
      return null;
    }
  }

  async validateToken(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.post<ApiResponse<{ valid: boolean }>>(
        '/api/auth/validate'
      );
      return response.data.success && response.data.data?.valid;
    } catch (error) {
      return false;
    }
  }
}

export const authService = new AuthService();