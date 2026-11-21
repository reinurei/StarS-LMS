import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  MessageCircle,
  Send,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimeChannel } from '../../hooks/useRealtimeChannel';
import { lmsService } from '../../lib/dataService';
import type { DirectMessage, Profile } from '../../lib/types';
import { useChatStore } from '../../store/chatStore';
import { StarMascot } from '../mascot/StarMascot';
import { ActivityStatusDot } from '../ui/ActivityStatusDot';

interface AiChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
}

const AI_QUICK_PROMPTS = [
  'What are the latest updates?',
  'Upcoming deadlines & quizzes',
  'Check my attendance',
  'My weekly schedule',
];

export function ChatWidget() {
  const { user, role } = useAuth();
  const {
    isOpen,
    activeTab,
    selectedPeerId,
    setActiveTab,
    setSelectedPeerId,
    toggleOpen,
    close,
  } = useChatStore();

  // AI State
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([
    {
      id: 'ai-welcome',
      sender: 'ai',
      text: "Hi! I'm StarS AI ✨ Ask me about new announcements, course updates, deadlines, grades, or your weekly schedule — or switch to Messages to chat with classmates & professors!",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiThinking, setAiThinking] = useState(false);

  // Direct Messages State
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [dmInput, setDmInput] = useState('');
  const [sendingDm, setSendingDm] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const loadContacts = useCallback(async () => {
    if (!user) return;
    const all = await lmsService.listProfiles();
    setContacts(all.filter((p) => p.id !== user.id));
  }, [user]);

  const loadMessages = useCallback(async () => {
    if (!user || !selectedPeerId) {
      setMessages([]);
      return;
    }
    const list = await lmsService.listDirectMessages(user.id, selectedPeerId);
    setMessages(list);
  }, [user, selectedPeerId]);

  useEffect(() => {
    if (isOpen) {
      loadContacts();
    }
  }, [isOpen, loadContacts]);

  useEffect(() => {
    if (isOpen && activeTab === 'messages') {
      loadMessages();
    }
  }, [isOpen, activeTab, selectedPeerId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, messages, activeTab, selectedPeerId]);

  // Real-time direct message delivery
  useRealtimeChannel<DirectMessage>(
    user ? `dm:${user.id}` : null,
    'direct_message',
    () => {
      loadMessages();
    },
  );

  const handleAskAi = async (textOverride?: string) => {
    const prompt = (textOverride ?? aiInput).trim();
    if (!prompt || !user || !role) return;
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setAiMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, sender: 'user', text: prompt, time: nowTime },
    ]);
    if (!textOverride) setAiInput('');
    setAiThinking(true);

    try {
      const reply = await lmsService.askAiAssistant(user.id, role, prompt);
      setAiMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          sender: 'ai',
          text: reply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setAiThinking(false);
    }
  };

  const handleSendDm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedPeerId || !dmInput.trim()) return;
    setSendingDm(true);
    try {
      await lmsService.sendDirectMessage(user.id, selectedPeerId, dmInput);
      setDmInput('');
      await loadMessages();
    } finally {
      setSendingDm(false);
    }
  };

  if (!user) return null;

  const selectedPeer = contacts.find((c) => c.id === selectedPeerId) ?? null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {/* Chat Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="StarS AI Assistant & Messages"
          className="relative mb-3 flex h-[520px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[30px_30px_24px_24px] border-2 border-[#7C5CFC] bg-white shadow-[0_18px_45px_rgba(46,16,101,0.28)]"
        >
          {/* Header */}
          <div className="relative overflow-hidden rounded-[26px_26px_20px_20px] bg-gradient-to-br from-[#7C5CFC] via-[#6941E8] to-[#4C1D95] px-4 pb-3 pt-4 text-white">
            <div className="pointer-events-none absolute -right-5 -top-7 h-24 w-24 rounded-full bg-white/8" />
            <div className="pointer-events-none absolute right-11 top-2 h-12 w-12 rotate-12 bg-[#FFD84D] [clip-path:polygon(50%_0%,61%_35%,98%_35%,68%_57%,79%_94%,50%_72%,21%_94%,32%_57%,2%_35%,39%_35%)] opacity-95">
              <div className="absolute left-[38%] top-[48%] h-1.5 w-1.5 rounded-full bg-[#4C1D95]" />
              <div className="absolute right-[38%] top-[48%] h-1.5 w-1.5 rounded-full bg-[#4C1D95]" />
            </div>
            <div className="flex items-center justify-between">
              <div className="relative z-10 flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/50 bg-[#FFD84D] shadow-sm">
                  <Sparkles className="h-5 w-5 text-[#4C1D95]" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold leading-tight">StarS Hub</h2>
                  <p className="mt-0.5 text-[11px] text-white/85">AI Assistant & Direct Chat</p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close chat hub"
                className="relative z-10 rounded-full p-1.5 text-white/85 ring-1 ring-white/20 hover:bg-white/15 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="relative z-10 mt-3 grid grid-cols-2 gap-1.5 rounded-2xl bg-[#2E1065]/35 p-1.5 ring-1 ring-white/10">
              <button
                type="button"
                onClick={() => setActiveTab('ai')}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'ai'
                    ? 'bg-white text-[#2E1065] shadow-xs'
                    : 'text-white/85 hover:bg-white/10'
                }`}
              >
                <Bot className="h-3.5 w-3.5" />
                Ask AI
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('messages')}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'messages'
                    ? 'bg-white text-[#2E1065] shadow-xs'
                    : 'text-white/85 hover:bg-white/10'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Messages ({contacts.length})
              </button>
            </div>
          </div>

          {/* TAB 1: AI ASSISTANT */}
          {activeTab === 'ai' && (
            <>
              <div className="flex-1 overflow-y-auto space-y-3 bg-[#F8F7FF] p-3.5">
                {aiMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs whitespace-pre-wrap ${
                        msg.sender === 'user'
                          ? 'bg-[#7C5CFC] text-white rounded-[18px_18px_5px_18px]'
                          : 'bg-white text-[#1E1B4B] border border-[#DDD6FE] rounded-[18px_18px_18px_5px]'
                      }`}
                    >
                      {msg.text}
                      <p
                        className={`mt-1 text-[10px] ${
                          msg.sender === 'user' ? 'text-white/75 text-right' : 'text-[#9CA3AF]'
                        }`}
                      >
                        {msg.time}
                      </p>
                    </div>
                  </div>
                ))}
                {aiThinking && (
                  <div className="text-xs italic text-[#7C5CFC]">StarS AI is checking your courses…</div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Quick Prompts */}
              <div className="flex gap-1.5 overflow-x-auto border-t border-[#E5E7EB] bg-[#F8F7FF] px-3 py-2">
                {AI_QUICK_PROMPTS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleAskAi(chip)}
                    className="shrink-0 rounded-full border border-[#EDE9FE] bg-[#F5F3FF] px-2.5 py-1 text-[11px] font-medium text-[#7C5CFC] hover:bg-[#EDE9FE] cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* AI Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAskAi();
                }}
                className="flex items-center gap-2 border-t border-[#E5E7EB] bg-white p-3"
              >
                <input
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Ask AI about updates, grades, deadlines…"
                  className="flex-1 rounded-full border border-[#DDD6FE] bg-[#F8F7FF] px-3.5 py-2.5 text-xs text-[#1E1B4B] focus:border-[#7C5CFC] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/15"
                />
                <button
                  type="submit"
                  disabled={!aiInput.trim() || aiThinking}
                  aria-label="Send question to AI"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7C5CFC] text-white shadow-sm hover:bg-[#6A48F5] disabled:opacity-50 cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          )}

          {/* TAB 2: DIRECT MESSAGES */}
          {activeTab === 'messages' && !selectedPeer && (
            <div className="flex-1 overflow-y-auto divide-y divide-[#E5E7EB] bg-white">
              {contacts.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#6B7280]">
                  No classmates or professors available yet.
                </div>
              ) : (
                contacts.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => setSelectedPeerId(person.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[#F5F3FF] cursor-pointer"
                  >
                    <div className="relative shrink-0">
                      {person.avatar_url ? (
                        <img
                          src={person.avatar_url}
                          alt={person.full_name}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#6366F1] text-xs font-bold text-white">
                          {person.full_name
                            .split(' ')
                            .map((w) => w[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                      )}
                      <ActivityStatusDot
                        status={person.activity_status}
                        className="absolute -bottom-0.5 -right-0.5"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-[#1E1B4B]">
                          {person.full_name}
                        </p>
                        <span className="rounded-full bg-[#EDE9FE] px-2 py-0.5 text-[10px] font-semibold capitalize text-[#7C5CFC]">
                          {person.role}
                        </span>
                      </div>
                      <p className="truncate text-xs text-[#6B7280]">
                        {person.program_course || person.email}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {activeTab === 'messages' && selectedPeer && (
            <>
              {/* Active Conversation Bar */}
              <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-white px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedPeerId(null)}
                    aria-label="Back to contacts"
                    className="rounded-lg p-1 text-[#6B7280] hover:bg-gray-100 cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <Link
                      to={`/profile/${selectedPeer.id}`}
                      onClick={close}
                      className="block truncate text-xs font-semibold text-[#1E1B4B] hover:text-[#7C5CFC]"
                    >
                      {selectedPeer.full_name}
                    </Link>
                    <div className="flex items-center gap-1.5 text-[10px] text-[#6B7280]">
                      <ActivityStatusDot status={selectedPeer.activity_status} />
                      <span className="capitalize">{selectedPeer.role}</span>
                    </div>
                  </div>
                </div>
                <Link
                  to={`/profile/${selectedPeer.id}`}
                  onClick={close}
                  className="text-[11px] font-semibold text-[#7C5CFC] hover:underline"
                >
                  Profile
                </Link>
              </div>

              {/* Messages Thread */}
              <div className="flex-1 overflow-y-auto space-y-2.5 bg-[#F8F7FF] p-3.5">
                {messages.length === 0 ? (
                  <p className="py-10 text-center text-xs text-[#6B7280]">
                    Start a conversation with {selectedPeer.full_name}!
                  </p>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_id === user.id;
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-xs whitespace-pre-wrap ${
                            mine
                              ? 'bg-[#7C5CFC] text-white rounded-[18px_18px_5px_18px]'
                              : 'bg-white text-[#1E1B4B] border border-[#DDD6FE] rounded-[18px_18px_18px_5px]'
                          }`}
                        >
                          {m.content}
                          <p
                            className={`mt-1 text-[10px] ${
                              mine ? 'text-white/75 text-right' : 'text-[#9CA3AF]'
                            }`}
                          >
                            {new Date(m.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Direct Message Composer */}
              <form
                onSubmit={handleSendDm}
                className="flex items-center gap-2 border-t border-[#E5E7EB] bg-white p-3"
              >
                <input
                  type="text"
                  value={dmInput}
                  onChange={(e) => setDmInput(e.target.value)}
                  placeholder={`Message ${selectedPeer.full_name}…`}
                  className="flex-1 rounded-full border border-[#DDD6FE] bg-[#F8F7FF] px-3.5 py-2.5 text-xs text-[#1E1B4B] focus:border-[#7C5CFC] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/15"
                />
                <button
                  type="submit"
                  disabled={!dmInput.trim() || sendingDm}
                  aria-label="Send direct message"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7C5CFC] text-white shadow-sm hover:bg-[#6A48F5] disabled:opacity-50 cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* Floating Launcher Button */}
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Open StarS AI & Chat Hub"
        className="group relative flex items-center gap-2 rounded-[24px_24px_24px_10px] border-2 border-[#4C1D95] bg-[#7C5CFC] py-2 pl-2.5 pr-4 text-white shadow-[0_10px_28px_rgba(46,16,101,0.28)] transition hover:-translate-y-0.5 cursor-pointer"
      >
        <div className="-my-1 flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-[#FFF1A8] bg-[#FFD84D] shadow-sm">
          {isOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <StarMascot pose="idle" size={38} interactive={false} />
          )}
        </div>
        <span className="text-xs font-semibold">
          {isOpen ? 'Close Chat' : 'AI & Chat'}
        </span>
        {!isOpen && <MessageCircle className="h-3.5 w-3.5 opacity-90" />}
      </button>
    </div>
  );
}
