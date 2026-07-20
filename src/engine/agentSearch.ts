import { SearchOutput, SearchEvidenceResult, GraphNode } from '../data/types';
import { getOpenAIKey } from '../utils/openaiClient';
import { getContextGraph, getVectorStoreId, setVectorStoreId, updateGraphNode } from '../storage/config';
import { analyzeQuery, buildFilterChips, buildEntityResults, inferTargetKinds } from './queryAnalysis';
import { scopeGraph } from './graphScope';
import { synthesizeSummary } from './synthesis';
import { toEvidenceResult, runCatalogProviders, orderByTargetKinds, isAdminIntent, buildAdminSummary, ADMIN_KINDS, policySettingResults } from './providers';
import { resolveNodeLocation } from '../lib/geo';
import { findContentMatches } from '../lib/pdfTextIndex';
import { isPolicyQuestion, answerPolicyQuestion } from './policyAnswer';
import { createVectorStore, chatCompletion } from '../utils/openaiClient';

/**
 * Generates a description for a graph node using its metadata, then persists it
 * to the graph so no future LLM call is needed.
 */
export async function generateAndSaveDescription(nodeId: string): Promise<string | null> {
  const graph = getContextGraph();
  const node = graph.nodes[nodeId];
  if (!node) return null;
  if (node.description) return node.description; // already have one

  const key = getOpenAIKey();
  if (!key) return null;

  const objectsList = node.objects_detected?.length
    ? node.objects_detected.map(o => `${o.color ? o.color + ' ' : ''}${o.label}`).join(', ')
    : null;

  const contextLines = [
    `Title: ${node.title}`,
    `Type: ${node.media_class}`,
    `Category: ${node.category}`,
    `Officer: ${node.officer}`,
    `Case: ${node.case_id}`,
    node.date_recorded ? `Date: ${node.date_recorded}` : null,
    node.scene_type ? `Scene: ${node.scene_type}` : null,
    node.lighting ? `Lighting: ${node.lighting}` : null,
    node.people_count != null ? `People visible: ${node.people_count}` : null,
    node.text_visible ? `Text visible: ${node.text_visible}` : null,
    objectsList ? `Objects detected: ${objectsList}` : null,
    node.source ? `Source: ${node.source}` : null,
  ].filter(Boolean).join('\n');

  try {
    const description = await chatCompletion([
      {
        role: 'system',
        content: 'You write concise 1–2 sentence descriptions for police evidence items based on metadata. Be factual and specific. Do not invent details not present in the metadata.',
      },
      {
        role: 'user',
        content: `Write a brief description for this evidence item:\n\n${contextLines}`,
      },
    ], { model: 'gpt-4o-mini', max_tokens: 120 });

    const trimmed = description.trim();
    if (trimmed) updateGraphNode(nodeId, { description: trimmed });
    return trimmed || null;
  } catch {
    return null;
  }
}

export type SearchStep = 'analyzing' | 'scoping' | 'retrieving' | 'synthesizing' | 'done';

export async function agentSearch(
  query: string,
  onProgress?: (step: SearchStep) => void,
  onPartialResults?: (results: SearchEvidenceResult[]) => void
): Promise<SearchOutput> {
  const graph = getContextGraph();
  const hasNodes = Object.keys(graph.nodes).length > 0;
  const hasKey = !!getOpenAIKey();

  // Without an API key, do local-only keyword search
  if (!hasKey) {
    return localSearch(query, graph);
  }

  // Ensure vector store exists on first run
  await ensureInfrastructure();

  // Phase 1: Analyze query (~1-2s)
  onProgress?.('analyzing');
  const analysis = await analyzeQuery(query);
  const chips = buildFilterChips(analysis);

  // A natural-language policy / procedure / legal question — answer it directly
  // with an AI overview and surface the settings for viewing/updating written
  // department policy (the policy manual, acknowledgements) rather than running
  // an evidence lookup.
  if (isPolicyQuestion(query)) {
    const aiOverview = await answerPolicyQuestion(query);
    const omniResults = policySettingResults(query);
    const suggestions = omniResults
      .filter((r): r is Extract<typeof omniResults[number], { kind: 'setting' }> => r.kind === 'setting')
      .slice(0, 3)
      .map(s => `Update ${s.title.toLowerCase()}`);
    onProgress?.('done');
    return {
      summary: aiOverview,
      aiOverview,
      results: [],
      omniResults,
      entities: [],
      chips,
      suggestions,
      graph_context: { cases_involved: [], total_scoped: 0, total_matched: omniResults.length },
    };
  }

  // Admin/settings/permissions intent — return only settings & capabilities
  // (no evidence, no cases) and a settings-oriented overview.
  if (isAdminIntent(analysis.target_kinds)) {
    const catalog = runCatalogProviders(query, graph, analysis).filter(r => ADMIN_KINDS.includes(r.kind));
    const omniResults = orderByTargetKinds(catalog, analysis.target_kinds);
    const { summary, suggestions } = buildAdminSummary(omniResults);
    onProgress?.('done');
    return {
      summary,
      results: [],
      omniResults,
      entities: [],
      chips,
      suggestions,
      graph_context: { cases_involved: [], total_scoped: 0, total_matched: omniResults.length },
    };
  }

  // Phase 1b: Scope graph (instant — pure local)
  onProgress?.('scoping');
  console.log('[search] analysis:', JSON.stringify(analysis, null, 2));
  const scopedNodes = hasNodes ? scopeGraph(graph, analysis, query) : [];
  console.log('[search] scopedNodes count:', scopedNodes.length);

  // Augment metadata matches with PDF full-text matches (addresses, names, and
  // statements that live only inside the documents), appended after the
  // metadata hits.
  const { nodes: contentNodes, snippets } = hasNodes
    ? await contentMatchNodes(query, graph, new Set(scopedNodes.map(n => n.id)))
    : { nodes: [] as GraphNode[], snippets: new Map<string, string>() };
  const allNodes = [...scopedNodes, ...contentNodes];
  console.log('[search] contentNodes count:', contentNodes.length);

  const caseIds = [...new Set(allNodes.map(n => n.case_id))];
  const entities = buildEntityResults(analysis);

  // Immediately emit all results — no LLM synthesis needed for the result list
  const immediateResults = allNodes.map(n => nodeToResultWithSnippet(n, snippets));
  onPartialResults?.(immediateResults);

  // Omni results: evidence (boxed) + every catalog provider, ordered so the
  // kinds the query targets surface first.
  const omniResults = orderByTargetKinds(
    [...immediateResults.map(toEvidenceResult), ...runCatalogProviders(query, graph, analysis)],
    analysis.target_kinds
  );

  // Phase 2: Small LLM call for summary + suggestions only (~200 output tokens)
  onProgress?.('synthesizing');
  const { summary, suggestions } = await synthesizeSummary(analysis, allNodes);

  onProgress?.('done');

  return {
    summary,
    results: immediateResults,
    omniResults,
    entities,
    chips,
    suggestions,
    graph_context: {
      cases_involved: caseIds,
      total_scoped: allNodes.length,
      total_matched: immediateResults.length,
    },
  };
}

// Convert a graph node to a search result (no LLM needed)
function nodeToResult(n: GraphNode): SearchEvidenceResult {
  return {
    evidence_id: n.id,
    title: n.title,
    media_class: n.media_class,
    case_id: n.case_id,
    officer: n.officer,
    category: n.category,
    excerpt: n.description,
    relevance: '',
    confidence: 'medium' as const,
    thumbnailUrl: n.thumbnailUrl,
    fileUrl: n.fileUrl,
    date_recorded: n.date_recorded,
    source: n.source,
    location: resolveNodeLocation(getContextGraph(), n.case_id, n.id),
  };
}

/**
 * Full-text matches from PDF bodies. Returns evidence results for nodes whose
 * document text contains the query — content that lives only inside the PDFs
 * (addresses, names, statements) and never in the graph metadata. Any node
 * already surfaced by metadata scoping is skipped (via `excludeIds`); the rest
 * carry a snippet of the matched text as their excerpt.
 */
async function contentMatchNodes(
  query: string,
  graph: ReturnType<typeof getContextGraph>,
  excludeIds: Set<string>,
): Promise<{ nodes: GraphNode[]; snippets: Map<string, string> }> {
  const matches = await findContentMatches(query);
  const snippets = new Map<string, string>();
  if (matches.size === 0) return { nodes: [], snippets };
  const nodes = Object.values(graph.nodes).filter(
    n => n.fileUrl && matches.has(n.fileUrl) && !excludeIds.has(n.id),
  );
  for (const n of nodes) {
    const snippet = n.fileUrl ? matches.get(n.fileUrl) : undefined;
    if (snippet) snippets.set(n.id, snippet);
  }
  return { nodes, snippets };
}

// Maps a node to a result, using a PDF text snippet as the excerpt/relevance
// when one is available (content-only matches have no metadata description).
function nodeToResultWithSnippet(n: GraphNode, snippets: Map<string, string>): SearchEvidenceResult {
  const r = nodeToResult(n);
  const snippet = snippets.get(n.id);
  return snippet ? { ...r, excerpt: snippet, relevance: snippet } : r;
}

/**
 * Reverse image search — returns visually similar evidence for an uploaded
 * image. There is no real vision model in this prototype, so we surface
 * image-class evidence from the graph as the set of visual matches. Runs
 * entirely locally and needs no API key.
 */
export function reverseImageSearch(): SearchOutput {
  const graph = getContextGraph();
  const imageNodes = Object.values(graph.nodes).filter(n => n.media_class === 'image');

  const results = imageNodes.map(nodeToResult);
  const omniResults = results.map(toEvidenceResult);
  const caseIds = [...new Set(imageNodes.map(n => n.case_id).filter(Boolean))];

  return {
    summary: results.length > 0 ? `Found ${results.length} visually similar items` : '',
    results,
    omniResults,
    entities: [],
    chips: [],
    suggestions: [],
    graph_context: {
      cases_involved: caseIds,
      total_scoped: imageNodes.length,
      total_matched: results.length,
    },
  };
}

// Local-only search (no OpenAI key)
async function localSearch(query: string, graph: ReturnType<typeof getContextGraph>): Promise<SearchOutput> {
  const targetKinds = inferTargetKinds(query);

  // Admin/settings/permissions intent — settings & capabilities only.
  if (isAdminIntent(targetKinds)) {
    const catalog = runCatalogProviders(query, graph).filter(r => ADMIN_KINDS.includes(r.kind));
    const omniResults = orderByTargetKinds(catalog, targetKinds);
    const { summary, suggestions } = buildAdminSummary(omniResults);
    return {
      summary,
      results: [],
      omniResults,
      entities: [],
      chips: [],
      suggestions,
      graph_context: { cases_involved: [], total_scoped: 0, total_matched: omniResults.length },
    };
  }

  const lower = query.toLowerCase();
  const nodes = Object.values(graph.nodes);

  const matched = nodes.filter(n => {
    const loc = graph.cases[n.case_id]?.location;
    return (
      n.id.toLowerCase().includes(lower) ||
      n.title.toLowerCase().includes(lower) ||
      (n.description ?? '').toLowerCase().includes(lower) ||
      n.category.toLowerCase().includes(lower) ||
      n.officer.toLowerCase().includes(lower) ||
      n.case_id.toLowerCase().includes(lower) ||
      (loc?.label ?? '').toLowerCase().includes(lower) ||
      (loc?.district ?? '').toLowerCase().includes(lower)
    );
  });

  // Augment with PDF full-text matches (content that lives only in the docs).
  const { nodes: contentNodes, snippets } = await contentMatchNodes(
    query, graph, new Set(matched.map(n => n.id)),
  );
  const allMatched = [...matched, ...contentNodes];

  const uniqueCaseIds = [...new Set(allMatched.map(n => n.case_id).filter(Boolean))];
  const uniqueOfficers = [...new Set(allMatched.map(n => n.officer).filter(Boolean))];

  const entities = buildEntityResults({
    intent: 'lookup',
    entities: {
      case_ids: uniqueCaseIds,
      officers: uniqueOfficers,
      dates: { start: null, end: null },
      evidence_types: [],
      locations: [],
      objects: [],
      keywords: query.split(' ').filter(w => w.length > 2),
      categories: [],
    },
    reformulated_query: query,
    search_strategy: 'local keyword match',
  });

  const evidenceResults = allMatched.map(n => nodeToResultWithSnippet(n, snippets));
  const omniResults = orderByTargetKinds(
    [...evidenceResults.map(toEvidenceResult), ...runCatalogProviders(query, graph)],
    inferTargetKinds(query)
  );

  return {
    summary: allMatched.length > 0 ? `Found ${allMatched.length} matching items` : '',
    results: evidenceResults,
    omniResults,
    entities,
    chips: [],
    suggestions: [],
    graph_context: {
      cases_involved: [...new Set(allMatched.map(n => n.case_id))],
      total_scoped: nodes.length,
      total_matched: allMatched.length,
    },
  };
}

// Ensure vector store exists on first run
async function ensureInfrastructure(): Promise<void> {
  let storeId = getVectorStoreId();
  if (!storeId) {
    try {
      storeId = await createVectorStore('Evidence Search Store');
      setVectorStoreId(storeId);
    } catch (err) {
      console.warn('Could not create vector store:', err);
    }
  }
}
