import { create } from 'zustand';

export type ChatTab = 'ai' | 'messages';

interface ChatState {
  isOpen: boolean;
  activeTab: ChatTab;
  selectedPeerId: string | null;
  openAiChat: () => void;
  openChatWith: (peerId: string) => void;
  setActiveTab: (tab: ChatTab) => void;
  setSelectedPeerId: (peerId: string | null) => void;
  toggleOpen: () => void;
  close: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  isOpen: false,
  activeTab: 'ai',
  selectedPeerId: null,
  openAiChat: () => set({ isOpen: true, activeTab: 'ai' }),
  openChatWith: (peerId) =>
    set({ isOpen: true, activeTab: 'messages', selectedPeerId: peerId }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedPeerId: (peerId) => set({ selectedPeerId: peerId }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
}));
