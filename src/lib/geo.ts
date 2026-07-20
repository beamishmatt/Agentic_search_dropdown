// Location helpers for the stylized district map.
//
// Evidence in one case shares a single incident location (one incident = one
// place). Location lives on the case; nodes inherit it with a small
// deterministic jitter (derived from the node id) so co-located pins fan out
// slightly instead of perfectly stacking.

import { ContextGraph, GeoPoint } from '../data/types';

// Deterministic 0..1 hash of a string (FNV-1a) → a stable point in the unit
// square. Used for pin jitter, and as the fallback position for results that
// never resolved a real location.
export function hashToUnit(id: string): { x: number; y: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const x = ((h >>> 0) & 0xffff) / 0xffff;
  const y = ((h >>> 16) & 0xffff) / 0xffff;
  return { x, y };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Resolve the map location for a node: its case's incident location, nudged by
// a small deterministic jitter so multiple evidence items in one case don't
// render on top of each other. Returns undefined when the case has no location.
export function resolveNodeLocation(
  graph: ContextGraph,
  caseId: string | undefined,
  nodeId: string
): GeoPoint | undefined {
  const base = caseId ? graph.cases[caseId]?.location : undefined;
  if (!base) return undefined;
  const { x, y } = hashToUnit(nodeId);
  const JITTER = 0.045;
  return {
    ...base,
    x: clamp01(base.x + (x - 0.5) * JITTER),
    y: clamp01(base.y + (y - 0.5) * JITTER),
  };
}
