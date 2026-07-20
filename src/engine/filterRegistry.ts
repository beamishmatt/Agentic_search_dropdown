// Result-type-aware filter registry — the core of "dynamic filters".
//
// Each ResultKind declares its facet dimensions. A facet knows how to extract
// its value(s) from a result; buildFacets() then derives the available options
// (with live counts) from the actual result set, so options are never stale or
// empty. applyFacetFilters() narrows results using the same extractors.

import { SearchResult, ResultKind, MediaClass } from '../data/types';

export interface FacetDef {
  key: string;
  label: string;
  // Value(s) this facet contributes for a result. Undefined = not applicable.
  getValue: (r: SearchResult) => string | string[] | undefined;
}

export interface FacetOption { value: string; count: number; }
export interface Facet { key: string; label: string; options: FacetOption[]; }

// ─── Shared value helpers ─────────────────────────────────────────────────────

export const DATE_BUCKETS = ['Last 24 hours', 'Last 7 days', 'Last 30 days', 'Last 90 days', 'Last year'];

// All date buckets a given ISO date falls within (an item < 7 days old is also
// < 30 days old, so it appears under multiple buckets — matching the old bar).
function dateBuckets(iso?: string): string[] {
  if (!iso) return [];
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (isNaN(days)) return [];
  const out: string[] = [];
  if (days <= 1) out.push('Last 24 hours');
  if (days <= 7) out.push('Last 7 days');
  if (days <= 30) out.push('Last 30 days');
  if (days <= 90) out.push('Last 90 days');
  if (days <= 365) out.push('Last year');
  return out;
}

function mediaClassLabel(mc: MediaClass | string): string {
  switch (mc) {
    case 'video': return 'Video';
    case 'audio': return 'Audio';
    case 'image': return 'Image';
    case 'document':
    case 'pdf':
    case 'text': return 'Document';
    default: return 'Other';
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const ev = (r: SearchResult) => (r.kind === 'evidence' ? r.evidence : undefined);

// Shared across settings + capabilities: the Evidence.com admin nav group.
const sectionFacet: FacetDef = {
  key: 'section',
  label: 'Section',
  getValue: r => (r.kind === 'setting' || r.kind === 'capability' ? r.section : undefined),
};

export const FILTER_REGISTRY: Record<ResultKind, FacetDef[]> = {
  evidence: [
    { key: 'source',    label: 'Source',    getValue: r => ev(r)?.source },
    { key: 'fileType',  label: 'File type', getValue: r => { const e = ev(r); return e ? mediaClassLabel(e.media_class) : undefined; } },
    { key: 'category',  label: 'Category',  getValue: r => ev(r)?.category },
    { key: 'officer',   label: 'Officer',   getValue: r => ev(r)?.officer },
    { key: 'location',  label: 'Location',  getValue: r => ev(r)?.location?.label },
    { key: 'date',      label: 'Date',      getValue: r => dateBuckets(ev(r)?.date_recorded) },
  ],
  case: [
    { key: 'owner',       label: 'Owner',        getValue: r => (r.kind === 'case' ? r.owner : undefined) },
    { key: 'status',      label: 'Status',       getValue: r => (r.kind === 'case' ? r.status : undefined) },
    { key: 'accessClass', label: 'Access class', getValue: r => (r.kind === 'case' ? r.accessClass : undefined) },
    { key: 'dateOpened',  label: 'Date opened',  getValue: r => (r.kind === 'case' ? dateBuckets(r.dateOpened) : undefined) },
    { key: 'lastUpdated', label: 'Last updated', getValue: r => (r.kind === 'case' ? dateBuckets(r.lastUpdated) : undefined) },
  ],
  person: [
    { key: 'role',   label: 'Role',   getValue: r => (r.kind === 'person' ? r.role : undefined) },
    { key: 'unit',   label: 'Unit',   getValue: r => (r.kind === 'person' ? r.unit : undefined) },
    { key: 'status', label: 'Status', getValue: r => (r.kind === 'person' ? r.status : undefined) },
  ],
  device: [
    { key: 'deviceType', label: 'Device type', getValue: r => (r.kind === 'device' ? r.deviceType : undefined) },
    { key: 'status',     label: 'Status',      getValue: r => (r.kind === 'device' ? r.status : undefined) },
    { key: 'assignedTo', label: 'Assigned to', getValue: r => (r.kind === 'device' ? r.assignedTo : undefined) },
  ],
  setting: [
    sectionFacet,
    { key: 'subsection', label: 'Category', getValue: r => (r.kind === 'setting' ? r.subsection : undefined) },
  ],
  capability: [
    sectionFacet,
    { key: 'enabled', label: 'State', getValue: r => (r.kind === 'capability' ? (r.enabled ? 'Enabled' : 'Disabled') : undefined) },
    { key: 'role',    label: 'Role',  getValue: r => (r.kind === 'capability' ? r.roles : undefined) },
  ],
};

// Normalize a facet value to an array of strings.
function toValues(v: string | string[] | undefined): string[] {
  if (v == null) return [];
  return Array.isArray(v) ? v.filter(Boolean) : [v];
}

// Collect the facet defs for one or more kinds, de-duplicated by key so a
// shared facet (e.g. Section across settings + capabilities) appears once.
function defsFor(kinds: ResultKind[]): FacetDef[] {
  const seen = new Set<string>();
  const defs: FacetDef[] = [];
  for (const k of kinds) {
    for (const def of FILTER_REGISTRY[k]) {
      if (seen.has(def.key)) continue;
      seen.add(def.key);
      defs.push(def);
    }
  }
  return defs;
}

// Build facets (with counted options) for the active kind(s) from the live
// results. Facets with no options are dropped so the bar never shows empty
// dropdowns. Date facets keep their canonical bucket order; others sort by count.
export function buildFacets(results: SearchResult[], active: ResultKind | ResultKind[]): Facet[] {
  const kinds = Array.isArray(active) ? active : [active];
  const kindSet = new Set<ResultKind>(kinds);
  const kindResults = results.filter(r => kindSet.has(r.kind));
  const facets: Facet[] = [];

  for (const def of defsFor(kinds)) {
    const counts = new Map<string, number>();
    for (const r of kindResults) {
      for (const v of toValues(def.getValue(r))) {
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }
    if (counts.size === 0) continue;

    const isDate = def.key === 'date' || def.key === 'dateOpened' || def.key === 'lastUpdated';
    const options: FacetOption[] = [...counts.entries()].map(([value, count]) => ({ value, count }));
    if (isDate) {
      options.sort((a, b) => DATE_BUCKETS.indexOf(a.value) - DATE_BUCKETS.indexOf(b.value));
    } else {
      options.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    }
    facets.push({ key: def.key, label: def.label, options });
  }

  return facets;
}

// True if a facet key applies to a given result kind (i.e. that kind declares
// a def with this key). Used so a capability-only facet like 'State' doesn't
// filter out settings in a mixed admin result set.
function facetAppliesTo(key: string, kind: ResultKind): boolean {
  return FILTER_REGISTRY[kind].some(d => d.key === key);
}

// Apply the current facet selections to results of the active kind(s).
// selections maps facetKey -> chosen values. Results of other kinds pass
// through unchanged; within the active kinds, a facet only governs the kinds
// that declare it (so a shared facet filters both, a kind-specific one filters
// only its own kind).
export function applyFacetFilters(
  results: SearchResult[],
  active: ResultKind | ResultKind[],
  selections: Record<string, Set<string>>
): SearchResult[] {
  const kinds = Array.isArray(active) ? active : [active];
  const kindSet = new Set<ResultKind>(kinds);
  const activeDefs = defsFor(kinds).filter(d => (selections[d.key]?.size ?? 0) > 0);
  if (activeDefs.length === 0) return results;

  return results.filter(r => {
    if (!kindSet.has(r.kind)) return true; // facets only govern the active kinds
    return activeDefs.every(def => {
      if (!facetAppliesTo(def.key, r.kind)) return true; // facet N/A to this kind
      const chosen = selections[def.key];
      const values = toValues(def.getValue(r));
      return values.some(v => chosen.has(v));
    });
  });
}
