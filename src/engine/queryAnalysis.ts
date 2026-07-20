import { chatCompletion } from '../utils/openaiClient';
import { FilterChip, EntityResult, ResultKind } from '../data/types';

export interface ExtractedEntities {
  case_ids: string[];
  evidence_ids: string[];
  officers: string[];
  dates: { start: string | null; end: string | null };
  evidence_types: string[];
  locations: string[];
  objects: Array<{ label: string; color?: string }>;
  keywords: string[];
  categories: string[];
}

export interface QueryAnalysis {
  intent: 'lookup' | 'investigation' | 'comparison' | 'timeline' | 'relationship' | 'object_search';
  entities: ExtractedEntities;
  reformulated_query: string;
  search_strategy: string;
  // Which omni-search result kinds the query is likely targeting. Used only to
  // rank/boost sections — never to hard-exclude — so omni search stays broad.
  target_kinds?: ResultKind[];
}

// Keyword heuristic for the target kinds a query is aiming at. Runs locally so
// it works with or without an LLM key; LLM output (when present) is merged in.
export function inferTargetKinds(query: string): ResultKind[] {
  const q = query.toLowerCase();
  const kinds = new Set<ResultKind>();

  const has = (...words: string[]) => words.some(w => q.includes(w));

  if (has('setting', 'settings', 'retention', 'policy', 'policies', 'sso', 'saml', 'mfa', 'audit', 'integration', 'configure', 'configuration', 'admin')) kinds.add('setting');
  if (has('permission', 'permissions', 'capability', 'capabilities', 'can ', 'allowed', 'access to', 'role', 'roles', 'redact', 'facial', 'watchlist')) kinds.add('capability');
  if (has('who', 'user', 'users', 'officer', 'person', 'people', 'detective', 'sergeant', 'assigned to', 'contact')) kinds.add('person');
  if (has('device', 'devices', 'camera', 'body cam', 'body-worn', 'body worn', 'taser', 'fleet', 'alpr', 'serial')) kinds.add('device');
  if (has('case', 'cases', 'investigation', 'incident')) kinds.add('case');
  if (has('evidence', 'video', 'photo', 'image', 'footage', 'document', 'report', 'recording', 'clip')) kinds.add('evidence');

  return [...kinds];
}

const SYSTEM_PROMPT = `You are an evidence search query analyzer for a law enforcement evidence management system.
Extract structured intent and entities from natural language search queries.
Today's date is ${new Date().toISOString().split('T')[0]}.

Return ONLY valid JSON with this exact structure (no markdown, no backticks):
{
  "intent": "lookup | investigation | comparison | timeline | relationship | object_search",
  "entities": {
    "case_ids": [],
    "evidence_ids": [],
    "officers": [],
    "dates": { "start": "YYYY-MM-DD or null", "end": "YYYY-MM-DD or null" },
    "evidence_types": [],
    "locations": [],
    "objects": [{ "label": "...", "color": "..." }],
    "keywords": [],
    "categories": []
  },
  "reformulated_query": "Clear, precise restatement of what the user wants",
  "search_strategy": "Brief description of how to search",
  "target_kinds": ["evidence | case | person | device | setting | capability"]
}

target_kinds: which kinds of records the user is looking for. "who can delete evidence" → ["capability","person"]; "retention policy" → ["setting"]; "facial match settings" → ["setting","capability"]; "body camera footage" → ["evidence","device"]. For pure settings/permissions/admin queries (configuring a policy, a capability, "... settings"), return ONLY ["setting"] and/or ["capability"] — do NOT include "evidence" or "case". Otherwise include "evidence" whenever media/files could be relevant.

Evidence types: video, audio, image, document, pdf, other
Categories: Assault, Traffic Stop, Homicide, Theft, Shooting, Domestic, Drug Offense, Burglary, Police Event, Non Event, Other
Date phrases: "last week" = past 7 days, "last month" = past 30 days, "today" = today only, etc.

IMPORTANT rules:
- evidence_ids: alphanumeric IDs that look like evidence item identifiers (e.g. "EV-80823F7N", "Ev 80823f7n", "80823F7N"). Normalize to uppercase, strip non-alphanumeric chars.
- officers: ONLY named individuals (e.g. "Officer Johnson", "Martinez"). Role descriptions like "first officer on scene", "responding officer", "lead detective" are NOT officer names — put their key words in keywords instead.
- keywords: catch-all for meaningful terms that don't fit other entity types, including role descriptions, document types, descriptive phrases.`;

export async function analyzeQuery(query: string): Promise<QueryAnalysis> {
  const raw = await chatCompletion(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query },
    ],
    { model: 'gpt-4o-mini', temperature: 0, max_tokens: 600 }
  );

  try {
    const parsed = JSON.parse(raw) as QueryAnalysis;
    // Merge the LLM's target kinds with the local heuristic so we never miss an
    // obvious kind (e.g. a "settings" match) the model didn't flag.
    parsed.target_kinds = [...new Set([...(parsed.target_kinds ?? []), ...inferTargetKinds(query)])];
    return parsed;
  } catch {
    // Fallback: basic keyword analysis without API
    return fallbackAnalysis(query);
  }
}

function fallbackAnalysis(query: string): QueryAnalysis {
  const lower = query.toLowerCase();
  const categories: string[] = [];
  const evidence_types: string[] = [];
  const officers: string[] = [];
  const evidence_ids: string[] = [];

  // Detect evidence ID patterns: "EV-XXXXXXXX", "EV XXXXXXXX", bare alphanumeric 6-10 chars
  const evIdMatch = query.match(/\bev[-\s]?([a-z0-9]{6,10})\b/i);
  if (evIdMatch) evidence_ids.push('EV' + evIdMatch[1].toUpperCase());

  if (lower.includes('assault')) categories.push('Assault');
  if (lower.includes('traffic stop')) categories.push('Traffic Stop');
  if (lower.includes('homicide')) categories.push('Homicide');
  if (lower.includes('theft')) categories.push('Theft');
  if (lower.includes('video') || lower.includes('body cam') || lower.includes('footage')) evidence_types.push('video');
  if (lower.includes('image') || lower.includes('photo')) evidence_types.push('image');
  if (lower.includes('document') || lower.includes('report')) evidence_types.push('document');

  const officerMatch = query.match(/officer\s+(\d+)/i);
  if (officerMatch) officers.push(`Officer ${officerMatch[1]}`);

  return {
    intent: 'lookup',
    entities: {
      case_ids: [],
      evidence_ids,
      officers,
      dates: { start: null, end: null },
      evidence_types,
      locations: [],
      objects: [],
      keywords: query.split(' ').filter(w => w.length > 3),
      categories,
    },
    reformulated_query: query,
    search_strategy: 'Keyword match across title, description, category',
    target_kinds: inferTargetKinds(query),
  };
}

export function buildFilterChips(analysis: QueryAnalysis): FilterChip[] {
  const chips: FilterChip[] = [];

  for (const officer of analysis.entities.officers) {
    chips.push({ id: `officer:${officer}`, type: 'officer', label: officer, value: officer });
  }

  const { start, end } = analysis.entities.dates;
  if (start || end) {
    const label = buildDateLabel(start, end);
    chips.push({ id: 'date:range', type: 'date', label, value: `${start ?? ''}:${end ?? ''}` });
  }

  for (const type of analysis.entities.evidence_types) {
    chips.push({ id: `type:${type}`, type: 'file_type', label: capitalize(type), value: type });
  }

  for (const category of analysis.entities.categories) {
    chips.push({ id: `category:${category}`, type: 'category', label: category, value: category });
  }

  for (const caseId of analysis.entities.case_ids) {
    chips.push({ id: `case:${caseId}`, type: 'case', label: `Case ${caseId}`, value: caseId });
  }

  for (const location of analysis.entities.locations) {
    chips.push({ id: `location:${location}`, type: 'location', label: location, value: location });
  }

  for (const obj of analysis.entities.objects) {
    const label = obj.color ? `${capitalize(obj.color)} ${obj.label}` : capitalize(obj.label);
    chips.push({ id: `object:${obj.label}`, type: 'object', label, value: obj.label });
  }

  return chips;
}

export function buildEntityResults(analysis: QueryAnalysis): EntityResult[] {
  const entities: EntityResult[] = [];

  for (const officer of analysis.entities.officers) {
    const idMatch = officer.match(/(\d+)/);
    entities.push({
      type: 'officer',
      id: officer,
      name: officer,
      subtitle: idMatch ? `Officer ${idMatch[1]}` : 'Officer',
    });
  }

  for (const caseId of analysis.entities.case_ids) {
    const displayId = caseId.replace(/^case\s*/i, '');
    entities.push({
      type: 'case',
      id: caseId,
      name: displayId,
      subtitle: 'Case',
    });
  }

  return entities;
}

function buildDateLabel(start: string | null, end: string | null): string {
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  if (start === sevenDaysAgo && end === today) return 'Last 7 days';
  if (start === thirtyDaysAgo && end === today) return 'Last 30 days';
  if (start && !end) return `After ${start}`;
  if (!start && end) return `Before ${end}`;
  if (start && end) return `${start} – ${end}`;
  return 'Date range';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
