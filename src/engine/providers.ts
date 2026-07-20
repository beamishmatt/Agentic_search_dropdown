// Omni-search providers. Each provider takes the query (and optional analysis)
// and returns typed SearchResults for one entity kind. agentSearch runs them all
// and merges the output into SearchOutput.omniResults. Evidence is handled
// separately (it reuses the graph scope pipeline) and boxed via toEvidenceResult.

import {
  SearchResult,
  SearchEvidenceResult,
  EvidenceResult,
  CaseResult,
  PersonResult,
  DeviceResult,
  SettingResult,
  CapabilityResult,
  ResultKind,
  ContextGraph,
} from '../data/types';
import { QueryAnalysis } from './queryAnalysis';
import { getContextGraph } from '../storage/config';
import { resolveNodeLocation } from '../lib/geo';
import { mockPeople } from '../data/mockPeople';
import { mockDevices } from '../data/mockDevices';
import { mockSettings } from '../data/mockSettings';
import { mockCapabilities } from '../data/mockCapabilities';
import { mockCases } from '../data/mockCases';

// ─── Query term helper ────────────────────────────────────────────────────────

const STOP = new Set([
  'the', 'and', 'for', 'who', 'can', 'has', 'have', 'with', 'what', 'which', 'are', 'was',
  'all', 'any', 'to', 'of', 'in', 'on', 'a', 'an', 'is', 'do', 'does',
  // Pronouns / possessives — filler that also causes substring false positives
  // (e.g. "our" inside "your").
  'our', 'your', 'my', 'their', 'his', 'her', 'its', 'we', 'us', 'you', 'they',
  'someone', 'somebody', 'anyone', 'them', 'i',
  // Generic admin-nav words that would otherwise match every section label.
  'setting', 'settings', 'management',
]);

function terms(query: string): string[] {
  return query.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1 && !STOP.has(t));
}

// True when every query term appears in the haystack (tokenized AND). Requiring
// all terms — not just one — keeps multi-word queries from matching on a single
// coincidental substring hit (e.g. "red shirt" shouldn't match "Redaction" just
// because "red" is a substring of it; "shirt" has to be found too).
function matches(haystack: string, ts: string[]): boolean {
  const h = haystack.toLowerCase();
  return ts.every(t => h.includes(t));
}

// Filler words that don't change a "list this kind" intent.
const TYPE_FILLER = new Set(['all', 'show', 'me', 'my', 'list', 'the', 'a', 'an', 'any', 'view', 'find', 'see', 'of']);

// True when the query is essentially just the name of an entity kind
// ("cases", "all people", "show devices") — a request to list that kind
// rather than search within it. Every meaningful word must be a type synonym.
// Uses the raw query (not the stopword-filtered terms) so type names that are
// themselves stopwords — "settings", "management" — still register.
function isTypeIntent(query: string, synonyms: string[]): boolean {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1 && !TYPE_FILLER.has(w));
  return words.length > 0 && words.every(w => synonyms.includes(w));
}

// ─── Evidence (boxing helper — scoping happens in agentSearch/scopeGraph) ──────

export function toEvidenceResult(e: SearchEvidenceResult): EvidenceResult {
  // Resolve the node's incident location (from its case) so results carry a
  // meaningful map position. Keep any location already set on the result.
  const location = e.location ?? resolveNodeLocation(getContextGraph(), e.case_id, e.evidence_id);
  const evidence = location ? { ...e, location } : e;
  return {
    kind: 'evidence',
    id: e.evidence_id,
    title: e.title,
    subtitle: e.category,
    relevance: e.relevance,
    deeplink: `/evidence/${e.evidence_id}`,
    evidence,
  };
}

// ─── Case provider ─────────────────────────────────────────────────────────────

export function caseProvider(query: string, graph: ContextGraph, analysis?: QueryAnalysis): CaseResult[] {
  const ts = terms(query);
  const listAll = isTypeIntent(query, ['case', 'cases']);
  const caseIds = new Set<string>(analysis?.entities.case_ids ?? []);
  return Object.entries(graph.cases)
    .filter(([id, c]) => {
      if (listAll) return true;
      if (caseIds.size > 0 && [...caseIds].some(q => id.toLowerCase().includes(q.toLowerCase()))) return true;
      if (ts.length === 0) return false;
      // Include the catalog owner/access-class so those are searchable too.
      const meta = mockCases.find(m => m.caseId === id);
      return matches(`${id} ${c.title} ${c.status} ${c.lead_officer} ${meta?.owner ?? ''} ${meta?.accessClass ?? ''}`, ts);
    })
    .map(([id, c]) => {
      const meta = mockCases.find(m => m.caseId === id);
      // Owner is stored as "Last, First (login)" — show a clean display name.
      const owner = meta?.owner?.replace(/\s*\([^)]*\)\s*$/, '') ?? c.lead_officer;
      return {
        kind: 'case' as const,
        id,
        title: c.title || id,
        subtitle: `${c.status} · ${c.evidence_ids.length} items`,
        relevance: '',
        deeplink: `/cases/${id}`,
        status: meta?.status ?? c.status,
        owner,
        accessClass: meta?.accessClass ?? 'Unrestricted',
        leadOfficer: c.lead_officer,
        dateOpened: meta?.createdOn ? meta.createdOn.toISOString() : c.date_opened,
        lastUpdated: meta?.lastUpdatedOn ? meta.lastUpdatedOn.toISOString() : undefined,
        evidenceCount: c.evidence_ids.length,
      };
    });
}

// ─── People provider ────────────────────────────────────────────────────────────

export function peopleProvider(query: string): PersonResult[] {
  const ts = terms(query);
  const listAll = isTypeIntent(query, ['person', 'people', 'user', 'users']);
  if (ts.length === 0 && !listAll) return [];
  return mockPeople
    .filter(p => listAll || matches(`${p.name} ${p.role} ${p.unit ?? ''} ${p.email}`, ts))
    .map(p => ({
      kind: 'person' as const,
      id: p.id,
      title: p.name,
      subtitle: [p.role, p.unit].filter(Boolean).join(' · '),
      relevance: '',
      deeplink: `/settings/users/${p.id}`,
      role: p.role,
      unit: p.unit,
      status: p.status,
      email: p.email,
    }));
}

// ─── Device provider ─────────────────────────────────────────────────────────────

export function deviceProvider(query: string): DeviceResult[] {
  const ts = terms(query);
  const listAll = isTypeIntent(query, ['device', 'devices']);
  if (ts.length === 0 && !listAll) return [];
  return mockDevices
    .filter(d => listAll || matches(`${d.name} ${d.deviceType} ${d.assignedTo ?? ''} ${d.serial}`, ts))
    .map(d => ({
      kind: 'device' as const,
      id: d.id,
      title: d.name,
      subtitle: [d.deviceType, d.assignedTo].filter(Boolean).join(' · '),
      relevance: '',
      deeplink: `/settings/devices/${d.id}`,
      deviceType: d.deviceType,
      assignedTo: d.assignedTo,
      status: d.status,
      lastSeen: d.lastSeen,
    }));
}

// ─── Settings provider ───────────────────────────────────────────────────────────

export function settingProvider(query: string): SettingResult[] {
  const ts = terms(query);
  const listAll = isTypeIntent(query, ['setting', 'settings']);
  if (ts.length === 0 && !listAll) return [];
  return mockSettings
    .filter(s => listAll || matches(`${s.title} ${s.subsection} ${s.description} ${s.keywords.join(' ')}`, ts))
    .map(s => ({
      kind: 'setting' as const,
      id: s.id,
      title: s.title,
      subtitle: `${s.section} · ${s.subsection}`,
      relevance: '',
      deeplink: s.deeplink,
      section: s.section,
      subsection: s.subsection,
      description: s.description,
    }));
}

// Settings relevant to a policy / procedure question. Always surfaces the
// policy-governance destinations (the policy manual, acknowledgements), plus
// any setting whose specific topic the question names (e.g. "retention policy"
// → Evidence retention policies). The generic framing words the question is
// phrased with ("policy", "procedure") are dropped so they don't drag in
// unrelated settings that merely mention the word (e.g. "Device policies").
const POLICY_FRAMING = new Set(['policy', 'policies', 'procedure', 'procedures', 'procedural', 'protocol', 'protocols', 'rule', 'rules']);

export function policySettingResults(query: string): SettingResult[] {
  const topicTerms = terms(query).filter(t => !POLICY_FRAMING.has(t));
  const toResult = (s: typeof mockSettings[number]): SettingResult => ({
    kind: 'setting',
    id: s.id,
    title: s.title,
    subtitle: `${s.section} · ${s.subsection}`,
    relevance: '',
    deeplink: s.deeplink,
    section: s.section,
    subsection: s.subsection,
    description: s.description,
  });
  const governance = mockSettings.filter(s => s.policyGuidance);
  const topical = topicTerms.length === 0 ? [] : mockSettings.filter(s =>
    !s.policyGuidance &&
    matches(`${s.title} ${s.subsection} ${s.description} ${s.keywords.join(' ')}`, topicTerms)
  );
  return [...governance, ...topical].map(toResult);
}

// ─── Capability provider ─────────────────────────────────────────────────────────

export function capabilityProvider(query: string): CapabilityResult[] {
  const ts = terms(query);
  const listAll = isTypeIntent(query, ['capability', 'capabilities', 'permission', 'permissions']);
  if (ts.length === 0 && !listAll) return [];
  return mockCapabilities
    // Match only curated fields (title/roles/keywords). The free-text description
    // is prose — matching it surfaces false positives (e.g. "faces"/"video"/
    // "evidence" in Redaction's description matching visual-attribute searches).
    .filter(c => listAll || matches(`${c.title} ${c.roles.join(' ')} ${c.keywords.join(' ')}`, ts))
    .map(c => ({
      kind: 'capability' as const,
      id: c.id,
      title: c.title,
      subtitle: `${c.section} · ${c.enabled ? 'Enabled' : 'Disabled'}`,
      relevance: '',
      deeplink: `/admin/users/roles#${c.id}`,
      section: c.section,
      roles: c.roles,
      enabled: c.enabled,
      description: c.description,
    }));
}

// ─── Orchestration ───────────────────────────────────────────────────────────────

const DEFAULT_KIND_ORDER: ResultKind[] = ['evidence', 'case', 'person', 'device', 'setting', 'capability'];

// Kinds that make up an "admin / configuration" answer. When the query is an
// admin-intent query we restrict results to these and drop evidence + cases.
export const ADMIN_KINDS: ResultKind[] = ['setting', 'capability', 'person', 'device'];

// An admin/settings/permissions query — the user wants to find or change a
// setting or capability, not retrieve evidence. True when the query targets
// settings/capabilities and does NOT mention evidence or cases.
export function isAdminIntent(targetKinds?: ResultKind[]): boolean {
  if (!targetKinds || targetKinds.length === 0) return false;
  const has = (k: ResultKind) => targetKinds.includes(k);
  return (has('setting') || has('capability')) && !has('evidence') && !has('case');
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

// A settings-oriented overview + actionable suggestions for admin-intent
// queries. Suggestions are phrased as instructions the user can hand to the
// Assistant to actually make the change. Deterministic (no LLM needed).
export function buildAdminSummary(results: SearchResult[]): { summary: string; suggestions: string[] } {
  const caps = results.filter((r): r is CapabilityResult => r.kind === 'capability');
  const sets = results.filter((r): r is SettingResult => r.kind === 'setting');

  const parts: string[] = [];
  const suggestions: string[] = [];

  for (const c of caps.slice(0, 2)) {
    parts.push(`the “${c.title}” capability (currently ${c.enabled ? 'enabled' : 'disabled'})`);
    suggestions.push(c.enabled ? `Review who can use “${c.title}”` : `Enable the “${c.title}” capability`);
  }
  for (const s of sets.slice(0, 2)) {
    parts.push(`the “${s.title}” setting`);
    suggestions.push(`Update ${s.title.toLowerCase()}`);
  }

  const summary = parts.length
    ? `This looks like a settings and permissions request. It matches ${joinList(parts)}. Ask the Assistant to review or change these for you.`
    : `This looks like a settings and permissions request, but no matching admin settings were found.`;

  return { summary, suggestions: suggestions.slice(0, 3) };
}

// Build non-evidence results from all catalog providers.
export function runCatalogProviders(query: string, graph: ContextGraph, analysis?: QueryAnalysis): SearchResult[] {
  return [
    ...caseProvider(query, graph, analysis),
    ...peopleProvider(query),
    ...deviceProvider(query),
    ...settingProvider(query),
    ...capabilityProvider(query),
  ];
}

// Order results so the kinds the query targets surface first. Grouping in the UI
// derives its section order from the order kinds first appear here.
export function orderByTargetKinds(results: SearchResult[], targetKinds?: ResultKind[]): SearchResult[] {
  const priority = [...(targetKinds ?? []), ...DEFAULT_KIND_ORDER];
  const rank = (k: ResultKind) => {
    const i = priority.indexOf(k);
    return i === -1 ? DEFAULT_KIND_ORDER.length : i;
  };
  return [...results].sort((a, b) => rank(a.kind) - rank(b.kind));
}
