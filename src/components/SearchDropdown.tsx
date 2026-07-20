import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  ArrowUpRight,
  ArrowRight,
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
  Mic,
  MapPin,
  Settings as SettingsIcon,
  Key,
  Sparkles,
} from 'lucide-react';
import { agentSearch, reverseImageSearch } from '../engine/agentSearch';
import { SearchOutput, SearchEvidenceResult, MediaClass } from '../data/types';

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
  {
    id: 'location',
    label: 'Location',
    icon: <MapPin size={13} />,
    filter: (r) => !!r.location,
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


// ─── Omni result row (people / devices / settings / capabilities) ─────────────

function OmniRow({ title, subtitle, query, onClick }: {
  title: string;
  subtitle?: string;
  query: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '8px 14px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
      }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--fill-hover)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <HighlightText text={title} query={query} />
        </div>
        {subtitle && (
          <div style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </div>
        )}
      </div>
      <ArrowUpRight size={13} style={{ color: 'var(--text-weak)', flexShrink: 0 }} />
    </button>
  );
}

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
  onVoiceSearch?: () => void;
  onImageSearch?: () => void;
  onAiMode?: () => void;
}


export function SearchDropdown({ inputRef, query, onQueryChange, onClose, onOpenSearch, resultCount, onResultTagClick, onClearResults, onVoiceSearch, onImageSearch, onAiMode }: SearchDropdownProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [output, setOutput] = useState<SearchOutput | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches);
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());
  const [imageUploadOpen, setImageUploadOpen] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<{ name: string; url: string } | null>(null);
  const [activeCategoryKey, setActiveCategoryKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setUploadedImage({ name: file.name, url });
    onImageSearch?.();

    // Kick off the reverse image search as soon as the image is uploaded.
    const version = ++searchVersion.current;
    setIsLoading(true);
    setOutput(null);
    // Brief delay so the "Searching…" state is visible before results land.
    setTimeout(() => {
      if (version !== searchVersion.current) return;
      setOutput(reverseImageSearch());
      setIsLoading(false);
    }, 600);
  };

  const openImageUploader = () => {
    setIsOpen(true);
    setImageUploadOpen(true);
  };

  const closeImageUploader = () => {
    setImageUploadOpen(false);
    if (uploadedImage) URL.revokeObjectURL(uploadedImage.url);
    setUploadedImage(null);
    // Cancel any in-flight image search and clear its results.
    searchVersion.current++;
    setOutput(null);
    setIsLoading(false);
  };

  const searchVersion = useRef(0);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setImageUploadOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Keyboard shortcuts: Esc to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setImageUploadOpen(false);
        inputRef.current?.blur();
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

  // Re-default to the first available category whenever the query changes,
  // rather than sticking on a tab from the previous search's result set.
  useEffect(() => {
    setActiveCategoryKey(null);
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
            aiOverview: prev?.aiOverview,
            results: partial,
            omniResults: prev?.omniResults ?? [],
            entities: prev?.entities ?? [],
            chips: prev?.chips ?? [],
            suggestions: prev?.suggestions ?? [],
            graph_context: prev?.graph_context ?? { cases_involved: [], total_scoped: 0, total_matched: 0 },
          }));
          // Keep the loading state until the full result lands when the partial
          // is empty — otherwise a pending AI overview or omni-only result set
          // would briefly flash "No results".
          if (partial.length > 0) setIsLoading(false);
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
    ? (activeScopes.length > 0
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

  // Case matches — prefer real case ids from matched results (accurate for
  // prefix-style queries like "PBPD-2025" that span several cases); fall back
  // to the LLM's named case entities only when no evidence actually matched
  // (e.g. a descriptive reference with nothing scoped yet).
  const caseMatches = uniqueCases.length > 0
    ? uniqueCases.map(cid => {
        const entity = caseEntities.find(e => e.id.toLowerCase() === cid.toLowerCase());
        return {
          id: cid,
          name: entity?.name || cid,
          subtitle: entity?.subtitle || `${output?.results.filter(r => r.case_id === cid).length ?? 0} evidence`,
        };
      })
    : caseEntities.map(e => ({
        id: e.id,
        name: e.name,
        subtitle: e.subtitle || `${output?.results.filter(r => r.case_id === e.id).length ?? 0} evidence`,
      }));

  // Evidence ID matches — surfaced as its own chip section (like Cases) only
  // when the query itself looks like an evidence ID being typed (e.g. "EV-"),
  // so partial IDs list every candidate instead of relying on Top Matches.
  const looksLikeEvidenceIdQuery = /^ev[-\s]/i.test(q);
  const evidenceIdMatches = looksLikeEvidenceIdQuery && output
    ? [...new Set(output.results.map(r => r.evidence_id).filter(Boolean))].map(id => {
        const result = output.results.find(r => r.evidence_id === id);
        return {
          id,
          name: id,
          subtitle: result ? [result.title, result.category, result.officer].filter(Boolean).join(' • ') : 'Evidence',
        };
      })
    : [];

  // Non-evidence omni results (settings, capabilities, people, devices) — these
  // never appear in `output.results` (evidence only), so a query like "face
  // match settings" would otherwise show "No results". Not shown in image mode.
  const omniResults = (!imageUploadOpen && output?.omniResults) || [];
  const omniSections = [
    { key: 'person',     label: 'People',       items: omniResults.filter(r => r.kind === 'person'),     fallback: '/settings/users' },
    { key: 'device',     label: 'Devices',      items: omniResults.filter(r => r.kind === 'device'),     fallback: '/settings/devices' },
    { key: 'setting',    label: 'Settings',     items: omniResults.filter(r => r.kind === 'setting'),    fallback: '/settings' },
    { key: 'capability', label: 'Capabilities', items: omniResults.filter(r => r.kind === 'capability'), fallback: '/settings/permissions' },
  ].filter(s => s.items.length > 0);
  const hasOmni = omniSections.length > 0;

  // Unified category browser — one tab per result kind (Evidence, Cases, plus
  // whatever omni kinds matched), each with its own row list. Replaces the old
  // stacked sections (case chips, evidence-id chips, top matches, omni blocks)
  // with a single decluttered sidebar + list.
  interface DropdownCategoryItem { id: string; title: string; subtitle?: string; onClick: () => void }
  interface DropdownCategory { key: string; label: string; items: DropdownCategoryItem[] }

  const evidenceCategoryItems: DropdownCategoryItem[] = looksLikeEvidenceIdQuery
    ? evidenceIdMatches.map(e => ({
        id: e.id,
        title: e.name,
        subtitle: e.subtitle,
        onClick: () => { setIsOpen(false); onQueryChange(''); navigate(`/search/evidence/${e.id}`); },
      }))
    : filteredResults.map(r => ({
        id: r.evidence_id,
        title: r.evidence_id,
        subtitle: [r.title, r.category, r.officer].filter(Boolean).join(' • '),
        onClick: () => { setIsOpen(false); onQueryChange(''); navigate(`/search/evidence/${r.evidence_id}`); },
      }));

  const caseCategoryItems: DropdownCategoryItem[] = caseMatches.map(c => ({
    id: c.id,
    title: c.name,
    subtitle: c.subtitle,
    onClick: () => { setIsOpen(false); onQueryChange(''); navigate(`/cases/${c.id}`); },
  }));

  const dropdownCategories: DropdownCategory[] = [
    { key: 'evidence', label: 'Evidence', items: evidenceCategoryItems },
    { key: 'case', label: 'Cases', items: caseCategoryItems },
    ...omniSections.map(s => ({
      key: s.key,
      label: s.label,
      items: s.items.map(it => ({
        id: it.id,
        title: it.title,
        subtitle: it.subtitle,
        onClick: () => { setIsOpen(false); onQueryChange(''); navigate(it.deeplink ?? s.fallback); },
      })),
    })),
  ].filter(c => c.items.length > 0);

  const dropdownGrandTotal = dropdownCategories.reduce((sum, c) => sum + c.items.length, 0);
  const activeCategory = dropdownCategories.find(c => c.key === activeCategoryKey) ?? dropdownCategories[0];

  const aiOverview = (!imageUploadOpen && output?.aiOverview) || '';
  const hasAiOverview = aiOverview.length > 0;

  const imageMode = imageUploadOpen && !!uploadedImage;
  const dropdownVisible = isOpen && (showRecents ? true : (isLoading || hasResults || hasOmni || hasAiOverview || output !== null));
  const panelOpen = dropdownVisible || (isOpen && imageUploadOpen);
  const showImageResults = imageMode && (isLoading || output !== null);

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
          borderRadius: panelOpen ? '10px 10px 8px 8px' : 10,
          boxShadow: panelOpen ? '0 6px 20px rgba(0,0,0,0.14)' : 'none',
          overflow: 'hidden',
        }}
      >
        {/* Input row */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 36 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, color: 'var(--text-weak)', pointerEvents: 'none' }} />
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
            placeholder="Search for anything"
            style={{
              width: '100%',
              height: '100%',
              paddingLeft: 32,
              paddingRight: ((resultCount ?? 0) > 0 && !isOpen) ? 130 : (query ? 120 : 140),
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
            {!query && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  title="Search by voice"
                  aria-label="Search by voice"
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => { e.stopPropagation(); onVoiceSearch?.(); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-weak)', borderRadius: 99 }}
                >
                  <Mic size={15} />
                </button>
                <button
                  type="button"
                  title="Search by image"
                  aria-label="Search by image"
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => { e.stopPropagation(); openImageUploader(); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-weak)', borderRadius: 99 }}
                >
                  <Image size={15} />
                </button>
              </div>
            )}
            {query && isOpen && (
              <>
                <button
                  onClick={handleClear}
                  title="Clear search"
                  aria-label="Clear search"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-weak)', borderRadius: 99 }}
                >
                  <X size={13} />
                </button>
                <div style={{ width: 1, height: 18, backgroundColor: 'var(--border)', flexShrink: 0 }} />
              </>
            )}
          </div>
        </div>

        {/* Image uploader — reverse image search */}
        {isOpen && imageUploadOpen && (
          <div style={{ borderTop: '1px solid var(--border)', padding: 12 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => handleImageFile(e.target.files?.[0])}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Search by image
              </span>
              <button
                type="button"
                onClick={closeImageUploader}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-weak)', borderRadius: 99 }}
              >
                <X size={13} />
              </button>
            </div>
            {uploadedImage ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src={uploadedImage.url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uploadedImage.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-weak)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isLoading
                      ? (<><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />Searching for visually similar evidence…</>)
                      : `${output?.results.length ?? 0} visually similar ${(output?.results.length ?? 0) === 1 ? 'result' : 'results'}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-weak)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Replace
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); }}
                onDrop={e => { e.preventDefault(); handleImageFile(e.dataTransfer.files?.[0]); }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: '100%', padding: '24px 12px',
                  border: '1px dashed var(--border)', borderRadius: 8,
                  backgroundColor: 'var(--fill-weaker)', cursor: 'pointer',
                  color: 'var(--text-weak)', fontFamily: 'inherit',
                }}
              >
                <Image size={22} />
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)' }}>Drop an image or click to upload</span>
                <span style={{ fontSize: 12 }}>Find visually similar evidence</span>
              </button>
            )}
          </div>
        )}

        {/* Dropdown content */}
        {((dropdownVisible && !imageUploadOpen) || showImageResults) && (
        <div style={{ borderTop: '1px solid var(--border)', paddingBottom: 12, maxHeight: 480, overflowY: 'auto', overscrollBehavior: 'contain' }}>

          {/* ── Recent searches / Autocomplete suggestions ── */}
          {showRecents && !imageMode && (
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
          {(!showRecents || imageMode) && (
            <>
              {/* Loading state */}
              {isLoading && topResults.length === 0 && !imageMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px', color: 'var(--text-weak)', fontSize: 13 }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Searching...
                </div>
              )}

              {/* No results state */}
              {!isLoading && output && dropdownCategories.length === 0 && !hasAiOverview && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)' }}>
                    {imageMode ? 'No visually similar evidence found' : `No results for "${q}"`}
                  </div>
                </div>
              )}

              {/* AI overview — direct answer to a policy / procedure question */}
              {!isLoading && hasAiOverview && (
                <div style={{ padding: '12px 14px', borderBottom: (dropdownCategories.length > 0) ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Sparkles size={13} style={{ color: '#E07010' }} />
                    <span style={{
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                      backgroundImage: 'linear-gradient(90deg, #F5C400 0%, #E07010 50%, #3A54A8 100%)',
                      WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent',
                    }}>
                      Assistant
                    </span>
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--foreground)', margin: 0, whiteSpace: 'pre-wrap' }}>{aiOverview}</p>
                  <button
                    onClick={() => { setIsOpen(false); onAiMode?.(); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#2563eb', fontFamily: 'inherit' }}
                    onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                  >
                    Ask a follow-up in AI mode
                    <ArrowRight size={13} />
                  </button>
                </div>
              )}

              {/* Visual Matches (reverse image search only — single result kind,
                  doesn't need the category browser) */}
              {imageMode && topResults.length > 0 && (
                <>
                  <div style={{ padding: '8px 14px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-weak)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Visual Matches</span>
                    <button
                      onClick={() => { setIsOpen(false); onOpenSearch('Visually similar evidence', undefined, output ?? undefined); }}
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

              {/* Category browser — one tab per result kind, sharing a single
                  scrollable list, instead of stacking every kind vertically. */}
              {!isLoading && !imageMode && dropdownCategories.length > 0 && activeCategory && (
                <div>
                  <div style={{ display: 'flex' }}>
                    <div style={{ width: 132, flexShrink: 0, borderRight: '1px solid var(--border)', padding: '6px 0' }}>
                      {dropdownCategories.map(cat => {
                        const isActive = cat.key === activeCategory.key;
                        return (
                          <button
                            key={cat.key}
                            onClick={() => setActiveCategoryKey(cat.key)}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                              padding: '8px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                              backgroundColor: isActive ? 'var(--fill-weak)' : 'transparent',
                              color: isActive ? 'var(--foreground)' : 'var(--text-weak)',
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--fill-hover)'; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.label}</span>
                            <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 600, color: 'var(--text-weak)', flexShrink: 0, marginLeft: 8 }}>{cat.items.length}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, maxHeight: 280, overflowY: 'auto', padding: '4px 0' }}>
                      {activeCategory.items.slice(0, 6).map(item => (
                        <OmniRow
                          key={item.id}
                          title={item.title}
                          subtitle={item.subtitle}
                          query={q}
                          onClick={item.onClick}
                        />
                      ))}
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px' }}>
                    <button
                      onClick={() => { setIsOpen(false); onOpenSearch(q, undefined, output ?? undefined); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 500, color: '#2563eb', fontFamily: 'inherit', padding: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                    >
                      See all {dropdownGrandTotal} results
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              )}

            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
