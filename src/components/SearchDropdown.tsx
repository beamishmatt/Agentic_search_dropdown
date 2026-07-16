import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  ArrowUpRight,
  Video,
  FileText,
  Image,
  File,
  Loader2,
  LayoutGrid,
  FolderOpen,
  User,
  Car,
  Smartphone,
  AlertTriangle,
  Maximize2,
} from 'lucide-react';
import { agentSearch } from '../engine/agentSearch';
import { SearchOutput, SearchEvidenceResult, MediaClass } from '../data/types';
import { useSearchFilters } from './SearchFilterBar';

// ─── Scope chips ──────────────────────────────────────────────────────────────

export interface ScopeChip {
  id: string;
  label: string;
  icon: React.ReactNode;
  filter: (r: SearchEvidenceResult) => boolean;
}

export const SCOPE_CHIPS: ScopeChip[] = [
  {
    id: 'evidence',
    label: 'Evidence',
    icon: <Video size={13} />,
    filter: () => true,
  },
  {
    id: 'incident',
    label: 'Incident',
    icon: <AlertTriangle size={13} />,
    filter: (r) => r.category?.toLowerCase().includes('incident') || r.tags?.some(t => t.toLowerCase().includes('incident')) || false,
  },
  {
    id: 'case',
    label: 'Case',
    icon: <FolderOpen size={13} />,
    filter: (r) => !!r.case_id,
  },
  {
    id: 'person',
    label: 'Person',
    icon: <User size={13} />,
    filter: (r) => r.category?.toLowerCase().includes('user') || r.officer !== undefined || false,
  },
  {
    id: 'vehicle',
    label: 'Vehicle',
    icon: <Car size={13} />,
    filter: (r) => r.category?.toLowerCase().includes('vehicle') || r.tags?.some(t => t.toLowerCase().includes('vehicle')) || false,
  },
  {
    id: 'device',
    label: 'Device',
    icon: <Smartphone size={13} />,
    filter: (r) => r.category?.toLowerCase().includes('device') || r.tags?.some(t => t.toLowerCase().includes('device')) || false,
  },
  {
    id: 'multi-cam',
    label: 'Multi-cam',
    icon: <LayoutGrid size={13} />,
    filter: (r) => r.media_class === 'video' || r.tags?.some(t => t.toLowerCase().includes('multi-cam')) || false,
  },
];

const RECENT_SEARCHES_KEY = 'command_recent_searches';

function loadRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || 'null') ?? [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string, current: string[]): string[] {
  const updated = [query, ...current.filter(s => s !== query)].slice(0, 10);
  try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
  return updated;
}

const STOP_WORDS = new Set([
  'the', 'and', 'or', 'for', 'not', 'but', 'nor', 'yet', 'so',
  'a', 'an', 'in', 'on', 'at', 'to', 'of', 'up', 'by', 'as',
  'is', 'it', 'its', 'was', 'are', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'with', 'from', 'that', 'this', 'these',
  'those', 'there', 'their', 'they', 'what', 'which', 'who', 'when',
  'where', 'how', 'any', 'all', 'some', 'than', 'then', 'into', 'about',
]);

function SuggestionText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <strong style={{ color: 'var(--foreground)', fontWeight: 600 }}>{text.slice(idx, idx + query.length)}</strong>
      {text.slice(idx + query.length)}
    </>
  );
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim() || !text) return <>{text}</>;
  const words = query.trim().split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()));
  if (words.length === 0) return <>{text}</>;
  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(re);
  const matchRe = new RegExp(`^(?:${escaped})$`, 'i');
  return (
    <>
      {parts.map((part, i) =>
        matchRe.test(part)
          ? <mark key={i} style={{ backgroundColor: 'rgba(254,198,46,0.5)', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
          : part
      )}
    </>
  );
}

function MediaIcon({ mediaClass, style: extraStyle }: { mediaClass: MediaClass | string; style?: React.CSSProperties }) {
  const style: React.CSSProperties = { color: 'var(--text-weak)', flexShrink: 0, ...extraStyle };
  switch (mediaClass) {
    case 'video': return <Video size={13} style={style} />;
    case 'image': return <Image size={13} style={style} />;
    case 'audio': return <File size={13} style={style} />;
    default: return <FileText size={13} style={style} />;
  }
}


function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

function ChipBadge({ chip, onRemove }: { chip: FilterChip; onRemove: (id: string) => void }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 8px 3px 10px', borderRadius: 99,
        backgroundColor: 'var(--fill-weaker)', border: '1px solid var(--border)',
        fontSize: 12, fontWeight: 500, color: 'var(--foreground)',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {chip.label}
      <button
        onClick={() => onRemove(chip.id)}
        style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-weak)' }}
      >
        <X size={10} />
      </button>
    </span>
  );
}

// ─── Result row ───────────────────────────────────────────────────────────────

function ResultRow({ result, query, onClick }: { result: SearchEvidenceResult; query: string; onClick: () => void }) {
  const metaParts = [
    result.evidence_id ? `ID: ${result.evidence_id}` : null,
    formatDate(result.date_recorded) || null,
    result.officer || null,
  ].filter(Boolean).join(' • ');

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '10px 14px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
      }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--fill-hover)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <MediaIcon mediaClass={result.media_class} style={{ flexShrink: 0, alignSelf: 'center' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 2 }}>
          <HighlightText text={result.title} query={query} />
        </div>
        {metaParts && (
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: result.relevance ? 2 : 0 }}>
            {metaParts}
          </div>
        )}
        {result.relevance && (
          <div style={{ fontSize: 11, color: '#9ca3af' }}>
            {result.relevance}
          </div>
        )}
      </div>
    </button>
  );
}


// ─── Case chip ────────────────────────────────────────────────────────────────

function CaseChip({ label, query, onClick }: { label: string; query: string; onClick?: () => void }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 99, border: '1px solid var(--border)',
        backgroundColor: hovered ? 'var(--fill-hover)' : 'transparent',
        cursor: 'pointer', fontFamily: 'inherit', transition: 'background-color 0.1s',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
        <HighlightText text={label} query={query} />
      </span>
      <ArrowUpRight size={13} style={{ color: 'var(--text-weak)', flexShrink: 0 }} />
    </button>
  );
}

// ─── Filter section ───────────────────────────────────────────────────────────


// ─── Main component ───────────────────────────────────────────────────────────

interface SearchDropdownProps {
  inputRef: React.RefObject<HTMLInputElement>;
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  onOpenSearch: (query: string, selectedId?: string, output?: SearchOutput) => void;
  resultCount?: number;
  onResultTagClick?: () => void;
  onClearResults?: () => void;
}

const PLACEHOLDER_QUERIES = [
  'body cam footage from PBPD-2025-088142…',
  'witness statements officer Thibodaux…',
  'traffic stop videos last 30 days…',
  'EV-PSTDF2T9…',
  'shooting incident photos case 088142…',
  'drug offense documents officer Martin…',
];

const CYCLE_INTERVAL = 3400;

function useCyclingPlaceholder(active: boolean): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      setIndex(i => (i + 1) % PLACEHOLDER_QUERIES.length);
    }, CYCLE_INTERVAL);
    return () => clearInterval(t);
  }, [active]);

  return PLACEHOLDER_QUERIES[index];
}

function AnimatedPlaceholder({ text }: { text: string }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: 32,
        right: 32,
        top: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={text}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, filter: 'blur(4px)', transition: { duration: 0.18 } }}
          style={{ display: 'flex', overflow: 'hidden', whiteSpace: 'nowrap' }}
        >
          {text.split('').map((char, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, filter: 'blur(6px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.3, delay: i * 0.018 }}
              style={{ fontSize: '12px', color: 'rgba(0,0,0,0.35)', fontFamily: 'inherit', lineHeight: 1 }}
            >
              {char === ' ' ? '\u00a0' : char}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

export function SearchDropdown({ inputRef, query, onQueryChange, onClose, onOpenSearch, resultCount, onResultTagClick, onClearResults }: SearchDropdownProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [output, setOutput] = useState<SearchOutput | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches);
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());
  const searchFilters = useSearchFilters();
  const { filterResults } = searchFilters;
  const cyclingPlaceholder = useCyclingPlaceholder(!query && !isFocused);

  const toggleScope = (id: string) => {
    setSelectedScopes(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };
  const searchVersion = useRef(0);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Keyboard shortcuts: Esc to close, / to focus
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      } else if (e.key === '/' && document.activeElement !== inputRef.current) {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [inputRef]);

  // Reset results when query clears
  useEffect(() => {
    if (query.trim().length < 3) {
      setOutput(null);
      setIsLoading(false);
    }
  }, [query]);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;

    setIsLoading(true);
    const version = ++searchVersion.current;

    const t = setTimeout(async () => {
      try {
        const result = await agentSearch(q, undefined, (partial) => {
          if (version !== searchVersion.current) return;
          setOutput(prev => ({
            summary: prev?.summary ?? '',
            results: partial,
            entities: prev?.entities ?? [],
            chips: prev?.chips ?? [],
            suggestions: prev?.suggestions ?? [],
            graph_context: prev?.graph_context ?? { cases_involved: [], total_scoped: 0, total_matched: 0 },
          }));
          setIsLoading(false);
        });
        if (version !== searchVersion.current) return;
        setOutput(result);
        const saved = saveRecentSearch(q, recentSearches);
        setRecentSearches(saved);
      } catch {
        // ignore
      } finally {
        if (version === searchVersion.current) setIsLoading(false);
      }
    }, 400);

    return () => clearTimeout(t);
  }, [query]);

  const handleClear = () => {
    onQueryChange('');
    setOutput(null);
    onClearResults?.();
    inputRef.current?.focus();
  };

  const q = query.trim();
  const showRecents = q.length < 3;

  const autocompleteSuggestions = q.length > 0
    ? recentSearches
        .filter(s => s.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => {
          const aStarts = a.toLowerCase().startsWith(q.toLowerCase());
          const bStarts = b.toLowerCase().startsWith(q.toLowerCase());
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          return 0;
        })
    : [];

  const activeScopes = SCOPE_CHIPS.filter(s => selectedScopes.has(s.id));
  const filteredResults = output
    ? filterResults(activeScopes.length > 0
        ? output.results.filter(r => activeScopes.some(s => s.filter(r)))
        : output.results)
    : [];
  const hasResults = filteredResults.length > 0;
  const topResults = filteredResults.slice(0, 7);
  const totalCount = output?.graph_context.total_matched ?? filteredResults.length ?? 0;

  // Derive cases and people from actual results, falling back to entities
  const uniqueCases = output
    ? [...new Set(output.results.map(r => r.case_id).filter(Boolean))]
    : [];
  const uniquePeople = output
    ? [...new Set(output.results.map(r => r.officer).filter(Boolean))]
    : [];
  const caseEntities = output?.entities.filter(e => e.type === 'case') ?? [];
  const officerEntities = output?.entities.filter(e => e.type === 'officer') ?? [];

  // Case matches — prefer named case entities, fall back to case ids from results
  const caseMatches = caseEntities.length > 0
    ? caseEntities.map(e => ({
        id: e.id,
        name: e.name,
        subtitle: e.subtitle || `${output?.results.filter(r => r.case_id === e.id).length ?? 0} evidence`,
      }))
    : uniqueCases.map(cid => ({
        id: cid,
        name: cid,
        subtitle: `${output?.results.filter(r => r.case_id === cid).length ?? 0} evidence`,
      }));

  const dropdownVisible = isOpen && (showRecents ? true : (isLoading || hasResults || output !== null));

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', flex: '1 1 0', minWidth: 0, maxWidth: 600 }}
    >
      {/* Spacer — holds 36px in flow so the flex-centered UtilityBar wrapper never shifts */}
      <div style={{ height: 36, pointerEvents: 'none' }} aria-hidden="true" />

      {/* Unified container — always absolute so it never affects flow height */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          backgroundColor: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: dropdownVisible ? '10px 10px 8px 8px' : 10,
          boxShadow: dropdownVisible ? '0 6px 20px rgba(0,0,0,0.14)' : 'none',
        }}
      >
        {/* Input row */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 36 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, color: 'var(--text-weak)', pointerEvents: 'none' }} />
          {!query && !isFocused && (
            <AnimatedPlaceholder text={cyclingPlaceholder} />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onFocus={() => { setIsOpen(true); setIsFocused(true); }}
            onBlur={() => setIsFocused(false)}
            onKeyDown={e => {
              if (e.key === 'Enter' && query.trim().length >= 3) {
                setIsOpen(false);
                onOpenSearch(query.trim(), undefined, output ?? undefined);
              }
            }}
            placeholder=""
            style={{
              width: '100%',
              height: '100%',
              paddingLeft: 32,
              paddingRight: ((resultCount ?? 0) > 0 && !isOpen) ? 130 : (query ? 52 : 32),
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--foreground)',
              fontSize: 13,
              outline: 'none',
            }}
          />
          {/* Right-side controls */}
          <div style={{ position: 'absolute', right: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            {(resultCount ?? 0) > 0 && !isOpen && onResultTagClick && (
              <button
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                onClick={e => { e.stopPropagation(); onResultTagClick(); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  height: 18, padding: '0 5px',
                  border: '1px solid var(--border)', borderRadius: 4,
                  backgroundColor: 'var(--fill-weaker)',
                  color: 'var(--text-weak)', fontSize: 12,
                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', lineHeight: 1,
                }}
              >
                {resultCount} results
                <Maximize2 size={11} style={{ marginLeft: 3 }} />
              </button>
            )}
            {isLoading && !query && <Loader2 size={13} style={{ color: 'var(--text-weak)', animation: 'spin 1s linear infinite' }} />}
            {!isOpen && (
              <kbd style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, border: '1px solid var(--border)', borderRadius: 4,
                fontSize: 12, color: 'var(--text-weak)', backgroundColor: 'var(--fill-weaker)',
                fontFamily: 'inherit', lineHeight: 1, pointerEvents: 'none',
              }}>/</kbd>
            )}
            {query && isOpen && (
              <button
                onClick={handleClear}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-weak)', borderRadius: 99 }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Filter chips — always visible when open */}
        {isOpen && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SCOPE_CHIPS.map(chip => {
              const active = selectedScopes.has(chip.id);
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
        )}

        {/* Dropdown content */}
        {dropdownVisible && (
        <div style={{ borderTop: '1px solid var(--border)', paddingBottom: 12 }}>

          {/* ── Recent searches / Autocomplete suggestions ── */}
          {showRecents && (
            <>
              {/* Recent searches / Autocomplete suggestions */}
              {q.length === 0 ? (
                recentSearches.length > 0 && (
                  <>
                    <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 600, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Recent
                    </div>
                    {recentSearches.slice(0, 5).map((s, i) => (
                      <button
                        key={i}
                        onClick={() => { onQueryChange(s); setIsOpen(true); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 14px',
                          backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
                          fontSize: 10, color: '#9ca3af', textAlign: 'left',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--fill-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <Search size={10} style={{ color: '#9ca3af', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
                      </button>
                    ))}
                  </>
                )
              ) : (
                autocompleteSuggestions.length > 0 && (
                  <>
                    <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 600, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Suggestions
                    </div>
                    {autocompleteSuggestions.slice(0, 5).map((s, i) => (
                      <button
                        key={i}
                        onClick={() => { onQueryChange(s); setIsOpen(true); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 14px',
                          backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
                          fontSize: 10, color: '#9ca3af', textAlign: 'left',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--fill-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <Search size={10} style={{ color: '#9ca3af', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <SuggestionText text={s} query={q} />
                        </span>
                      </button>
                    ))}
                  </>
                )
              )}
            </>
          )}

          {/* ── Results view ── */}
          {!showRecents && (
            <>
              {/* Loading state */}
              {isLoading && topResults.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px', color: 'var(--text-weak)', fontSize: 13 }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Searching...
                </div>
              )}

              {/* No results state */}
              {!isLoading && output && topResults.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)' }}>No results for "{q}"</div>
                </div>
              )}

              {/* Case matches */}
              {!isLoading && caseMatches.length > 0 && (
                <>
                  <div style={{ padding: '8px 14px 2px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cases</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 14px 8px' }}>
                    {caseMatches.map(c => (
                      <CaseChip
                        key={c.id}
                        label={c.name}
                        query={q}
                        onClick={() => { setIsOpen(false); onQueryChange(''); navigate(`/cases/${c.id}`); }}
                      />
                    ))}
                  </div>
                  <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '0 14px' }} />
                </>
              )}

              {/* Top Matches */}
              {topResults.length > 0 && (
                <>
                  <div style={{ padding: '8px 14px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Matches</span>
                    <button
                      onClick={() => { setIsOpen(false); onOpenSearch(q, undefined, output ?? undefined); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#2563eb', padding: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                    >
                      See all {totalCount > 0 ? `${totalCount} ` : ''}results
                    </button>
                  </div>
                  {topResults.map((result, i) => (
                    <React.Fragment key={result.evidence_id}>
                      <ResultRow
                        result={result}
                        query={q}
                        onClick={() => { setIsOpen(false); onQueryChange(''); navigate(`/search/evidence/${result.evidence_id}`); }}
                      />
                      {i < topResults.length - 1 && (
                        <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '0 14px' }} />
                      )}
                    </React.Fragment>
                  ))}
                </>
              )}

            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
