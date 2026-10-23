import React, { useState, useEffect } from 'react';
import SamJuniorsOS from './os/App';
import CanonicalDesignSystemPage from './app/design-system/workflow/page';

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => 
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (to: string) => {
    window.history.pushState({}, '', to);
    setCurrentPath(to);
  };

  if (currentPath.startsWith('/design-system')) {
    return (
      <div className="relative min-h-screen bg-[var(--cvl-void,#01040a)] text-[var(--cvl-text,#f1f5f9)]">
        <div className="fixed top-3 left-4 z-50">
          <button
            onClick={() => navigate('/')}
            className="px-3.5 py-1.5 text-xs font-semibold tracking-wider uppercase bg-black/60 hover:bg-black/90 text-cyan-300 border border-cyan-800/60 rounded-full backdrop-blur-md transition-all flex items-center gap-1.5 shadow-lg active:scale-95"
          >
            ← Back to SamJuniorsOS
          </button>
        </div>
        <CanonicalDesignSystemPage />
      </div>
    );
  }

  return <SamJuniorsOS onNavigate={navigate} />;
}
