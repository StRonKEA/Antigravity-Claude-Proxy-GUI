import { useEffect, useState, lazy, Suspense } from 'react';
import { Layout } from './components/layout';
import { Dashboard, Accounts, Models, Logs, Settings } from './pages';
import { useAppStore } from './stores/appStore';
import { ToastContainer } from './components/ui/ToastContainer';
import { stopProxy, startProxy } from './services/proxyService';
import { SetupWizard } from './components/SetupWizard';
import { isSetupNeeded } from './services/claudeCliService';
import { loadSettings } from './services/appStorageService';

// Lazy load Statistics page (contains recharts - 351KB)
const Statistics = lazy(() => import('./pages/Statistics').then(m => ({ default: m.Statistics })));

// Loading component for lazy pages
const PageLoader = () => (
  <div className="h-full flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

function App() {
  const { currentPage, config, setConfig, setProxyStatus, setProxyStartTime } = useAppStore();
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);

  // Check if setup wizard should be shown and auto-start proxy if enabled
  useEffect(() => {
    const checkSetup = async () => {
      try {
        const needsSetup = await isSetupNeeded();
        setShowSetupWizard(needsSetup);

        // Load settings from disk and sync to store
        const settings = await loadSettings();
        setConfig({
          ...config,
          proxy: {
            ...config.proxy,
            autoStartProxy: settings.autoStartProxy,
            port: settings.port || config.proxy.port,
          },
          app: {
            ...config.app,
            pollingInterval: settings.pollingInterval || config.app.pollingInterval,
            logBufferSize: settings.logBufferSize || config.app.logBufferSize,
          },
          advanced: {
            ...config.advanced,
            debugMode: settings.debugMode ?? config.advanced.debugMode,
            logLevel: settings.logLevel || config.advanced.logLevel,
          }
        });

        // Auto-start proxy if setting is enabled and setup is not needed
        if (!needsSetup && settings.autoStartProxy) {
          const success = await startProxy(config.proxy.port);
          if (success) {
            setProxyStatus({ running: true, port: config.proxy.port });
            setProxyStartTime(Date.now());
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      } catch (e) {
        console.error('Failed to check setup status:', e);
      } finally {
        setIsCheckingSetup(false);
      }
    };
    checkSetup();
  }, []);

  // Cleanup proxy when app closes
  useEffect(() => {
    const handleBeforeUnload = () => {
      stopProxy();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'accounts':
        return <Accounts />;
      case 'models':
        return <Models />;
      case 'logs':
        return <Logs />;
      case 'settings':
        return <Settings />;
      case 'statistics':
        return (
          <Suspense fallback={<PageLoader />}>
            <Statistics />
          </Suspense>
        );
      default:
        return <Dashboard />;
    }
  };

  // Show nothing while checking setup status
  if (isCheckingSetup) {
    return (
      <div className="h-screen bg-bg-primary flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleWizardComplete = () => {
    setShowSetupWizard(false);
    window.location.reload();
  };

  return (
    <>
      <ToastContainer />
      {showSetupWizard && (
        <SetupWizard
          onComplete={handleWizardComplete}
          onSkip={() => setShowSetupWizard(false)}
        />
      )}
      <Layout>
        {renderPage()}
      </Layout>
    </>
  );
}

export default App;
