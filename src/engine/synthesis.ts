import { chatCompletion, chatCompletionStream } from '../utils/openaiClient';
import { GraphNode, SearchEvidenceResult, SearchOutput, EntityResult } from '../data/types';
import { VectorResult } from './vectorRetrieval';
import { QueryAnalysis, buildEntityResults } from './queryAnalysis';

const SYNTHESIS_SYSTEM = `You are an evidence search result synthesizer for a law enforcement evidence management system.
Given a search query, candidate evidence nodes from a graph, and vector search results,
produce a ranked, unified list of results with relevance explanations.

Return ONLY valid JSON with this structure (no markdown, no backticks):
{
  "summary": "Brief summary of what was found",
  "results": [
    {
      "evidence_id": "...",
      "title": "...",
      "media_class": "video|audio|image|document|text|pdf",
      "case_id": "...",
      "officer": "...",
      "category": "...",
      "relevance": "One sentence explaining why this matches the query",
      "excerpt": "Copy 1-2 sentences of raw text verbatim from the vector search results. Must be actual file content, not a description. Omit the field entirely if no vector text is available.",
      "confidence": "high|medium|low",
      "related_evidence": []
    }
  ],
  "suggestions": ["Follow-up query suggestion 1", "Follow-up query suggestion 2"]
}

Include ALL provided graph candidates in the results — do not drop any. Rank by relevance but return every node. Keep relevance explanations concise.`;

// Enrich a raw result object with node metadata (thumbnails, dates, etc.)
function enrichResult(r: SearchEvidenceResult, nodeMap: Record<string, GraphNode>): SearchEvidenceResult {
  const node = nodeMap[r.evidence_id];
  return {
    ...r,
    excerpt: r.excerpt || (node?.description ? node.description.slice(0, 200) : undefined),
    thumbnailUrl: node?.thumbnailUrl,
    date_recorded: node?.date_recorded,
    source: node?.source,
  };
}

// Extract all complete JSON objects from the "results" array in a partial buffer.
// Uses brace-counting so it works on incomplete/streaming JSON.
function extractResults(buffer: string): SearchEvidenceResult[] {
  const markerIdx = buffer.indexOf('"results"');
  if (markerIdx === -1) return [];
  const arrStart = buffer.indexOf('[', markerIdx);
  if (arrStart === -1) return [];

  const results: SearchEvidenceResult[] = [];
  let i = arrStart + 1;

  while (i < buffer.length) {
    // Skip whitespace and commas between objects
    while (i < buffer.length && /[\s,]/.test(buffer[i])) i++;
    if (i >= buffer.length || buffer[i] === ']') break;
    if (buffer[i] !== '{') { i++; continue; }

    // Walk forward counting braces to find the end of this object
    let depth = 0;
    let inString = false;
    let escape = false;
    const objStart = i;
    let j = i;

    for (; j < buffer.length; j++) {
      const c = buffer[j];
      if (escape) { escape = false; continue; }
      if (c === '\\' && inString) { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          try { results.push(JSON.parse(buffer.slice(objStart, j + 1)) as SearchEvidenceResult); } catch { /* malformed — skip */ }
          i = j + 1;
          break;
        }
      }
    }

    if (depth !== 0) break; // incomplete object — stop scanning
  }

  return results;
}

export async function synthesizeResults(
  analysis: QueryAnalysis,
  graphNodes: GraphNode[],
  vectorResult: VectorResult | null,
  graph_context: { cases_involved: string[]; total_scoped: number },
  onPartial?: (results: SearchEvidenceResult[]) => void
): Promise<SearchOutput> {
  const entities = buildEntityResults(analysis);

  if (graphNodes.length === 0 && !vectorResult?.text) {
    return emptyOutput(analysis.entities.keywords, entities, graph_context);
  }

  const nodesSummary = graphNodes.slice(0, 30).map(n => ({
    id: n.id,
    title: n.title,
    media_class: n.media_class,
    case_id: n.case_id,
    officer: n.officer,
    category: n.category,
    description: n.description,
    objects_detected: n.objects_detected?.map(o => `${o.color ? o.color + ' ' : ''}${o.make ? o.make + ' ' : ''}${o.model ? o.model + ' ' : ''}${o.label}`).join(', '),
    date_recorded: n.date_recorded,
    thumbnailUrl: n.thumbnailUrl,
  }));

  const userContent = `Query: "${analysis.reformulated_query}"

Graph candidates (${graphNodes.length} nodes):
${JSON.stringify(nodesSummary, null, 2)}

Vector search text (use verbatim excerpts from this for the "excerpt" field):
${vectorResult?.text ?? '(no vector results)'}`;

  const nodeMap = Object.fromEntries(graphNodes.map(n => [n.id, n]));
  let lastEmittedCount = 0;

  const raw = await chatCompletionStream(
    [
      { role: 'system', content: SYNTHESIS_SYSTEM },
      { role: 'user', content: userContent },
    ],
    { temperature: 0.2, max_tokens: 2000 },
    (accumulated) => {
      if (!onPartial) return;
      const rawResults = extractResults(accumulated);
      if (rawResults.length > lastEmittedCount) {
        lastEmittedCount = rawResults.length;
        onPartial(rawResults.map(r => enrichResult(r, nodeMap)));
      }
    }
  );

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    const results: SearchEvidenceResult[] = (parsed.results ?? []).map((r: SearchEvidenceResult) =>
      enrichResult(r, nodeMap)
    );

    // Build entity list from graph nodes too (supplement query-extracted entities)
    // Normalize case IDs to deduplicate variants like "088142", "2025-088142", "PBPD-2025-088142"
    const normalizeCaseId = (id: string) => id.replace(/^.*?(\d{6,})$/, '$1');
    const rawCaseIds = results.map(r => r.case_id).filter(Boolean) as string[];
    // Keep the longest (most specific) ID per normalized base number
    const caseIdByBase = new Map<string, string>();
    for (const id of rawCaseIds) {
      const base = normalizeCaseId(id);
      const existing = caseIdByBase.get(base);
      if (!existing || id.length > existing.length) caseIdByBase.set(base, id);
    }
    const caseIds = [...caseIdByBase.values()];
    const entityBases = new Set(entities.map(e => normalizeCaseId(e.id)));
    const supplementalEntities: EntityResult[] = caseIds
      .filter(id => !entityBases.has(normalizeCaseId(id)))
      .map(id => ({ type: 'case' as const, id, name: id.replace(/^case\s*/i, ''), subtitle: 'Case' }));

    return {
      summary: parsed.summary ?? '',
      results,
      omniResults: [],
      entities: [...entities, ...supplementalEntities],
      chips: [], // chips are built upstream by buildFilterChips
      suggestions: parsed.suggestions ?? [],
      graph_context: {
        ...graph_context,
        total_matched: results.length,
        cases_involved: caseIds,
      },
    };
  } catch (err) {
    console.error('Synthesis parse error. Raw response:', raw, err);
    return emptyOutput(analysis.entities.keywords, entities, graph_context);
  }
}

const SUMMARY_SYSTEM = `You are an evidence search assistant. Given a query and matching evidence items, write a brief one-sentence summary of what was found and suggest 2-3 useful follow-up queries.

Return ONLY valid JSON (no markdown, no backticks):
{"summary": "one sentence summary", "suggestions": ["...", "...", "..."]}`;

export async function synthesizeSummary(
  analysis: QueryAnalysis,
  graphNodes: GraphNode[]
): Promise<{ summary: string; suggestions: string[] }> {
  if (graphNodes.length === 0) {
    return { summary: '', suggestions: [] };
  }

  const nodeList = graphNodes.slice(0, 30).map(n =>
    `"${n.title}" (${n.media_class}, ${n.category}, ${n.officer}, ${n.case_id})`
  ).join('\n');

  try {
    const raw = await chatCompletion(
      [
        { role: 'system', content: SUMMARY_SYSTEM },
        { role: 'user', content: `Query: "${analysis.reformulated_query}"\n\nMatching evidence (${graphNodes.length} items):\n${nodeList}` },
      ],
      { model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 300 }
    );
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      summary: parsed.summary ?? '',
      suggestions: parsed.suggestions ?? [],
    };
  } catch {
    return {
      summary: `Found ${graphNodes.length} matching item${graphNodes.length !== 1 ? 's' : ''}.`,
      suggestions: [],
    };
  }
}

function emptyOutput(
  _keywords: string[],
  entities: EntityResult[],
  graph_context: { cases_involved: string[]; total_scoped: number }
): SearchOutput {
  return {
    summary: '',
    results: [],
    omniResults: [],
    entities,
    chips: [],
    suggestions: [],
    graph_context: { ...graph_context, total_matched: 0 },
  };
}
