import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import type { Facet } from '../engine/filterRegistry';

// ─── Hook ────────────────────────────────────────────────────────────────────
// Generic, facet-key-keyed selection state. Works for any result kind — the
// facet definitions live in the filter registry, not here.

export function useOmniFilters() {
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});

  const toggle = (key: string, value: string) => {
    setSelections(prev => {
      const next = { ...prev };
      const set = new Set(next[key] ?? []);
      if (set.has(value)) set.delete(value); else set.add(value);
      if (set.size === 0) delete next[key]; else next[key] = set;
      return next;
    });
  };

  const clear = (key: string) => setSelections(prev => {
    const next = { ...prev };
    delete next[key];
    return next;
  });

  const clearAll = () => setSelections({});

  const activeCount = Object.values(selections).reduce((n, s) => n + s.size, 0);

  return { selections, toggle, clear, clearAll, activeCount };
}

export type OmniFilters = ReturnType<typeof useOmniFilters>;

// ─── Facet dropdown ────────────────────────────────────────────────────────────

function FacetDropdown({ facet, selected, onToggle, onClear }: {
  facet: Facet;
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchable = facet.options.length > 8;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const count = selected.size;
  const label = count === 0
    ? facet.label
    : count === 1
      ? [...selected][0]
      : `${count} ${facet.label.toLowerCase()}`;

  const visibleOptions = search
    ? facet.options.filter(o => o.value.toLowerCase().includes(search.toLowerCase()))
    : facet.options;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 99,
          border: '1px solid var(--border)',
          backgroundColor: count > 0 ? 'var(--fill-weaker)' : 'transparent',
          color: 'var(--foreground)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
        <ChevronDown size={11} style={{ opacity: 0.6 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0,
          width: 240, zIndex: 400,
          backgroundColor: 'var(--raised)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,0.14)', overflow: 'hidden',
        }}>
          {searchable && (
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.stopPropagation()}
                  autoFocus
                  placeholder={`Search ${facet.label.toLowerCase()}`}
                  style={{
                    width: '100%', height: 28, padding: '0 28px 0 8px',
                    border: '1px solid var(--border)', borderRadius: 6,
                    backgroundColor: 'var(--fill-weaker)', color: 'var(--foreground)',
                    fontSize: 12, outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <Search size={12} style={{ position: 'absolute', right: 8, color: 'var(--text-weak)', pointerEvents: 'none' }} />
              </div>
            </div>
          )}
          <div style={{ maxHeight: 280, overflowY: 'auto', padding: '4px 0' }}>
            {visibleOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => onToggle(opt.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px',
                  backgroundColor: selected.has(opt.value) ? 'var(--fill-weaker)' : 'transparent',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--fill-hover)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = selected.has(opt.value) ? 'var(--fill-weaker)' : 'transparent')}
              >
                <div style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  border: `1.5px solid ${selected.has(opt.value) ? 'var(--foreground)' : 'var(--border)'}`,
                  backgroundColor: selected.has(opt.value) ? 'var(--foreground)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected.has(opt.value) && <Check size={10} style={{ color: 'var(--background)' }} strokeWidth={3} />}
                </div>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--foreground)' }}>{opt.value}</span>
                <span style={{ fontSize: 11, color: 'var(--text-weak)' }}>{opt.count}</span>
              </button>
            ))}
            {visibleOptions.length === 0 && (
              <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-weak)' }}>No matches</div>
            )}
          </div>
          {count > 0 && (
            <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)' }}>
              <button onClick={onClear} style={{ fontSize: 12, color: 'var(--text-weak)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SearchFilterBarProps {
  facets: Facet[];
  filters: OmniFilters;
}

export function SearchFilterBar({ facets, filters }: SearchFilterBarProps) {
  const { selections, toggle, clear, clearAll, activeCount } = filters;

  if (facets.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-weak)' }}>
        Pick a category above to filter these results.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {facets.map(facet => (
        <FacetDropdown
          key={facet.key}
          facet={facet}
          selected={selections[facet.key] ?? new Set()}
          onToggle={value => toggle(facet.key, value)}
          onClear={() => clear(facet.key)}
        />
      ))}
      {activeCount > 0 && (
        <button
          onClick={clearAll}
          style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-weak)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 6px' }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
