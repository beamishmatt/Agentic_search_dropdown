import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnimatePresence, motion } from 'motion/react';
import {
  Search,
  MessageSquare,
  ArrowUp,
  Shield,
  ChevronDown,
  Video,
  Circle,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileText,
  Car,
  Smartphone,
  Wind,
  Crosshair,
  Minus,
  TrendingUp,
  TrendingDown,
  X,
  Plus,
  Mic,
  Square,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';
import { SCOPE_CHIPS } from '../SearchDropdown';
import assistantIcon from '../../assets/assistant-icon.svg';
import { chatWithEvidenceStream, ChatMessage as EngineChatMessage } from '../../engine/assistantChat';
import { Checkbox } from '../ui/checkbox';
import { ThinkingBlock, DraftCard, DraftDrawer, ToolCall, ToolCallCard, MetadataEditCard, parseActions, parseMetadataEdits, stripActionTags, stripMetadataEditTags, FeatureRequestCard, parseFeatureRequest, stripFeatureRequestTags } from '../AssistantPanel';
import { DraftReport, parseDraft, DRAFT_PANEL_WIDTH } from '../../utils/draftUtils';
import { getContextGraph } from '../../storage/config';
import { GraphNode, MetadataEdit } from '../../data/types';

// ── Speech to text ────────────────────────────────────────────────────────────

function useSpeechToText(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const start = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = 'en-US';
    r.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .map((result: any) => result[0].transcript)
        .join('');
      onTranscript(transcript);
    };
    r.onend = () => setIsListening(false);
    r.onerror = () => setIsListening(false);
    recognitionRef.current = r;
    r.start();
    setIsListening(true);
  }, [onTranscript]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return { isListening, start, stop };
}

function ListeningWave() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 28, paddingLeft: 2 }}>
      {[0, 1, 2, 3, 4, 5, 6].map(i => (
        <div
          key={i}
          style={{
            width: 3,
            height: 4,
            borderRadius: 99,
            backgroundColor: 'var(--fill-key-strong)',
            animation: 'mic-wave 0.8s ease-in-out infinite',
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Animated border button ────────────────────────────────────────────────────

function AnimatedBorderButton({ onClick, style, children, animated = true }: {
  onClick?: () => void;
  style?: React.CSSProperties;
  children: React.ReactNode;
  animated?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    if (btnRef.current) {
      const { width, height } = btnRef.current.getBoundingClientRect();
      setDims({ w: width, h: height });
    }
  }, []);

  const rx = 5;
  const perimeter = dims.w > 0 ? 2 * (dims.w + dims.h) : 0;
  const dashLen = 28;

  return (
    <button ref={btnRef} onClick={onClick} style={{ position: 'relative', ...style }}>
      {animated && dims.w > 0 && (
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
        >
          <motion.rect
            x={0.5} y={0.5}
            width={dims.w - 1} height={dims.h - 1}
            rx={rx} ry={rx}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={1.5}
            strokeDasharray={`${dashLen} ${perimeter - dashLen}`}
            animate={{ strokeDashoffset: [0, -perimeter] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
          />
        </svg>
      )}
      {children}
    </button>
  );
}

// ── Skills dropdown ───────────────────────────────────────────────────────────

const SKILLS = [
  { id: 'deep-research', label: 'Deep Research', icon: <Search size={13} /> },
  { id: 'policy', label: 'Policy', icon: <Shield size={13} /> },
];

function SkillsDropdown({
  onSelectEvidence,
  evidenceCount = 0,
  value,
  onChange,
}: {
  onSelectEvidence?: () => void;
  evidenceCount?: number;
  value?: string | null;
  onChange?: (skill: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const selected = value !== undefined ? value : internalSelected;
  const setSelected = (s: string | null) => {
    if (onChange) onChange(s);
    else setInternalSelected(s);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const active = SKILLS.find(s => s.id === selected);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          height: 28, padding: '0 10px', borderRadius: 7,
          border: '1px solid var(--border)',
          backgroundColor: selected ? 'var(--fill-weak)' : 'transparent',
          color: selected ? 'var(--text-strong)' : 'var(--muted-foreground)',
          fontSize: 13, fontWeight: selected ? 500 : 400,
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => { if (!selected) e.currentTarget.style.backgroundColor = 'var(--fill-hover)'; }}
        onMouseLeave={(e) => { if (!selected) e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        {active ? active.label : 'Skills'}
        <ChevronDown size={11} style={{ opacity: 0.6 }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
            backgroundColor: 'var(--overlay)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: 'var(--elevation-md)',
            minWidth: 180,
            zIndex: 50,
            overflow: 'hidden',
            padding: '4px 0',
          }}
        >
          {selected && (
            <button
              onClick={() => { setSelected(null); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', fontSize: 13, color: 'var(--muted-foreground)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--fill-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              Clear skill
            </button>
          )}
          {SKILLS.map(skill => (
            <button
              key={skill.id}
              onClick={() => { setSelected(skill.id); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '7px 12px',
                fontSize: 13, color: 'var(--text-strong)',
                fontWeight: skill.id === selected ? 600 : 400,
                background: skill.id === selected ? 'var(--fill-weak)' : 'none',
                border: 'none', cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={(e) => { if (skill.id !== selected) e.currentTarget.style.backgroundColor = 'var(--fill-hover)'; }}
              onMouseLeave={(e) => { if (skill.id !== selected) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <span style={{ color: 'var(--muted-foreground)' }}>{skill.icon}</span>
              {skill.label}
            </button>
          ))}
        </div>
      )}
    </div>
    {selected === 'deep-research' && (
      <AnimatedBorderButton
        onClick={onSelectEvidence}
        animated={evidenceCount === 0}
        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, color: 'var(--text-strong)', background: 'none', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', padding: '2px 8px', fontFamily: 'inherit', whiteSpace: 'nowrap', height: 28 }}
      >
        Evidence
        {evidenceCount > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, borderRadius: 99, backgroundColor: 'var(--fill-key-strong)', color: 'var(--text-inverse-strong)', fontSize: 10, fontWeight: 700, padding: '0 4px' }}>
            {evidenceCount}
          </span>
        )}
      </AnimatedBorderButton>
    )}
    </div>
  );
}

// ── Greeting ─────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const ASSISTANT_ACTIONS = [
  'investigate a case',
  'summarize evidence',
  'correlate incidents',
  'categorize evidence',
  'draft a report',
  'edit metadata',
  'research a case',
  'change settings',
];

const WORD_VARIANTS = {
  hidden: { opacity: 0, filter: 'blur(10px)', y: 8 },
  visible: (i: number) => ({ opacity: 1, filter: 'blur(0px)', y: 0, transition: { duration: 0.35, delay: i * 0.06 } }),
  exit: (i: number) => ({ opacity: 0, filter: 'blur(10px)', y: -8, transition: { duration: 0.2, delay: i * 0.04 } }),
};

const HEADING_STYLE: React.CSSProperties = {
  fontSize: 32, fontWeight: 400, letterSpacing: '-0.01em',
  fontFamily: 'inherit', color: 'var(--text-strong)', lineHeight: 'inherit',
};

function AnimatedSubtitle() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % ASSISTANT_ACTIONS.length);
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  const words = ASSISTANT_ACTIONS[index].split(' ');

  return (
    <AnimatePresence mode='popLayout'>
      <motion.span key={index} style={{ display: 'inline-flex', gap: '0.3em' }}>
        {words.map((word, i) => (
          <motion.span
            key={word + i}
            custom={i}
            variants={WORD_VARIANTS}
            initial='hidden'
            animate='visible'
            exit='exit'
            style={HEADING_STYLE}
          >
            {word}
          </motion.span>
        ))}
      </motion.span>
    </AnimatePresence>
  );
}

// ── Chat / Search input ───────────────────────────────────────────────────────

function HomeSearch({
  onSearch,
  onChat,
  onSelectEvidence,
  evidenceCount = 0,
  skill,
  onSkillChange,
}: {
  onSearch: (q: string) => void;
  onChat: (q: string) => void;
  onSelectEvidence?: () => void;
  evidenceCount?: number;
  skill?: string | null;
  onSkillChange?: (s: string | null) => void;
}) {
  const [tab, setTab] = useState<'chat' | 'search'>('chat');
  const [value, setValue] = useState('');
  const [activeScopes, setActiveScopes] = useState<Set<string>>(new Set(['all']));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { isListening, start: startListening, stop: stopListening } = useSpeechToText(
    useCallback((t: string) => setValue(prev => prev ? prev + ' ' + t : t), [])
  );

  const handleChatSubmit = () => {
    if (!value.trim()) return;
    onChat(value.trim());
    setValue('');
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const toggleScope = useCallback((id: string) => {
    setActiveScopes(prev => {
      if (id === 'all') return new Set(['all']);
      const next = new Set(prev);
      next.delete('all');
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0) return new Set(['all']);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div
      style={{
        borderRadius: 16,
        border: '1px solid var(--border)',
        backgroundColor: 'var(--overlay)',
        boxShadow: 'var(--elevation-md)',
        padding: '12px 16px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, backgroundColor: 'var(--base)', borderRadius: 8, padding: 4 }}>
          {(['chat', 'search'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); if (t === 'search') setActiveScopes(new Set(['all'])); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px',
                fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
                color: tab === t ? 'var(--text-strong)' : 'var(--muted-foreground)',
                backgroundColor: tab === t ? 'var(--overlay)' : 'transparent',
                border: 'none',
                borderRadius: 6,
                boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {t === 'chat' ? <MessageSquare size={13} /> : <Search size={13} />}
              {t === 'chat' ? 'Chat' : 'Search'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'chat' && (
        <div style={{ borderRadius: 10, border: `1px solid ${isListening ? 'var(--fill-key-strong)' : 'var(--border)'}`, backgroundColor: 'var(--base)', padding: '12px 14px 10px', display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color 0.15s' }}>
          {isListening ? (
            <ListeningWave />
          ) : (
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Ask me anything..."
              rows={1}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit(); } }}
              style={{ width: '100%', background: 'none', border: 'none', outline: 'none', resize: 'none', fontSize: 16, color: 'var(--text-strong)', fontFamily: 'inherit', lineHeight: 1.5, minHeight: 28, overflow: 'hidden' }}
            />
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <SkillsDropdown
                value={skill}
                onChange={onSkillChange}
                onSelectEvidence={onSelectEvidence}
                evidenceCount={evidenceCount}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={isListening ? stopListening : startListening}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: 'none', background: 'none', color: isListening ? 'var(--fill-key-strong)' : 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                {isListening ? <Square size={13} fill="currentColor" /> : <Mic size={15} />}
              </button>
              <button onClick={handleChatSubmit} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: 'none', backgroundColor: value.trim() ? 'var(--fill-key-strong)' : 'var(--fill-weak)', color: value.trim() ? 'var(--text-inverse-strong)' : 'var(--muted-foreground)', cursor: value.trim() ? 'pointer' : 'default', transition: 'background-color 0.15s' }}>
                <ArrowUp size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'search' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ borderRadius: 10, border: '1px solid var(--border)', backgroundColor: 'var(--base)', padding: '0 14px', display: 'flex', alignItems: 'center', gap: 10, height: 48 }}>
            <Search size={16} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Describe what you want to find"
              onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) { onSearch(value.trim()); } }}
              autoFocus
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 15, color: 'var(--text-strong)', fontFamily: 'inherit' }}
            />
            {value.trim() && (
              <button onClick={() => onSearch(value.trim())} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: 'none', backgroundColor: 'var(--fill-key-strong)', color: 'var(--text-inverse-strong)', cursor: 'pointer', flexShrink: 0 }}>
                <ArrowUp size={14} />
              </button>
            )}
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SCOPE_CHIPS.map(chip => {
              const active = activeScopes.has(chip.id);
              return (
                <button
                  key={chip.id}
                  onClick={() => toggleScope(chip.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 11px', borderRadius: 99, cursor: 'pointer',
                    fontSize: 12, fontWeight: active ? 600 : 400,
                    border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
                    backgroundColor: active ? 'var(--foreground)' : 'transparent',
                    color: active ? 'var(--raised)' : 'var(--foreground)',
                    transition: 'all 0.12s',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.backgroundColor = 'var(--fill-hover)'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  {chip.icon}
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared widget shell ───────────────────────────────────────────────────────

function Widget({
  title,
  viewAllLabel = 'View all →',
  children,
}: {
  title: string;
  viewAllLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 12,
        border: '1px solid var(--border)',
        backgroundColor: '#ffffff',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20, borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{title}</span>
          <button style={{ fontSize: 13, color: 'var(--text-key)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
            {viewAllLabel}
          </button>
        </div>
        {children}
    </div>
  );
}

// ── My Tasks ──────────────────────────────────────────────────────────────────

type TaskStatus = 'Overdue' | 'Due Today' | 'Upcoming';

const TASKS: {
  id: number;
  status: TaskStatus;
  category: string;
  title: string;
  subtitle: string;
  action: string;
  icon: 'alert' | 'video' | 'circle';
}[] = [
  { id: 1, status: 'Overdue', category: 'Records', title: 'Complete report for Incident #6201', subtitle: 'Returned by Sgt. Park — "Missing witness info in narrative"', action: 'Resume Report', icon: 'alert' },
  { id: 2, status: 'Due Today', category: 'Evidence / DEMS', title: 'Categorize 4 evidence items from 03/11 shift', subtitle: '', action: 'Open', icon: 'video' },
  { id: 3, status: 'Due Today', category: 'Evidence / DEMS', title: 'Add subject ID to BWC-2026-03-13-0004', subtitle: '', action: 'Quick Edit', icon: 'video' },
  { id: 4, status: 'Upcoming', category: 'Standards', title: 'Complete annual Use of Force policy acknowledgment', subtitle: 'Due Mar 20', action: 'Open', icon: 'circle' },
  { id: 5, status: 'Upcoming', category: 'Standards', title: 'Review updated vehicle pursuit policy', subtitle: 'Due Mar 25', action: 'Open', icon: 'circle' },
];

function taskStatusStyle(s: TaskStatus): React.CSSProperties {
  if (s === 'Overdue') return { color: '#f87171', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)' };
  if (s === 'Due Today') return { color: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)' };
  return { color: 'var(--muted-foreground)', backgroundColor: 'var(--fill-weak)', border: '1px solid var(--border)' };
}

function actionBtnStyle(): React.CSSProperties {
  return { fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 5, cursor: 'pointer', border: '1px solid var(--border)', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0, backgroundColor: 'transparent', color: 'var(--text-strong)' };
}

function MyTasks() {
  return (
    <Widget title="My Tasks">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {TASKS.map((t, i) => (
          <div
            key={t.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, paddingTop: i === 0 ? 0 : 12, paddingBottom: i === TASKS.length - 1 ? 0 : 12,
              marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20,
              borderBottom: i < TASKS.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                {t.icon === 'alert'
                  ? <AlertCircle size={14} style={{ color: '#f87171' }} />
                  : t.icon === 'video'
                  ? <Video size={14} style={{ color: 'var(--muted-foreground)' }} />
                  : <Circle size={14} style={{ color: 'var(--muted-foreground)' }} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: 'var(--text-strong)', margin: 0, fontWeight: 400, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title}
                </p>
                <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '1px 0 0' }}>
                  {t.status} · {t.category}
                </p>
              </div>
            </div>
            <button style={actionBtnStyle()}>{t.action}</button>
          </div>
        ))}
      </div>
    </Widget>
  );
}

// ── Assigned Devices ──────────────────────────────────────────────────────────

const DEVICES = [
  { name: 'Axon Body 4', id: 'D01AM6310', pct: 91, status: 'Online', icon: 'body', pctColor: '#22c55e', ring: '#22c55e', warning: false },
  { name: 'TASER 10', id: 'T10-X45781', pct: 78, status: 'Online', icon: 'taser', pctColor: '#22c55e', ring: '#22c55e', warning: false },
  { name: 'iPhone 14', id: 'MBL-4821', pct: 62, status: 'Online — Cellular', icon: 'phone', pctColor: '#22c55e', ring: '#22c55e', warning: false },
  { name: 'Axon Fleet 3', id: 'FL3-V2204', pct: 100, status: 'Online', icon: 'car', pctColor: '#22c55e', ring: '#22c55e', warning: false },
  { name: 'Axon Air', id: 'AIR-D1087', pct: 45, status: 'Online — WiFi', icon: 'air', pctColor: '#f59e0b', ring: '#f59e0b', warning: true },
];

function DeviceIcon({ type }: { type: string }) {
  const size = 18;
  if (type === 'body') return <Video size={size} />;
  if (type === 'taser') return <Crosshair size={size} />;
  if (type === 'phone') return <Smartphone size={size} />;
  if (type === 'car') return <Car size={size} />;
  if (type === 'air') return <Wind size={size} />;
  return <Circle size={size} />;
}

function AssignedDevices() {
  return (
    <Widget title="Assigned Devices">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {DEVICES.map((d, i) => (
          <div
            key={d.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, paddingTop: i === 0 ? 0 : 12, paddingBottom: i === DEVICES.length - 1 ? 0 : 12,
              marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20,
              borderBottom: i < DEVICES.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <span style={{ flexShrink: 0, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center' }}>
                <DeviceIcon type={d.icon} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: 'var(--text-strong)', margin: 0, fontWeight: 400, lineHeight: 1.4 }}>
                  {d.name}
                </p>
                <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '1px 0 0' }}>
                  {d.id} · {d.status}
                </p>
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: d.pctColor, flexShrink: 0 }}>{d.pct}%</span>
          </div>
        ))}
      </div>
    </Widget>
  );
}

// ── My Performance ────────────────────────────────────────────────────────────

type Trend = 'up' | 'down' | 'flat';

const PERF_METRICS: {
  label: string;
  value: number;
  target: number;
  trend: Trend;
  color: string;
}[] = [
  { label: 'Activation Rate', value: 93, target: 95, trend: 'up', color: '#22c55e' },
  { label: 'Categorization Rate', value: 88, target: 90, trend: 'flat', color: '#f59e0b' },
  { label: 'Report Completion', value: 96, target: 95, trend: 'up', color: '#22c55e' },
  { label: 'Evidence Tagging', value: 82, target: 90, trend: 'up', color: '#f59e0b' },
  { label: 'Response Time Avg', value: 91, target: 85, trend: 'down', color: '#22c55e' },
];

function TrendIcon({ trend, color }: { trend: Trend; color: string }) {
  if (trend === 'up') return <TrendingUp size={14} style={{ color }} />;
  if (trend === 'down') return <TrendingDown size={14} style={{ color }} />;
  return <Minus size={14} style={{ color }} />;
}

function MyPerformance() {
  return (
    <Widget title="My Performance" viewAllLabel="View full dashboard →">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {PERF_METRICS.map((m) => (
          <div
            key={m.label}
            style={{
              borderRadius: 12,
              border: '1px solid var(--border)',
              backgroundColor: 'transparent',
              padding: '14px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 500 }}>{m.label}</span>
              <TrendIcon trend={m.trend} color={m.color} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#2a2a2a', marginBottom: 8, lineHeight: 1 }}>{m.value}%</div>
            <div style={{ height: 5, borderRadius: 99, backgroundColor: '#e0e0e0', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${m.value}%`, backgroundColor: '#888888', borderRadius: 99 }} />
            </div>
            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Target: {m.target}%</span>
            </div>
          </div>
        ))}
      </div>
    </Widget>
  );
}

// ── My Reports ────────────────────────────────────────────────────────────────

type ReportStatus = 'Draft' | 'Returned' | 'Submitted' | 'Approved';

const REPORTS: {
  title: string;
  incident: string;
  status: ReportStatus;
  source: string;
  due: string;
  action: string;
}[] = [
  { title: 'Traffic Stop — DUI Arrest', incident: '#6215', status: 'Draft', source: 'Draft One', due: '—', action: 'Open Draft' },
  { title: 'Domestic Disturbance Response', incident: '#6201', status: 'Returned', source: 'Records', due: 'Today', action: 'Resume Report' },
  { title: 'Suspicious Vehicle Report', incident: '#6198', status: 'Submitted', source: 'Records', due: '—', action: 'View' },
  { title: 'Parking Violation', incident: '#6195', status: 'Approved', source: 'Records', due: '—', action: 'View' },
];

function reportBadgeStyle(s: ReportStatus): React.CSSProperties {
  if (s === 'Draft') return { color: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.15)', border: '1px solid rgba(148,163,184,0.25)' };
  if (s === 'Returned') return { color: '#f87171', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)' };
  if (s === 'Submitted') return { color: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.25)' };
  return { color: '#4ade80', backgroundColor: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)' };
}

function MyReports() {
  return (
    <Widget title="My Reports">
      <div style={{ overflowX: 'auto', marginLeft: -20, marginRight: -20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Title', 'Incident', 'Status', 'Source', 'Due', 'Action'].map((h, i, arr) => (
                <th key={h} style={{ textAlign: h === 'Action' ? 'right' : 'left', padding: '0 10px 10px', paddingLeft: i === 0 ? 20 : 10, paddingRight: i === arr.length - 1 ? 20 : 10, fontSize: 12, fontWeight: 500, color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REPORTS.map((r, i) => (
              <tr key={r.incident} style={{ borderBottom: i < REPORTS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '12px 10px', paddingLeft: 20, color: 'var(--text-strong)', fontWeight: 400 }}>{r.title}</td>
                <td style={{ padding: '12px 10px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{r.incident}</td>
                <td style={{ padding: '12px 10px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, ...reportBadgeStyle(r.status) }}>
                    {r.status}
                  </span>
                </td>
                <td style={{ padding: '12px 10px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                    <FileText size={11} />
                    {r.source}
                  </span>
                </td>
                <td style={{ padding: '12px 10px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{r.due}</td>
                <td style={{ padding: '12px 10px', paddingRight: 20, textAlign: 'right' }}>
                  <button style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-strong)', background: 'none', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', padding: '2px 8px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    {r.action}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Widget>
  );
}

// ── Recent Incidents & Evidence ───────────────────────────────────────────────

type IncidentStatus = 'Uncategorized evidence' | 'Report returned' | 'Complete';

const INCIDENTS: {
  id: string;
  date: string;
  type: string;
  evidence: string;
  report: string;
  status: IncidentStatus;
}[] = [
  { id: '#6215', date: 'Mar 13', type: 'DUI', evidence: '3 items', report: 'Draft', status: 'Uncategorized evidence' },
  { id: '#6201', date: 'Mar 12', type: 'Domestic', evidence: '2 items', report: 'Returned', status: 'Report returned' },
  { id: '#6198', date: 'Mar 11', type: 'Suspicious Activity', evidence: '1 items', report: 'Submitted', status: 'Complete' },
  { id: '#6192', date: 'Mar 10', type: 'Traffic Stop', evidence: '2 items', report: 'Approved', status: 'Complete' },
];

function incidentStatusEl(s: IncidentStatus) {
  const map: Record<IncidentStatus, { label: string; style: ReportStatus }> = {
    'Complete': { label: 'Complete', style: 'Approved' },
    'Report returned': { label: 'Returned', style: 'Returned' },
    'Uncategorized evidence': { label: 'Pending', style: 'Draft' },
  };
  const { label, style } = map[s];
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, ...reportBadgeStyle(style) }}>
      {label}
    </span>
  );
}

function RecentIncidents() {
  return (
    <Widget title="Recent Incidents & Evidence">
      <div style={{ overflowX: 'auto', marginLeft: -20, marginRight: -20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Incident', 'Date', 'Type', 'Evidence', 'Report', 'Status'].map((h, i, arr) => (
                <th key={h} style={{ textAlign: 'left', padding: '0 10px 10px', paddingLeft: i === 0 ? 20 : 10, paddingRight: i === arr.length - 1 ? 20 : 10, fontSize: 12, fontWeight: 500, color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INCIDENTS.map((inc, i) => (
              <tr key={inc.id} style={{ borderBottom: i < INCIDENTS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '12px 10px', paddingLeft: 20 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-strong)', fontWeight: 500 }}>
                    <ChevronDown size={13} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                    {inc.id}
                  </span>
                </td>
                <td style={{ padding: '12px 10px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{inc.date}</td>
                <td style={{ padding: '12px 10px', color: 'var(--text-strong)' }}>{inc.type}</td>
                <td style={{ padding: '12px 10px', color: 'var(--muted-foreground)' }}>{inc.evidence}</td>
                <td style={{ padding: '12px 10px', color: 'var(--muted-foreground)' }}>{inc.report}</td>
                <td style={{ padding: '12px 10px', paddingRight: 20 }}>{incidentStatusEl(inc.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Widget>
  );
}

// ── Evidence Drawer ───────────────────────────────────────────────────────────

const EVIDENCE_DRAWER_WIDTH = 420;

const EVIDENCE_TYPE_ICON: Record<string, React.ReactNode> = {
  video: <Video size={15} />,
  image: <Smartphone size={15} />,
  audio: <Wind size={15} />,
  document: <FileText size={15} />,
  text: <FileText size={15} />,
  pdf: <FileText size={15} />,
};

function EvidenceDrawer({
  open,
  onClose,
  onSelectionChange,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onSelectionChange: (items: GraphNode[]) => void;
  onConfirm: (items: GraphNode[]) => void;
}) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [selectedCase, setSelectedCase] = useState<{ id: string; label: string } | null>(null);
  const [caseQuery, setCaseQuery] = useState('');
  const [caseDropdownOpen, setCaseDropdownOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const caseInputRef = useRef<HTMLInputElement>(null);
  const caseDropdownRef = useRef<HTMLDivElement>(null);

  // Load from graph, reload on updates
  useEffect(() => {
    const load = () => {
      const graph = getContextGraph();
      setNodes(Object.values(graph.nodes).filter(n => n.status !== 'deleted' && !!n.vector_file_id));
    };
    load();
    window.addEventListener('evidenceGraphUpdated', load);
    return () => window.removeEventListener('evidenceGraphUpdated', load);
  }, []);

  useEffect(() => {
    if (!caseDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (caseDropdownRef.current && !caseDropdownRef.current.contains(e.target as Node)) {
        setCaseDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [caseDropdownOpen]);

  // Derive cases from loaded nodes
  const caseMap = useMemo(() => {
    const graph = getContextGraph();
    const map = new Map<string, string>();
    nodes.forEach(n => {
      if (n.case_id && !map.has(n.case_id)) {
        const meta = graph.cases?.[n.case_id];
        map.set(n.case_id, meta?.title ? `${n.case_id} — ${meta.title}` : n.case_id);
      }
    });
    return map;
  }, [nodes]);

  const filteredCases = Array.from(caseMap.entries())
    .filter(([, label]) => label.toLowerCase().includes(caseQuery.toLowerCase()))
    .map(([id, label]) => ({ id, label }));

  const filtered = nodes.filter(e => {
    if (selectedCase && e.case_id !== selectedCase.id) return false;
    if (typeFilter && e.media_class !== typeFilter) return false;
    return true;
  });

  const toggleItem = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      onSelectionChange(nodes.filter(n => next.has(n.id)));
      return next;
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: EVIDENCE_DRAWER_WIDTH,
        backgroundColor: 'var(--overlay)',
        borderLeft: '1px solid var(--border)',
        boxShadow: open ? '-4px 0 20px rgba(0,0,0,0.06)' : 'none',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 101,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>Select Evidence</span>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
          <X size={16} />
        </button>
      </div>

      {/* Case filter */}
      <div ref={caseDropdownRef} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--base)', padding: '0 10px', height: 36 }}>
          <Search size={14} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
          <input
            ref={caseInputRef}
            type="text"
            value={selectedCase ? selectedCase.label : caseQuery}
            onChange={e => { setCaseQuery(e.target.value); setSelectedCase(null); setCaseDropdownOpen(true); }}
            onFocus={() => { setCaseDropdownOpen(true); if (selectedCase) setCaseQuery(''); }}
            placeholder="Filter by case..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text-strong)', fontFamily: 'inherit' }}
          />
          {selectedCase && (
            <button onClick={() => { setSelectedCase(null); setCaseQuery(''); }} style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 0 }}>
              <X size={13} />
            </button>
          )}
        </div>
        {caseDropdownOpen && (
          <div style={{ position: 'absolute', top: '100%', left: 20, right: 20, backgroundColor: 'var(--overlay)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--elevation-md)', zIndex: 10, overflow: 'hidden', marginTop: 4 }}>
            <div
              onClick={() => { setSelectedCase(null); setCaseQuery(''); setCaseDropdownOpen(false); }}
              style={{ padding: '8px 12px', fontSize: 13, color: 'var(--muted-foreground)', cursor: 'pointer', borderBottom: filteredCases.length > 0 ? '1px solid var(--border)' : 'none' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--fill-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              All Cases
            </div>
            {filteredCases.map(c => (
              <div
                key={c.id}
                onClick={() => { setSelectedCase(c); setCaseQuery(''); setCaseDropdownOpen(false); }}
                style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-strong)', cursor: 'pointer', backgroundColor: selectedCase?.id === c.id ? 'var(--fill-weak)' : 'transparent' }}
                onMouseEnter={e => { if (selectedCase?.id !== c.id) e.currentTarget.style.backgroundColor = 'var(--fill-hover)'; }}
                onMouseLeave={e => { if (selectedCase?.id !== c.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                {c.label}
              </div>
            ))}
            {filteredCases.length === 0 && (
              <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--muted-foreground)' }}>No cases found</div>
            )}
          </div>
        )}

        {/* Type filter chips */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {[
            { key: null, label: 'All', icon: null },
            { key: 'video', label: 'Video', icon: <Video size={11} /> },
            { key: 'image', label: 'Image', icon: <Smartphone size={11} /> },
            { key: 'audio', label: 'Audio', icon: <Wind size={11} /> },
            { key: 'document', label: 'Document', icon: <FileText size={11} /> },
          ].map(({ key, label, icon }) => {
            const active = typeFilter === key;
            return (
              <button
                key={key ?? 'all'}
                onClick={() => setTypeFilter(key)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', border: '1px solid var(--border)', backgroundColor: active ? 'var(--fill-key-strong)' : 'transparent', color: active ? 'var(--text-inverse-strong)' : 'var(--muted-foreground)', transition: 'background-color 0.12s, color 0.12s', whiteSpace: 'nowrap' }}
              >
                {icon}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Select all row */}
      {filtered.length > 0 && (() => {
        const allSelected = filtered.every(item => selectedIds.has(item.id));
        const someSelected = filtered.some(item => selectedIds.has(item.id));
        const toggleAll = () => {
          setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) {
              filtered.forEach(item => next.delete(item.id));
            } else {
              filtered.forEach(item => next.add(item.id));
            }
            onSelectionChange(nodes.filter(n => next.has(n.id)));
            return next;
          });
        };
        return (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, backgroundColor: someSelected ? 'var(--fill-weaker)' : 'transparent' }}
          >
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
              style={{ width: 14, height: 14, flexShrink: 0, opacity: someSelected && !allSelected ? 0.5 : 1 }}
            />
            <button
              onClick={toggleAll}
              style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted-foreground)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            {someSelected && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted-foreground)' }}>
                {selectedIds.size} selected
              </span>
            )}
          </div>
        );
      })()}

      {/* Evidence list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.map((item, i) => (
          <div
            key={item.id}
            onClick={() => toggleItem(item.id)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '14px 20px',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer',
              backgroundColor: selectedIds.has(item.id) ? 'var(--fill-weak)' : 'transparent',
            }}
          >
            <Checkbox
              checked={selectedIds.has(item.id)}
              onCheckedChange={() => toggleItem(item.id)}
              onClick={e => e.stopPropagation()}
              style={{ marginTop: 3, flexShrink: 0, width: 14, height: 14 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, color: 'var(--text-strong)', margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '2px 0 0', lineHeight: 1.4, fontWeight: 500, letterSpacing: '0.01em' }}>{item.case_id} · {item.media_class} · {item.date_recorded ? new Date(item.date_recorded).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</p>
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '2px 0 0', lineHeight: 1.4, fontWeight: 400, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8 }}>{item.description}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', flexShrink: 0 }}>
              {EVIDENCE_TYPE_ICON[item.media_class] ?? <FileText size={14} />}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {selectedIds.size > 0 && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={() => {
              const items = nodes.filter(e => selectedIds.has(e.id));
              onConfirm(items);
              onClose();
            }}
            style={{ width: '100%', fontSize: 13, fontWeight: 600, color: 'var(--text-inverse-strong)', backgroundColor: 'var(--fill-key-strong)', border: 'none', borderRadius: 8, cursor: 'pointer', padding: '9px 0', fontFamily: 'inherit' }}
          >
            Add {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} to research
          </button>
        </div>
      )}
    </div>
  );
}

// ── Chat Drawer ───────────────────────────────────────────────────────────────

export type ChatMessage = { id: string; role: 'user' | 'assistant' | 'system'; text: string; thinking?: string; showSelectEvidence?: boolean; draft?: DraftReport; pendingDraft?: boolean; chunkMap?: Record<string, string>; evidenceSnapshot?: GraphNode[]; toolCall?: ToolCall; metadataEdits?: MetadataEdit[]; featureRequest?: { title: string; description: string } };


// ── Citation processing ───────────────────────────────────────────────────────

// Matches single [EV-ID] or grouped [EV-ID1, EV-ID2, ...] brackets
const CITATION_TAG_RE = /\[EV-[A-Z0-9]+(?:,\s*EV-[A-Z0-9]+)*\]/g;

type CitationEntry = { num: number; id: string; title: string; mediaClass: string; chunk?: string };

function processCitations(
  text: string,
  items: GraphNode[],
  chunkMap?: Record<string, string>,
): { processedText: string; citations: CitationEntry[] } {
  const idToItem = new Map(items.map(item => [item.id, item]));
  const idToNum = new Map<string, number>();
  let counter = 0;

  // Strip any partial citation tag at the end of text (streaming artifact)
  const stripped = text.replace(/\[EV-[A-Z0-9,\s]*$/, '');

  const processedText = stripped.replace(CITATION_TAG_RE, (match) => {
    const ids = match.slice(1, -1).split(/,\s*/);
    return ids.map(id => {
      if (!idToNum.has(id)) idToNum.set(id, ++counter);
      return `[${idToNum.get(id)}]`;
    }).join('');
  });

  const citations: CitationEntry[] = Array.from(idToNum.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([id, num]) => {
      const item = idToItem.get(id);
      const fileId = item?.vector_file_id;
      const rawChunk = fileId && chunkMap ? chunkMap[fileId] : undefined;
      const chunk = rawChunk ? rawChunk.slice(0, 480) + (rawChunk.length > 480 ? '…' : '') : undefined;
      return { num, id, title: item?.title ?? 'Unknown', mediaClass: item?.media_class ?? '', chunk };
    });

  return { processedText, citations };
}

function CitationTooltip({ initialNum, citations }: { initialNum: number; citations: CitationEntry[] }) {
  const [visible, setVisible] = useState(false);
  const [idx, setIdx] = useState(0);
  const [offset, setOffset] = useState(0);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } };
  const scheduleHide = () => { cancelHide(); hideTimer.current = setTimeout(() => setVisible(false), 120); };

  const handleEnter = () => {
    cancelHide();
    const i = citations.findIndex(c => c.num === initialNum);
    setIdx(i >= 0 ? i : 0);
    if (anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect();
      // Compute horizontal offset to keep tooltip within viewport
      const tooltipW = 300;
      const naturalLeft = r.left + r.width / 2 - tooltipW / 2;
      const clampedLeft = Math.min(Math.max(naturalLeft, 8), window.innerWidth - tooltipW - 8);
      setOffset(clampedLeft - naturalLeft);
    }
    setVisible(true);
  };

  const active = citations[idx] ?? citations[0];

  return (
    <span
      ref={anchorRef}
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={handleEnter}
      onMouseLeave={scheduleHide}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 14, height: 14, borderRadius: 3,
        backgroundColor: 'var(--fill-weak)', border: '1px solid var(--border)',
        fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)',
        cursor: 'default', verticalAlign: 'super', lineHeight: 1,
        margin: '0 1px', padding: '0 2px',
      }}>
        {initialNum}
      </span>
      {visible && (
        <div
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          style={{
            position: 'absolute', bottom: 'calc(100% + 6px)',
            left: '50%', transform: `translateX(calc(-50% + ${offset}px))`,
            backgroundColor: 'var(--overlay)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 10px',
            boxShadow: 'var(--elevation-md)',
            zIndex: 300, width: 300,
            display: 'flex', flexDirection: 'column', gap: 5,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-strong)', lineHeight: 1.4 }}>
            {active.title}
          </div>
          {active.mediaClass && (
            <span style={{ fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'capitalize' }}>
              {active.mediaClass}
            </span>
          )}
          {active.chunk && (
            <div style={{
              fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.6,
              borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 1,
              maxHeight: 160, overflowY: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {active.chunk}
            </div>
          )}
          {citations.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderTop: '1px solid var(--border)', paddingTop: 5, marginTop: 2 }}>
              <button
                onMouseDown={e => { e.preventDefault(); setIdx(i => (i - 1 + citations.length) % citations.length); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 4, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', flexShrink: 0 }}
              >
                <ChevronLeft size={11} />
              </button>
              <button
                onMouseDown={e => { e.preventDefault(); setIdx(i => (i + 1) % citations.length); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 4, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', flexShrink: 0 }}
              >
                <ChevronRight size={11} />
              </button>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function injectCitations(children: React.ReactNode, citations: CitationEntry[]): React.ReactNode {
  if (!citations.length) return children;
  const INLINE_CITE_RE = /(\[\d+\])/;
  if (typeof children === 'string') {
    const parts = children.split(INLINE_CITE_RE);
    if (parts.length === 1) return children;
    return parts.map((part, i) => {
      const m = part.match(/^\[(\d+)\]$/);
      if (m) {
        const num = parseInt(m[1]);
        if (citations.some(c => c.num === num)) {
          return <CitationTooltip key={`ct-${i}`} initialNum={num} citations={citations} />;
        }
      }
      return part || null;
    });
  }
  if (Array.isArray(children)) {
    return children.flatMap((child, i) => {
      if (typeof child === 'string') {
        const parts = child.split(INLINE_CITE_RE);
        if (parts.length === 1) return [child];
        return parts.map((part, j) => {
          const m = part.match(/^\[(\d+)\]$/);
          if (m) {
            const num = parseInt(m[1]);
            if (citations.some(c => c.num === num)) {
              return <CitationTooltip key={`ct-${i}-${j}`} initialNum={num} citations={citations} />;
            }
          }
          return part || null;
        });
      }
      return [child];
    });
  }
  return children;
}

export function parseNeedsEvidence(text: string): { text: string; needsEvidence: boolean } {
  const TAG = '<needs_evidence/>';
  if (text.includes(TAG)) {
    return { text: text.replace(TAG, '').trim(), needsEvidence: true };
  }
  return { text, needsEvidence: false };
}


export function parseThinkingFromRaw(raw: string): { thinking: string; text: string } {
  const OPEN = '<thinking>';
  const CLOSE = '</thinking>';
  const openIdx = raw.indexOf(OPEN);
  if (openIdx === -1) return { thinking: '', text: raw };
  const before = raw.slice(0, openIdx);
  const closeIdx = raw.indexOf(CLOSE, openIdx);
  if (closeIdx === -1) {
    // Still streaming inside thinking block
    return { thinking: raw.slice(openIdx + OPEN.length), text: before };
  }
  const thinking = raw.slice(openIdx + OPEN.length, closeIdx);
  const after = raw.slice(closeIdx + CLOSE.length).replace(/^\n+/, '');
  return { thinking, text: (before + after).trim() };
}

const MIN_DRAWER_WIDTH = 540;
const MAX_DRAWER_WIDTH = 780;
const LEARN_MORE_WIDTH = 380;

const CONVERSATION_STARTERS = [
  'Summarize all evidence',
  'Create a timeline',
  'Draft an incident report',
  'Find common patterns',
  'Identify key witnesses',
  'What evidence is missing?',
  'Draft a use-of-force report',
  'Correlate timestamps',
  'Flag contradictions',
  'Suggest categories',
  'Write an arrest summary',
  'Find location links',
  'Draft a vehicle pursuit report',
  'Who are the suspects?',
  'Build an evidence summary',
  'Draft a witness statement',
  'What objects were detected?',
  'Analyze officer footage',
  'Find duplicate entries',
  'Draft a case overview',
  'Prioritize evidence',
  'Build a narrative',
  'Compare evidence dates',
  'Detect anomalies',
  'Create chain of custody',
  'Summarize body cam footage',
  'Find geographic patterns',
  'Draft a field interview report',
  'What connections exist?',
  'Flag high-priority items',
  'Identify recurring locations',
  'Summarize case activity',
  'Draft a search warrant',
  'Find officer overlap',
  'What happened first?',
  'Group by evidence type',
];

export function ChatDrawer({
  open,
  messages,
  onClose,
  onNewChat,
  onSend,
  onSelectEvidence,
  evidenceOpen,
  evidenceCount,
  isStreaming,
  skill,
  onSkillChange,
  evidenceItems,
  onOpenDraft,
  draftOpen,
  onToolCallApprove,
  onToolCallDeny,
  onMetadataEditApply,
  onMetadataEditDismiss,
}: {
  open: boolean;
  messages: ChatMessage[];
  onClose: () => void;
  onNewChat: () => void;
  onSend: (text: string) => void;
  onSelectEvidence: () => void;
  evidenceOpen: boolean;
  evidenceCount: number;
  isStreaming: boolean;
  skill: string | null;
  onSkillChange: (skill: string | null) => void;
  evidenceItems: GraphNode[];
  onOpenDraft: (draft: DraftReport) => void;
  draftOpen?: boolean;
  onToolCallApprove: (msgId: string) => void;
  onToolCallDeny: (msgId: string) => void;
  onMetadataEditApply?: (msgId: string, editId: string) => void;
  onMetadataEditDismiss?: (msgId: string, editId: string) => void;
}) {
  const [input, setInput] = useState('');
  const [width, setWidth] = useState(540);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const { isListening, start: startListening, stop: stopListening } = useSpeechToText(
    useCallback((t: string) => setInput(prev => prev ? prev + ' ' + t : t), [])
  );

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: isStreaming ? 'instant' : 'smooth' });
  }, [messages, isStreaming]);

  useEffect(() => {
    if (open && !isStreaming && !isListening) {
      textareaRef.current?.focus();
    }
  }, [open, isStreaming, isListening]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    onSend(input.trim());
    setInput('');
  };

  const onHandleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - ev.clientX;
      const next = Math.min(MAX_DRAWER_WIDTH, Math.max(MIN_DRAWER_WIDTH, startWidth.current + delta));
      setWidth(next);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <>
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: (evidenceOpen ? EVIDENCE_DRAWER_WIDTH : 0) + (draftOpen ? DRAFT_PANEL_WIDTH : 0) + (learnMoreOpen ? LEARN_MORE_WIDTH : 0),
        bottom: 0,
        width,
        backgroundColor: 'var(--overlay)',
        borderLeft: open ? '1px solid var(--border)' : 'none',
        boxShadow: open ? '-8px 0 32px rgba(0,0,0,0.08)' : 'none',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: dragging.current ? 'right 0s' : 'transform 0.25s cubic-bezier(0.4,0,0.2,1), right 0.25s cubic-bezier(0.4,0,0.2,1), box-shadow 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 400,
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onHandleMouseDown}
        style={{
          position: 'absolute',
          left: -12,
          top: 0,
          bottom: 0,
          width: 24,
          cursor: 'ew-resize',
          display: open ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
        }}
      >
        <div style={{
          width: 6,
          height: 48,
          borderRadius: 99,
          backgroundColor: 'var(--overlay)',
          border: '1px solid var(--border)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
        }} />
      </div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <img src={assistantIcon} alt="Assistant" style={{ width: 32, height: 32, animation: isStreaming ? 'spin 1.2s linear infinite' : undefined }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onNewChat}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '2px', aspectRatio: '1', borderRadius: 5, background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-strong)', flexShrink: 0 }}
            aria-label="New chat"
          >
            <Plus size={11} strokeWidth={2.5} />
          </button>
          <button style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-strong)', background: 'none', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', padding: '2px 8px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            Chat history
          </button>
          <button
            onClick={onClose}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'visible', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.map((m, i) => {
          const isLastAssistant = m.role === 'assistant' && i === messages.length - 1 && isStreaming;
          if (m.role === 'system') {
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--muted-foreground)', backgroundColor: 'var(--fill-weak)', padding: '5px 12px', borderRadius: 99 }}>
                  {m.text}
                </span>
              </div>
            );
          }
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              {m.role === 'user' ? (
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '10px 14px',
                    borderRadius: '14px 14px 4px 14px',
                    backgroundColor: 'var(--fill-weak)',
                    color: 'var(--text-strong)',
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  {m.text}
                </div>
              ) : (
                <div style={{ width: '100%', fontSize: 14, lineHeight: 1.6, color: 'var(--text-strong)' }}>
                  {(m.thinking || isLastAssistant) && (
                    <ThinkingBlock content={m.thinking ?? ''} isStreaming={isLastAssistant && (!m.text || !!m.pendingDraft)} />
                  )}
                  {m.text ? (() => {
                    const { processedText, citations } = processCitations(m.text, m.evidenceSnapshot ?? evidenceItems, m.chunkMap);
                    return (
                      <>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.6, color: 'var(--text-strong)' }}>{injectCitations(children, citations)}</p>,
                            ul: ({ children }) => <ul style={{ paddingLeft: 18, margin: '0 0 8px' }}>{children}</ul>,
                            ol: ({ children }) => <ol style={{ paddingLeft: 18, margin: '0 0 8px' }}>{children}</ol>,
                            li: ({ children }) => <li style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 3, color: 'var(--text-strong)' }}>{injectCitations(children, citations)}</li>,
                            strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{injectCitations(children, citations)}</strong>,
                            h1: ({ children }) => <div style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px', color: 'var(--text-strong)' }}>{injectCitations(children, citations)}</div>,
                            h2: ({ children }) => <div style={{ fontSize: 14, fontWeight: 600, margin: '8px 0 4px', color: 'var(--text-strong)' }}>{injectCitations(children, citations)}</div>,
                            h3: ({ children }) => <div style={{ fontSize: 13, fontWeight: 600, margin: '6px 0 3px', color: 'var(--text-strong)' }}>{injectCitations(children, citations)}</div>,
                            code: ({ children }) => <code style={{ fontFamily: 'monospace', fontSize: 12, backgroundColor: 'var(--fill-weak)', padding: '1px 5px', borderRadius: 3 }}>{children}</code>,
                            blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--border)', paddingLeft: 10, margin: '0 0 8px', color: 'var(--muted-foreground)' }}>{injectCitations(children, citations)}</blockquote>,
                            table: ({ children }) => <div style={{ overflowX: 'auto', margin: '0 0 10px' }}><table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%', minWidth: 400 }}>{children}</table></div>,
                            thead: ({ children }) => <thead>{children}</thead>,
                            tbody: ({ children }) => <tbody>{children}</tbody>,
                            tr: ({ children }) => <tr style={{ borderBottom: '1px solid var(--border)' }}>{children}</tr>,
                            th: ({ children }) => <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', borderBottom: '2px solid var(--border)', background: 'var(--fill-weaker)' }}>{children}</th>,
                            td: ({ children }) => <td style={{ padding: '5px 12px', fontSize: 13, color: 'var(--text-strong)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{children}</td>,
                          }}
                        >
                          {processedText}
                        </ReactMarkdown>
                        {citations.length > 0 && (
                          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, border: '1px solid var(--border)', backgroundColor: 'var(--fill-weaker)', maxWidth: '100%', overflow: 'hidden' }}>
                              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {citations[0].title}
                              </span>
                              {citations.length > 1 && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', flexShrink: 0 }}>
                                  +{citations.length - 1}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })() : isLastAssistant ? (
                    <span style={{ display: 'inline-block', width: 8, height: 14, backgroundColor: 'var(--muted-foreground)', borderRadius: 2, opacity: 0.6, animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom' }} />
                  ) : null}
                  {m.draft && (
                    <DraftCard title={m.draft.title} onOpen={() => onOpenDraft(m.draft!)} />
                  )}
                  {m.toolCall && (
                    <ToolCallCard
                      toolCall={m.toolCall}
                      onApprove={() => onToolCallApprove(m.id)}
                      onDeny={() => onToolCallDeny(m.id)}
                    />
                  )}
                  {m.metadataEdits && m.metadataEdits.map(edit => (
                    <MetadataEditCard
                      key={edit.id}
                      edit={edit}
                      onApply={() => onMetadataEditApply?.(m.id, edit.id)}
                      onDismiss={() => onMetadataEditDismiss?.(m.id, edit.id)}
                    />
                  ))}
                  {m.featureRequest && (
                    <FeatureRequestCard title={m.featureRequest.title} description={m.featureRequest.description} />
                  )}
                  {m.showSelectEvidence && evidenceCount === 0 && (
                    <div style={{ marginTop: 10 }}>
                      <AnimatedBorderButton
                        onClick={onSelectEvidence}
                        animated={true}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: 'var(--text-strong)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '5px 12px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                      >
                        Select evidence
                      </AnimatedBorderButton>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '0 16px 16px', flexShrink: 0 }}>
        {/* Contextual banner */}
        <div
          onClick={() => setLearnMoreOpen(p => !p)}
          style={{
            margin: '0 40px',
            borderRadius: '10px 10px 0 0',
            padding: '1px 1px 0 1px',
            background: 'linear-gradient(90deg, #a855f7, #eab308, #f97316)',
            cursor: 'pointer',
          }}
        >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            backgroundColor: '#ffffff',
            borderRadius: '9px 9px 0 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={assistantIcon} alt="Assistant" style={{ width: 18, height: 18, opacity: 0.9, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-strong)' }}>
              Learn more about what the Assistant can do.
            </span>
          </div>
          <ArrowRight size={16} style={{ color: 'var(--text-strong)', opacity: 0.9, flexShrink: 0 }} />
        </div>
        </div>
        <div style={{ borderRadius: 12, border: `1px solid ${isListening ? 'var(--fill-key-strong)' : 'var(--border)'}`, backgroundColor: 'var(--base)', padding: '10px 12px 8px', display: 'flex', flexDirection: 'column', gap: 8, transition: 'border-color 0.15s' }}>
          {isListening ? (
            <ListeningWave />
          ) : (
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={isStreaming ? 'Waiting for response…' : 'Ask me anything...'}
              rows={1}
              disabled={isStreaming}
              style={{ width: '100%', background: 'none', border: 'none', outline: 'none', resize: 'none', fontSize: 14, color: 'var(--text-strong)', fontFamily: 'inherit', lineHeight: 1.5, minHeight: 56, overflow: 'hidden', opacity: isStreaming ? 0.5 : 1 }}
            />
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={onSelectEvidence}
                title="Add"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', background: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--fill-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Plus size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={isListening ? stopListening : startListening}
                disabled={isStreaming}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', background: 'none', color: isListening ? 'var(--fill-key-strong)' : 'var(--muted-foreground)', cursor: isStreaming ? 'default' : 'pointer' }}
              >
                {isListening ? <Square size={13} fill="currentColor" /> : <Mic size={17} />}
              </button>
              <button
                onClick={handleSend}
                disabled={isStreaming}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', backgroundColor: input.trim() && !isStreaming ? 'var(--fill-key-strong)' : 'var(--fill-weak)', color: input.trim() && !isStreaming ? 'var(--text-inverse-strong)' : 'var(--muted-foreground)', cursor: input.trim() && !isStreaming ? 'pointer' : 'default', transition: 'background-color 0.15s' }}
              >
                <ArrowUp size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Learn More Drawer */}
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: LEARN_MORE_WIDTH,
        backgroundColor: 'var(--overlay)',
        borderLeft: '1px solid var(--border)',
        boxShadow: learnMoreOpen ? '-8px 0 32px rgba(0,0,0,0.08)' : 'none',
        transform: learnMoreOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 99,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>Try asking…</span>
        <button
          onClick={() => setLearnMoreOpen(false)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Starters */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CONVERSATION_STARTERS.map(starter => (
            <button
              key={starter}
              onClick={() => {
                setInput(starter);
                setLearnMoreOpen(false);
                setTimeout(() => textareaRef.current?.focus(), 50);
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 99,
                border: '1px solid var(--border)',
                backgroundColor: 'var(--base)',
                color: 'var(--text-strong)',
                fontSize: 12,
                fontWeight: 400,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                transition: 'background-color 0.12s, border-color 0.12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--fill-weak)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--base)'; }}
            >
              {starter}
            </button>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function HomePage({ onSearch }: { onSearch: (q: string) => void }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatStreamingId, setChatStreamingId] = useState<string | null>(null);
  const [chatSkill, setChatSkill] = useState<string | null>(null);
  const [confirmedEvidenceItems, setConfirmedEvidenceItems] = useState<GraphNode[]>([]);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceCount, setEvidenceCount] = useState(0);
  const [evidenceSource, setEvidenceSource] = useState<'home' | 'drawer'>('home');
  const [openDraft, setOpenDraft] = useState<DraftReport | null>(null);

  const sendChatMessage = async (text: string, history: ChatMessage[], evidenceItems: GraphNode[]) => {
    const assistantId = `asst-${Date.now()}`;
    setChatMessages(prev => [...prev, { id: assistantId, role: 'assistant', text: '', evidenceSnapshot: evidenceItems }]);
    setChatStreamingId(assistantId);

    const apiItems = evidenceItems.map(e => ({
      id: e.id,
      title: e.title,
      media_class: e.media_class,
      date_recorded: e.date_recorded,
      description: e.description ?? '',
      officer: e.officer,
      category: e.category,
      vector_file_id: e.vector_file_id,
    }));

    const engineHistory: EngineChatMessage[] = history
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.text }));

    // If evidence is now loaded but a previous assistant turn asked for it,
    // inject a synthetic exchange so the LLM knows the context has changed.
    const prevAskForEvidence = history.some(m => m.showSelectEvidence);
    if (apiItems.length > 0 && prevAskForEvidence) {
      const originalRequest = history
        .filter(m => m.role === 'user' && m.text.trim().length > 3)
        .at(-1);
      engineHistory.push(
        { role: 'user', content: `[${apiItems.length} evidence item${apiItems.length !== 1 ? 's' : ''} have now been selected and are available. Please proceed with my original request: "${originalRequest?.text ?? 'help me with this evidence'}"]` },
        { role: 'assistant', content: `Understood — I can see the ${apiItems.length} evidence items and will proceed with your request now.` },
      );
    }

    const raw = { current: '' };
    let evidencePrompted = false;

    try {
      const { chunksByFileId } = await chatWithEvidenceStream(text, engineHistory, apiItems, (chunk) => {
        raw.current += chunk;
        const { thinking, text: afterThinking } = parseThinkingFromRaw(raw.current);
        const { content: afterDraft, draft } = parseDraft(afterThinking);
        const { text: afterNeedsEvidence, needsEvidence } = parseNeedsEvidence(afterDraft);
        const displayText = stripFeatureRequestTags(stripActionTags(stripMetadataEditTags(afterNeedsEvidence)));
        // True while <draft_report> tag is open but closing tag hasn't arrived yet
        const pendingDraft = afterThinking.includes('<draft_report') && draft === null;
        if (needsEvidence && !evidencePrompted) {
          evidencePrompted = true;
          setChatSkill('deep-research');
        }
        setChatMessages(prev =>
          prev.map(m => m.id === assistantId ? {
            ...m, thinking, text: displayText,
            draft: draft ?? m.draft,
            pendingDraft,
            showSelectEvidence: needsEvidence || m.showSelectEvidence,
          } : m)
        );
      });
      // After streaming, parse actions, metadata edits, and feature requests into cards
      const { text: afterThinkingFinal } = parseThinkingFromRaw(raw.current);
      const { content: afterDraftFinal } = parseDraft(afterThinkingFinal);
      const { text: afterNeedsEvidenceFinal } = parseNeedsEvidence(afterDraftFinal);
      const featureReq = parseFeatureRequest(afterNeedsEvidenceFinal);
      const finalDisplayText = stripFeatureRequestTags(stripActionTags(stripMetadataEditTags(afterNeedsEvidenceFinal)));
      setChatMessages(prev => prev.map(m => m.id === assistantId ? {
        ...m,
        text: finalDisplayText,
        ...(featureReq ? { featureRequest: featureReq } : {}),
      } : m));
      const getTitle = (id: string) => evidenceItems.find(n => n.id === id)?.title;
      const { edits: metaEdits } = parseMetadataEdits(afterNeedsEvidenceFinal, getTitle);
      const { actions } = parseActions(afterNeedsEvidenceFinal);
      const batchActions = actions.filter(a => a.type === 'add_to_case');
      const perItemActions = actions.filter(a => a.type !== 'add_to_case');
      const ACTION_FIELD_MAP: Record<string, string> = { set_category: 'category', set_status: 'status', add_tag: 'tags' };
      const allEdits: MetadataEdit[] = [
        ...metaEdits.map(e => {
          const node = evidenceItems.find(n => n.id === e.evidence_id);
          const currentValue = node ? (node as any)[e.field] as string | undefined : undefined;
          return { ...e, current_value: currentValue, status: 'pending' as const };
        }),
        ...perItemActions.map(a => {
          const field = ACTION_FIELD_MAP[a.type] ?? a.type;
          const count = a.item_ids.length;
          const isBatch = count > 1;
          const firstNode = evidenceItems.find(n => n.id === a.item_ids[0]);
          const currentValue = !isBatch && firstNode ? (firstNode as any)[field] as string | undefined : undefined;
          return {
            id: `medit-action-${field}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            evidence_id: a.item_ids[0] ?? '',
            evidence_ids: a.item_ids,
            evidence_title: isBatch ? `${count} items` : (firstNode?.title ?? getTitle(a.item_ids[0])),
            field,
            current_value: Array.isArray(currentValue) ? (currentValue as string[]).join(', ') : currentValue,
            new_value: a.value,
            status: 'pending' as const,
          };
        }),
      ];
      if (allEdits.length > 0) {
        setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, metadataEdits: allEdits } : m));
      }
      if (batchActions.length > 0) {
        const a = batchActions[0];
        const count = a.item_ids.length;
        const toolCall: ToolCall = {
          name: a.type,
          label: `Add to case: "${a.value}"`,
          description: `Add ${count} selected item${count !== 1 ? 's' : ''} to case "${a.value}".`,
          input: { case: a.value, items: `${count} item${count !== 1 ? 's' : ''}` },
          status: 'pending',
          successLabel: `${count} item${count !== 1 ? 's' : ''} added to case`,
        };
        setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, toolCall } : m));
      }
      // attach chunk map so citation tooltips can show retrieved text
      if (Object.keys(chunksByFileId).length > 0) {
        setChatMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, chunkMap: chunksByFileId } : m)
        );
      }
    } catch (err) {
      console.error('[chat] error:', err);
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setChatMessages(prev =>
        prev.map(m => m.id === assistantId ? { ...m, text: msg } : m)
      );
    } finally {
      setChatStreamingId(null);
    }
  };

  const handleSkillChange = (skill: string | null) => {
    setChatSkill(skill);
    if (skill === null) {
      setConfirmedEvidenceItems([]);
      setEvidenceCount(0);
    }
  };

  const needsEvidenceGuidance = (skill: string | null, items: GraphNode[]) =>
    skill === 'deep-research' && items.length === 0;

  const evidenceGuidanceMessage = (): ChatMessage => ({
    id: `asst-${Date.now()}`,
    role: 'assistant',
    text: 'To use Deep Research, please select the evidence you\'d like me to analyze first.',
    showSelectEvidence: true,
  });

  const isSearchIntent = (text: string): boolean => {
    const lower = text.toLowerCase().trim();
    return /\b(find|search|look|locate|show|get|pull|retrieve)\b/.test(lower) &&
      /\b(evidence|footage|video|clip|file|document|report|record|image|photo|body.?cam|dashcam|cctv)\b/.test(lower);
  };

  const FACIAL_MATCH_WATCHLIST_RE = /facial.?match.*watchlist|watchlist.*facial.?match|enable.*watchlist|watchlist.*permiss/i;

  const ADD_TO_CASE_RE = /\badd\b.*(to|into)\s*(a\s+)?case\b|\badd.*evidence.*to.*case|move.*to.*case|link.*to.*case/i;

  const makeAddToCaseMock = (items: GraphNode[], text: string): ChatMessage => {
    const caseMatch = text.match(/\bcase[\s:]+([A-Z0-9][\w-]*)/i);
    const caseId = caseMatch?.[1] ?? items[0]?.case_id ?? 'CR-2024-001';
    const itemCount = items.length;
    const evidenceIds = items.map(e => e.id).slice(0, 3).join(', ') + (items.length > 3 ? ` +${items.length - 3} more` : '');
    return {
      id: `asst-${Date.now()}`,
      role: 'assistant',
      text: `I'll link ${itemCount} evidence item${itemCount !== 1 ? 's' : ''} to case ${caseId}. Please review and approve below.`,
      toolCall: {
        name: 'add_evidence_to_case',
        label: `Add ${itemCount} item${itemCount !== 1 ? 's' : ''} to Case ${caseId}`,
        description: `Links the selected evidence to case ${caseId} in the evidence management system.`,
        input: {
          case_id: caseId,
          evidence_count: String(itemCount),
          evidence_ids: evidenceIds,
        },
        status: 'pending',
      },
    };
  };

  const handleToolCallApprove = (msgId: string) => {
    setChatMessages(prev => prev.map(m =>
      m.id === msgId && m.toolCall
        ? { ...m, toolCall: { ...m.toolCall, status: 'approved' as const } }
        : m
    ));
  };

  const handleToolCallDeny = (msgId: string) => {
    setChatMessages(prev => prev.map(m =>
      m.id === msgId && m.toolCall
        ? { ...m, toolCall: { ...m.toolCall, status: 'denied' as const } }
        : m
    ));
  };

  const handleMetadataEditApply = (msgId: string, editId: string) => {
    setChatMessages(prev => prev.map(m => {
      if (m.id !== msgId || !m.metadataEdits) return m;
      const edit = m.metadataEdits.find(e => e.id === editId);
      if (!edit) return m;
      const idsToUpdate = edit.evidence_ids ?? [edit.evidence_id];
      setConfirmedEvidenceItems(items => items.map(item => {
        if (!idsToUpdate.includes(item.id)) return item;
        if (edit.field === 'tags') {
          const existing: string[] = (item as any).tags ?? [];
          return { ...item, tags: [...existing.filter((t: string) => t !== edit.new_value), edit.new_value] };
        }
        return { ...item, [edit.field]: edit.new_value };
      }));
      return {
        ...m,
        metadataEdits: m.metadataEdits.map(e => e.id === editId ? { ...e, status: 'applied' as const } : e),
      };
    }));
  };

  const handleMetadataEditDismiss = (msgId: string, editId: string) => {
    setChatMessages(prev => prev.map(m => {
      if (m.id !== msgId || !m.metadataEdits) return m;
      return {
        ...m,
        metadataEdits: m.metadataEdits.map(e => e.id === editId ? { ...e, status: 'dismissed' as const } : e),
      };
    }));
  };

  const FACIAL_MATCH_MOCK_TEXT = "Sure. To grant Administrators on Pro accounts the ability to create and edit facial match watchlists, I'll update the role permission configuration. Please review and approve the change below.";

  const makeFacialMatchMock = (): ChatMessage => ({
    id: `asst-${Date.now()}`,
    role: 'assistant',
    text: FACIAL_MATCH_MOCK_TEXT,
    toolCall: {
      name: 'set_permission',
      label: 'Enable: Create and Edit Facial Match Watchlist',
      description: 'Grants Administrators on Pro accounts the ability to create and edit facial recognition watchlists.',
      input: {
        permission: 'facial_match_watchlist.create_edit',
        role: 'Administrator',
        account_type: 'Pro',
        enabled: 'true',
      },
      status: 'pending',
    },
  });

  const handleChat = (text: string) => {
    if (isSearchIntent(text)) { onSearch(text); return; }
    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', text };
    setChatOpen(true);
    if (FACIAL_MATCH_WATCHLIST_RE.test(text)) {
      setChatMessages([userMsg, makeFacialMatchMock()]);
      return;
    }
    if (ADD_TO_CASE_RE.test(text) && confirmedEvidenceItems.length > 0) {
      setChatMessages([userMsg, makeAddToCaseMock(confirmedEvidenceItems, text)]);
      return;
    }
    if (needsEvidenceGuidance(chatSkill, confirmedEvidenceItems)) {
      setChatMessages([userMsg, evidenceGuidanceMessage()]);
      return;
    }
    setChatMessages([userMsg]);
    sendChatMessage(text, [], confirmedEvidenceItems);
  };

  const handleChatSend = (text: string) => {
    if (text.startsWith('__system__')) {
      const systemText = text.slice('__system__'.length);
      setChatMessages(prev => [...prev, { id: `sys-${Date.now()}`, role: 'system', text: systemText }]);
      return;
    }
    if (isSearchIntent(text)) { onSearch(text); return; }
    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', text };
    if (FACIAL_MATCH_WATCHLIST_RE.test(text)) {
      setChatMessages(prev => [...prev, userMsg, makeFacialMatchMock()]);
      return;
    }
    if (ADD_TO_CASE_RE.test(text) && confirmedEvidenceItems.length > 0) {
      setChatMessages(prev => [...prev, userMsg, makeAddToCaseMock(confirmedEvidenceItems, text)]);
      return;
    }
    if (needsEvidenceGuidance(chatSkill, confirmedEvidenceItems)) {
      setChatMessages(prev => [...prev, userMsg, evidenceGuidanceMessage()]);
      return;
    }
    setChatMessages(prev => [...prev, userMsg]);
    sendChatMessage(text, [...chatMessages, userMsg], confirmedEvidenceItems);
  };

  return (
    <>
    <div
      style={{
        minHeight: '100%',
        background: 'var(--base)',
        padding: '48px 40px 48px',
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* Greeting */}
        <h1 style={{ fontSize: 32, fontWeight: 400, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.01em', display: 'flex', alignItems: 'baseline', gap: '0.35em', flexWrap: 'nowrap' }}>
          Ask Assistant to
          <AnimatedSubtitle />
        </h1>

        {/* Chat / Search */}
        <HomeSearch
          onSearch={onSearch}
          onChat={handleChat}
          onSelectEvidence={() => { setEvidenceSource('home'); setEvidenceOpen(p => !p); }}
          evidenceCount={evidenceCount}
          skill={chatSkill}
          onSkillChange={handleSkillChange}
        />

        {/* Bento grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: 12, alignItems: 'start' }}>
          {/* Row 1: Performance — full width */}
          <div style={{ gridColumn: 'span 2' }}>
            <MyPerformance />
          </div>

          {/* Row 2: Tasks + Devices side by side */}
          <MyTasks />
          <AssignedDevices />

          {/* Row 3: Reports — full width */}
          <div style={{ gridColumn: 'span 2' }}>
            <MyReports />
          </div>

          {/* Row 4: Recent Incidents — full width */}
          <div style={{ gridColumn: 'span 2' }}>
            <RecentIncidents />
          </div>
        </div>

      </div>
    </div>
    <EvidenceDrawer
      open={evidenceOpen}
      onClose={() => setEvidenceOpen(false)}
      onSelectionChange={(items: GraphNode[]) => { setConfirmedEvidenceItems(items); setEvidenceCount(items.length); }}
      onConfirm={(items: GraphNode[]) => { setConfirmedEvidenceItems(items); setEvidenceCount(items.length); if (evidenceSource === 'drawer') setChatOpen(true); }}
    />
    <ChatDrawer
      open={chatOpen}
      messages={chatMessages}
      onClose={() => { setChatOpen(false); setEvidenceOpen(false); setOpenDraft(null); }}
      onNewChat={() => setChatMessages([])}
      onSend={handleChatSend}
      onSelectEvidence={() => { setEvidenceSource('drawer'); setEvidenceOpen(true); }}
      evidenceOpen={evidenceOpen}
      evidenceCount={evidenceCount}
      isStreaming={chatStreamingId !== null}
      skill={chatSkill}
      onSkillChange={handleSkillChange}
      evidenceItems={confirmedEvidenceItems}
      onOpenDraft={setOpenDraft}
      draftOpen={!!openDraft}
      onToolCallApprove={handleToolCallApprove}
      onToolCallDeny={handleToolCallDeny}
      onMetadataEditApply={handleMetadataEditApply}
      onMetadataEditDismiss={handleMetadataEditDismiss}
    />
    <DraftDrawer draft={openDraft} open={!!openDraft} onClose={() => setOpenDraft(null)} />
    </>
  );
}
