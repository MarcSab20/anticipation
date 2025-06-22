import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: string[];
  requiredOrganization?: string;
  fallbackUrl?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRoles = [],
  requiredOrganization,
  fallbackUrl = '/login'
}) => {
  const { isLoggedIn, loading, hasAnyRole, isInOrganization } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!isLoggedIn) {
      router.push(fallbackUrl);
      return;
    }

    if (requiredRoles.length > 0 && !hasAnyRole(requiredRoles)) {
      router.push('/unauthorized');
      return;
    }

    if (requiredOrganization && !isInOrganization(requiredOrganization)) {
      router.push('/unauthorized');
      return;
    }
  }, [isLoggedIn, loading, hasAnyRole, isInOrganization, requiredRoles, requiredOrganization, router]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isLoggedIn) {
    return null;
  }

  if (requiredRoles.length > 0 && !hasAnyRole(requiredRoles)) {
    return null;
  }

  if (requiredOrganization && !isInOrganization(requiredOrganization)) {
    return null;
  }

  return <>{children}</>;
};