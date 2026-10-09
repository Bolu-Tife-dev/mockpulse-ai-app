import { create } from 'zustand';

export type PanelTab = 'chat' | 'code' | 'board';
export type MeetingView = 'speaker' | 'grid';

interface UiState {
  settingsOpen: boolean;
  panelTab: PanelTab;
  panelWidth: number;
  meetingView: MeetingView;
  captionsOn: boolean;
  micCaption: string;

  openSettings(): void;
  closeSettings(): void;
  setPanelTab(tab: PanelTab): void;
  setPanelWidth(w: number): void;
  setMeetingView(v: MeetingView): void;
  toggleCaptions(): void;
  setMicCaption(t: string): void;
}

export const useUiStore = create<UiState>((set) => ({
  settingsOpen: false,
  panelTab: 'chat',
  panelWidth: 456,
  meetingView: 'speaker',
  captionsOn: true,
  micCaption: '',

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  setPanelTab: (panelTab) => set({ panelTab }),
  setPanelWidth: (panelWidth) =>
    set({ panelWidth: Math.max(340, Math.min(760, Math.round(panelWidth))) }),
  setMeetingView: (meetingView) => set({ meetingView }),
  toggleCaptions: () => set((s) => ({ captionsOn: !s.captionsOn })),
  setMicCaption: (micCaption) => set({ micCaption }),
}));
