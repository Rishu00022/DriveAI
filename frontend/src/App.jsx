import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import PassengerApp from './pages/PassengerApp';
import AdminDashboard from './pages/AdminDashboard';
import HardwareLab from './pages/HardwareLab';
import AuthModal from './components/AuthModal';
import { getCurrentStoredUser, removeAuthToken } from './utils/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('passenger'); // 'passenger' | 'admin' | 'lab'
  const [user, setUser] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    const stored = getCurrentStoredUser();
    if (stored) {
      setUser(stored);
    }
  }, []);

  const handleLogout = () => {
    removeAuthToken();
    setUser(null);
  };

  const handleAuthSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
        onOpenLogin={() => setIsAuthModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'passenger' && (
          <PassengerApp
            user={user}
            onRequireAuth={() => setIsAuthModalOpen(true)}
          />
        )}

        {activeTab === 'admin' && (
          <AdminDashboard user={user} />
        )}

        {activeTab === 'lab' && (
          <HardwareLab />
        )}
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
}
