'use client';

import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from '@/components/pages/LoginPage';
import { ResetPasswordPage } from '@/components/pages/ResetPasswordPage';
import { PINModal } from '@/components/pages/PINModal';
import { Dashboard } from '@/components/pages/Dashboard';
import { ContactsPage } from '@/components/pages/ContactsPage';
import { TemplatesPage } from '@/components/pages/TemplatesPage';
import { AssetPage } from '@/components/pages/AssetPage';
import { SendPage } from '@/components/pages/SendPage';
import { HistoryPage } from '@/components/pages/HistoryPage';
import { GroupPage } from '@/components/pages/GroupPage';
import { SettingsPage } from '@/components/pages/SettingsPage';
import { AuthResponse, PINValidation } from '@/lib/services';
import { AuthService } from '@/lib/services/AuthService';
import { rpcHelpers, supabase } from '@/lib/supabase';
import { Toaster } from '@/components/ui/toaster';

// Main application layout component with shared state
const MainApp = ({
  authData,
  pinData,
  onLoginSuccess,
  onPINValidated,
  onLogout
}: {
  authData: AuthResponse | null;
  pinData: PINValidation | null;
  onLoginSuccess: (data: AuthResponse) => void;
  onPINValidated: (data: PINValidation) => void;
  onLogout: () => void;
}) => {
  // Check if user is authenticated (has authData and pinData)
  const isAuthenticated = authData !== null;
  const isPINValidated = pinData !== null;

  return (
    <div className="min-h-screen bg-background">
      {/* Render PIN modal if user is authenticated but PIN not validated */}
      {isAuthenticated && !isPINValidated && (
        <PINModal
          onPINValidated={onPINValidated}
          userName={authData?.user.name || 'User'}
        />
      )}

      {/* Main content area */}
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={
            !isAuthenticated ? (
              <LoginPage onLoginSuccess={onLoginSuccess} />
            ) : !isPINValidated ? (
              <LoginPage onLoginSuccess={onLoginSuccess} />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        
        {/* Reset Password - Public route */}
        <Route
          path="/reset-password"
          element={<ResetPasswordPage />}
        />

        {/* Protected routes - only accessible after PIN validation */}
        <Route
          path="/dashboard"
          element={
            isPINValidated ? (
              <Dashboard
                userName={authData?.user.name || 'User'}
                onLogout={onLogout}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/contacts"
          element={
            isPINValidated ? (
              <ContactsPage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/templates"
          element={
            isPINValidated ? (
              <TemplatesPage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/assets"
          element={
            isPINValidated ? (
              <AssetPage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/send"
          element={
            isPINValidated ? (
              <SendPage
                userName={authData?.user.name || 'User'}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/history"
          element={
            isPINValidated ? (
              <HistoryPage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/groups"
          element={
            isPINValidated ? (
              <GroupPage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/settings"
          element={
            isPINValidated ? (
              <SettingsPage userName={authData?.user.name || 'User'} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Default route */}
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
      
      {/* Toast notifications */}
      <Toaster />
    </div>
  );
};

// Main App component with routing
const AppRoutes = () => {
  const [authData, setAuthData] = useState<AuthResponse | null>(null);
  const [pinData, setPinData] = useState<PINValidation | null>(null);

  // Restore session on app load
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const authService = new AuthService();
        const user = await authService.getCurrentUser();

        if (user) {
          // Get current session to include access token for proper user context initialization
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();

          if (sessionError) {
            console.warn('Failed to get session:', sessionError);
          }

          // Ensure user context is properly initialized with session token
          await authService.setCurrentUser(user, session?.access_token);

          // Get user quota
          const quotaData = await rpcHelpers.getUserQuota(user.id);
          const quota = quotaData[0];

          if (quota) {
            setAuthData({
              user,
              token: session?.access_token || '', // Include actual token
              quota
            });

            // For demo purposes, auto-validate PIN on session restore
            setPinData({
              is_valid: true,
              role: user.role || 'owner'
            });
          }
        }
      } catch (error) {
        console.error('Failed to restore session:', error);
        // Don't set state on error - user will need to login again
      }
    };

    restoreSession();
  }, []);

  // Handle login success - navigate to PIN modal
  const handleLoginSuccess = (data: AuthResponse) => {
    setAuthData(data);
  };

  // Handle PIN validation - navigate to dashboard
  const handlePINValidated = (data: PINValidation) => {
    setPinData(data);
  };

  // Handle logout - reset state and go back to login
  const handleLogout = () => {
    setAuthData(null);
    setPinData(null);
  };

  return (
    <MainApp
      authData={authData}
      pinData={pinData}
      onLoginSuccess={handleLoginSuccess}
      onPINValidated={handlePINValidated}
      onLogout={handleLogout}
    />
  );
};

// Wrapper component to use hooks
function AppContent() {
  return (
    <AppRoutes />
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}