// Searches graph nodes' visual / metadata attributes (title, description,
// scene_type, lighting, text_visible, tags, and objects_detected entries)
// for the user's query. Used by the "Attributes" navigator in the search
// results page.
//
// Matching is tokenized AND: the query is split into significant words
// (stop-words and 1-char tokens dropped), and a node matches when every
// remaining token appears as a case-insensitive substring of its joined
// attribute string. No per-attribute highlighting is produced — visual
// evidence (images / video frames) has nowhere to host an overlay in v1.

import type { GraphNode } from '../data/types';
import { tokenMatchesText } from './objectSynonyms';

export type AttributeMatch = {
  evidenceId: string;
};

const STOP_WORDS = new Set([
  'the', 'and', 'or', 'for', 'not', 'but', 'nor', 'yet', 'so',
  'a', 'an', 'in', 'on', 'at', 'to', 'of', 'up', 'by', 'as',
  'is', 'it', 'its', 'was', 'are', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'with', 'from', 'that', 'this', 'these',
  'those', 'there', 'their', 'they', 'what', 'which', 'who', 'when',
  'where', 'how', 'any', 'all', 'some', 'than', 'then', 'into', 'about',
]);

function nodeAttributeText(node: GraphNode): string {
  const parts: string[] = [];
  if (node.title) parts.push(node.title);
  if (node.description) parts.push(node.description);
  if (node.scene_type) parts.push(node.scene_type);
  if (node.lighting) parts.push(node.lighting);
  if (node.text_visible) parts.push(node.text_visible);
  if (node.tags?.length) parts.push(node.tags.join(' '));
  if (node.category) parts.push(node.category);
  if (node.objects_detected?.length) {
    for (const obj of node.objects_detected) {
      const segs: string[] = [];
      if (obj.color) segs.push(obj.color);
      if (obj.label) segs.push(obj.label);
      if (obj.position) segs.push(obj.position);
      parts.push(segs.join(' '));
    }
  }
  return parts.join(' • ').toLowerCase();
}

export function findAttributeMatches(nodes: GraphNode[], query: string): AttributeMatch[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const tokens = trimmed
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
  if (tokens.length === 0) return [];

  // For natural-language queries ("guy in green shirt running") strict
  // AND-matching is too brittle — a single descriptor missing from the
  // node's attribute text kills an otherwise clear hit. Require all
  // tokens when the query is short (1–2 tokens) but allow one miss when
  // it's longer.
  const required = tokens.length <= 2 ? tokens.length : tokens.length - 1;

  const scored: { evidenceId: string; matched: number }[] = [];
  for (const node of nodes) {
    // Restrict to visual evidence — text/PDF nodes are handled by the text matcher.
    if (node.media_class !== 'image' && node.media_class !== 'video') continue;
    const haystack = nodeAttributeText(node);
    if (!haystack) continue;
    let matched = 0;
    // Match through synonyms so generic query terms ("car") hit specific
    // detected labels ("sedan"), consistent with the graph object filter.
    for (const t of tokens) if (tokenMatchesText(t, haystack)) matched++;
    if (matched >= required) scored.push({ evidenceId: node.id, matched });
  }
  // Best matches first; ties keep input order (graph node iteration order).
  scored.sort((a, b) => b.matched - a.matched);
  return scored.map(s => ({ evidenceId: s.evidenceId }));
}
