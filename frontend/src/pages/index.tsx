import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getAccessToken, getUserInfo } from '../lib/auth.storage';

interface UserInfo {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
  organizations: string[];
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = () => {
      const token = getAccessToken();
      const userInfo = getUserInfo();

      if (!token) {
        // Pas de token, rediriger vers login
        router.push('/login');
        return;
      }

      if (userInfo) {
        setUser(userInfo);
      }
      
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  const handleLogout = () => {
    // Ici vous pouvez appeler votre service de logout
    // authService.logout();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading"></div>
        <span className="ml-2">Chargement...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Redirection en cours...
          </h1>
          <div className="loading"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <h1 className="text-3xl font-bold text-gray-900">
                SMP Dashboard
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">
                Bonjour, {user.firstName || user.email}
              </span>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Carte utilisateur */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-medium">
                        {(user.firstName?.[0] || user.email[0]).toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Profil utilisateur
                      </dt>
                      <dd>
                        <div className="text-lg font-medium text-gray-900">
                          {user.firstName} {user.lastName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {user.email}
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            {/* Carte rôles */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-medium">R</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Rôles
                      </dt>
                      <dd>
                        <div className="text-lg font-medium text-gray-900">
                          {user.roles.length} rôle(s)
                        </div>
                        <div className="text-sm text-gray-500">
                          {user.roles.join(', ') || 'Aucun rôle'}
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            {/* Carte organisations */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-medium">O</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Organisations
                      </dt>
                      <dd>
                        <div className="text-lg font-medium text-gray-900">
                          {user.organizations.length} organisation(s)
                        </div>
                        <div className="text-sm text-gray-500">
                          {user.organizations.join(', ') || 'Aucune organisation'}
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section actions rapides */}
          <div className="mt-8">
            <h2 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Actions rapides
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button className="bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg p-4 text-left transition-colors">
                <div className="text-blue-600 font-medium">Gestion des utilisateurs</div>
                <div className="text-blue-500 text-sm mt-1">Gérer les comptes utilisateur</div>
              </button>
              
              <button className="bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg p-4 text-left transition-colors">
                <div className="text-green-600 font-medium">Organisations</div>
                <div className="text-green-500 text-sm mt-1">Gérer les organisations</div>
              </button>
              
              <button className="bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg p-4 text-left transition-colors">
                <div className="text-purple-600 font-medium">Permissions</div>
                <div className="text-purple-500 text-sm mt-1">Configurer les droits</div>
              </button>
              
              <button className="bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg p-4 text-left transition-colors">
                <div className="text-gray-600 font-medium">Paramètres</div>
                <div className="text-gray-500 text-sm mt-1">Configuration système</div>
              </button>
            </div>
          </div>

          {/* Section récente activité */}
          <div className="mt-8">
            <h2 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Activité récente
            </h2>
            <div className="bg-white shadow rounded-lg">
              <div className="p-6">
                <div className="text-center text-gray-500">
                  <p>Aucune activité récente à afficher</p>
                  <p className="text-sm mt-1">Les actions récentes apparaîtront ici</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}