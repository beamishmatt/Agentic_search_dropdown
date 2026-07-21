import { ContextGraph, GraphNode } from '../data/types';
import { QueryAnalysis } from './queryAnalysis';
import { labelMatches } from '../lib/objectSynonyms';

export function scopeGraph(graph: ContextGraph, analysis: QueryAnalysis, rawQuery = ''): GraphNode[] {
  const all = Object.values(graph.nodes);
  if (all.length === 0) return [];

  const { entities } = analysis;

  // Evidence ID lookup — normalize both sides and match by prefix, not just
  // exact/suffix, so a partial ID (including a bare "EV-" the user is still
  // typing) surfaces every candidate instead of stopping at the first hit.
  const normalized = new Set((entities.evidence_ids ?? []).map(id => id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()));
  const rawTrimmed = rawQuery.trim();
  // Require the "ev" to be followed by a hyphen/space (not just any word that
  // happens to start with "ev", e.g. "event", "evening", "evidence").
  if (/^ev[-\s]/i.test(rawTrimmed)) {
    normalized.add(rawTrimmed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase());
  }
  if (normalized.size > 0) {
    const matches = all.filter(n => {
      const nid = n.id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return [...normalized].some(q => nid === q || nid.startsWith(q) || nid.endsWith(q) || q.endsWith(nid.replace(/^EV/, '')));
    });
    if (matches.length > 0) return matches;
  }

  const hasEntityFilters =
    entities.evidence_types.length > 0 ||
    entities.officers.length > 0 ||
    entities.case_ids.length > 0 ||
    entities.categories.length > 0 ||
    entities.objects.length > 0 ||
    entities.locations.length > 0 ||
    entities.dates.start ||
    entities.dates.end;

  const terms = queryTerms(analysis);

  // No structured entities extracted — fuzzy match on all query terms
  if (!hasEntityFilters) {
    const terms = queryTerms(analysis);
    if (terms.length === 0) return [];
    return scoredSort(graph, fuzzyMatch(all, terms), analysis, terms, new Set());
  }

  let candidates = [...all];

  // Evidence type — partial match
  if (entities.evidence_types.length > 0) {
    candidates = candidates.filter(n =>
      entities.evidence_types.some(t => n.media_class.includes(t.toLowerCase()))
    );
  }

  // Date range
  if (entities.dates.start) {
    candidates = candidates.filter(n => n.date_recorded >= entities.dates.start!);
  }
  if (entities.dates.end) {
    candidates = candidates.filter(n => n.date_recorded <= entities.dates.end!);
  }

  // Officer — partial match both ways
  if (entities.officers.length > 0) {
    candidates = candidates.filter(n =>
      entities.officers.some(o =>
        n.officer.toLowerCase().includes(o.toLowerCase()) ||
        o.toLowerCase().includes(n.officer.toLowerCase())
      )
    );
  }

  // Case ID — partial match
  if (entities.case_ids.length > 0) {
    candidates = candidates.filter(n =>
      entities.case_ids.some(id =>
        n.case_id.toLowerCase().includes(id.toLowerCase()) ||
        id.toLowerCase().includes(n.case_id.toLowerCase())
      )
    );
  }

  // Category — exact match only (partial match causes false positives with LLM fallback categories)
  if (entities.categories.length > 0) {
    candidates = candidates.filter(n =>
      entities.categories.some(c => n.category.toLowerCase() === c.toLowerCase())
    );
  }

  // Location — a node matches when any searched location term is a substring of
  // its resolved incident location (case place label / district) or scene type.
  if (entities.locations.length > 0) {
    candidates = candidates.filter(n =>
      entities.locations.some(loc => nodeLocationText(graph, n).includes(loc.toLowerCase()))
    );
  }

  // Detected objects — synonym-aware match. Users search generic terms
  // ("car", "gun") while the vision model tags specific ones ("sedan",
  // "handgun"), so match through a hypernym map. Color may live on the
  // detected object or only in the free-text description, so accept either.
  if (entities.objects.length > 0) {
    const objectMatches = candidates.filter(n =>
      entities.objects.some(searchObj => nodeMatchesObject(n, searchObj))
    );
    candidates = objectMatches;
  }

  // If strict filters eliminated everything, fall back to full query terms
  if (candidates.length === 0) {
    const terms = queryTerms(analysis);
    if (terms.length === 0) return [];
    const fallback = fuzzyMatch(all, terms);
    if (fallback.length === 0) return [];
    return scoredSort(graph, fallback, analysis, terms, new Set());
  }

  // Track direct candidates before edge expansion — used for scoring
  const directIds = new Set(candidates.map(n => n.id));

  // Expand via edges — only non-same_case relationships to avoid pulling in entire cases
  const candidateIds = new Set(directIds);
  for (const edge of graph.edges) {
    if (edge.relationship === 'same_case') continue;
    if (candidateIds.has(edge.source)) candidateIds.add(edge.target);
    if (candidateIds.has(edge.target)) candidateIds.add(edge.source);
  }

  const scoped = all.filter(n => candidateIds.has(n.id));
  return scoredSort(graph, scoped, analysis, terms, directIds);
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreNode(graph: ContextGraph, n: GraphNode, analysis: QueryAnalysis, terms: string[], directIds: Set<string>): number {
  let score = 0;
  const { entities } = analysis;

  const titleLower = n.title.toLowerCase();
  const descLower = (n.description ?? '').toLowerCase();

  // Direct filter match (not just edge-expanded)
  if (directIds.has(n.id)) score += 5;

  // Title keyword hits (high signal)
  for (const term of terms) {
    if (titleLower.includes(term)) score += 10;
  }

  // Description keyword hits
  for (const term of terms) {
    if (descLower.includes(term)) score += 3;
  }

  // Structured entity matches
  for (const caseId of entities.case_ids) {
    if (n.case_id.toLowerCase().includes(caseId.toLowerCase()) ||
        caseId.toLowerCase().includes(n.case_id.toLowerCase())) score += 15;
  }
  for (const officer of entities.officers) {
    if (n.officer.toLowerCase().includes(officer.toLowerCase()) ||
        officer.toLowerCase().includes(n.officer.toLowerCase())) score += 12;
  }
  for (const category of entities.categories) {
    if (n.category.toLowerCase().includes(category.toLowerCase())) score += 8;
  }
  for (const type of entities.evidence_types) {
    if (n.media_class.includes(type.toLowerCase())) score += 6;
  }

  // Location matches (case place label / district / scene type)
  const locText = nodeLocationText(graph, n);
  for (const loc of entities.locations) {
    if (locText.includes(loc.toLowerCase())) score += 8;
  }

  // Object detection matches (synonym-aware)
  const descForColor = descLower;
  for (const searchObj of entities.objects) {
    for (const det of (n.objects_detected ?? [])) {
      if (labelMatches(searchObj.label, det.label)) {
        score += 6;
        const color = searchObj.color?.toLowerCase();
        if (color && (det.color?.toLowerCase().includes(color) || descForColor.includes(color))) score += 4;
      }
    }
  }

  return score;
}

function scoredSort(graph: ContextGraph, nodes: GraphNode[], analysis: QueryAnalysis, terms: string[], directIds: Set<string>): GraphNode[] {
  return nodes
    .map(n => ({ node: n, score: scoreNode(graph, n, analysis, terms, directIds), isDirect: directIds.size > 0 && directIds.has(n.id) }))
    .sort((a, b) => {
      // Direct matches always rank above edge-expanded results
      if (a.isDirect !== b.isDirect) return a.isDirect ? -1 : 1;
      return b.score - a.score;
    })
    .map(({ node }) => node);
}

// ─── Location matching ───────────────────────────────────────────────────────

// The searchable location text for a node: its case's incident place label and
// district, plus the node's own scene_type. Lowercased for substring matching.
function nodeLocationText(graph: ContextGraph, n: GraphNode): string {
  const loc = graph.cases[n.case_id]?.location;
  return [loc?.label, loc?.district, n.scene_type].filter(Boolean).join(' ').toLowerCase();
}

// ─── Object matching ─────────────────────────────────────────────────────────

// True if a node contains the searched object: a detected label matches (via
// synonyms) and, when a color is specified, it appears either on the detected
// object or in the node's description.
function nodeMatchesObject(n: GraphNode, searchObj: { label: string; color?: string }): boolean {
  const color = searchObj.color?.toLowerCase();
  const desc = (n.description ?? '').toLowerCase();
  return (n.objects_detected ?? []).some(det =>
    labelMatches(searchObj.label, det.label) &&
    (!color || det.color?.toLowerCase().includes(color) || desc.includes(color))
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Generic terms that appear in query reformulations and boilerplate metadata
// alike ("search for evidence related to…", "This evidence item is…"). Left in,
// they cause the fuzzy fallback to match nearly every record, so they're
// dropped from query terms.
const FILLER_WORDS = new Set([
  'evidence', 'search', 'find', 'show', 'showing', 'related', 'relating', 'item',
  'items', 'containing', 'depicting', 'depicts', 'record', 'records', 'result',
  'results', 'footage', 'file', 'files', 'please', 'need', 'want', 'looking',
]);

const STOP_WORDS = new Set([
  'the', 'and', 'or', 'for', 'not', 'but', 'nor', 'yet', 'so',
  'a', 'an', 'in', 'on', 'at', 'to', 'of', 'up', 'by', 'as',
  'is', 'it', 'its', 'was', 'are', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'with', 'from', 'that', 'this', 'these',
  'those', 'there', 'their', 'they', 'what', 'which', 'who', 'when',
  'where', 'how', 'any', 'all', 'some', 'than', 'then', 'into', 'about',
]);

function queryTerms(analysis: QueryAnalysis): string[] {
  const keep = (w: string) => w.length > 2 && !STOP_WORDS.has(w) && !FILLER_WORDS.has(w);
  return [
    ...analysis.reformulated_query.toLowerCase().split(/\s+/).filter(keep),
    ...analysis.entities.keywords.map(k => k.toLowerCase()).filter(keep),
    // Include searched object labels/colors so fuzzy fallback can still match
    // free-text descriptions ("blue sedan") when structured filters miss.
    ...analysis.entities.objects.flatMap(o => [o.label.toLowerCase(), o.color?.toLowerCase()].filter(Boolean) as string[]),
  ];
}

function fuzzyMatch(nodes: GraphNode[], terms: string[]): GraphNode[] {
  if (terms.length === 0) return [];

  return nodes.filter(n => {
    const haystack = [
      n.id,
      n.title,
      n.description ?? '',
      n.category,
      n.officer,
      n.case_id,
      n.source ?? '',
      ...(n.objects_detected ?? []).flatMap(o => [o.label, o.make, o.model].filter(Boolean) as string[]),
      ...(n.tags ?? []),
    ].join(' ').toLowerCase();

    return terms.some(t => haystack.includes(t));
  });
}
