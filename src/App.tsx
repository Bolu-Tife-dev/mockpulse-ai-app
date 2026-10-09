import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useInterviewStore } from '@/store/interviewStore';
import { useUiStore } from '@/store/uiStore';
import Landing from '@/screens/Landing';
import Meeting from '@/screens/Meeting';
import ReportScreen from '@/screens/ReportScreen';
import SettingsModal from '@/components/settings/SettingsModal';
import TopBar from '@/components/layout/TopBar';

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load);
  const loaded = useSettingsStore((s) => s.loaded);
  const status = useInterviewStore((s) => s.status);
  const openSettings = useUiStore((s) => s.openSettings);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSettings]);

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-night-500 border-t-transparent" />
          <p className="text-sm text-slate-400">Warming up your interview room…</p>
        </div>
      </div>
    );
  }

  const inMeeting = status === 'connecting' || status === 'live' || status === 'ended';

  return (
    <div className="flex h-full flex-col">
      <TopBar onOpenSettings={openSettings} />
      <main className="min-h-0 flex-1">
        {status === 'report' ? <ReportScreen /> : inMeeting ? <Meeting /> : <Landing />}
      </main>
      <SettingsModal />
    </div>
  );
}
