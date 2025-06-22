import { useState, useEffect } from 'react';
import { getUserInfo, isAuthenticated, UserInfo } from '../lib/auth.storage';
import { authService } from '../lib/auth.service';

export const useAuth = () => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);
      
      if (isAuthenticated()) {
        const userInfo = getUserInfo();
        setUser(userInfo);
        setIsLoggedIn(true);
        
        // Valider le token
        const isValid = await authService.validateToken();
        if (!isValid) {
          setUser(null);
          setIsLoggedIn(false);
        }
      } else {
        setUser(null);
        setIsLoggedIn(false);
      }
      
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const loginResponse = await authService.login({ username, password });
      setUser(loginResponse.userInfo || null);
      setIsLoggedIn(true);
      return loginResponse;
    } catch (error) {
      setUser(null);
      setIsLoggedIn(false);
      throw error;
    }
  };

  const register = async (userData: {
    username: string;
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) => {
    try {
      const registerResponse = await authService.register(userData);
      setUser(registerResponse.userInfo || null);
      setIsLoggedIn(true);
      return registerResponse;
    } catch (error) {
      setUser(null);
      setIsLoggedIn(false);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setIsLoggedIn(false);
    }
  };

  const hasRole = (role: string): boolean => {
    return user?.roles?.includes(role) || false;
  };

  const hasAnyRole = (roles: string[]): boolean => {
    return roles.some(role => hasRole(role));
  };

  const isInOrganization = (organizationId: string): boolean => {
    return user?.organizations?.includes(organizationId) || false;
  };

  return {
    user,
    loading,
    isLoggedIn,
    login,
    register,
    logout,
    hasRole,
    hasAnyRole,
    isInOrganization
  };
};
