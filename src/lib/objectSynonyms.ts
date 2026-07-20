// Shared object-term synonyms for search matching.
//
// The vision model tags objects with specific labels (sedan, handgun) while
// users search with generic ones (car, gun). Each group lists interchangeable
// terms; a search term and a detected label/attribute text match when they
// share a group. Used by both the graph scoper (structured object filter) and
// the Attributes navigator (free-text token match).

export const OBJECT_SYNONYM_GROUPS: string[][] = [
  ['car', 'vehicle', 'automobile', 'auto', 'sedan', 'suv', 'coupe', 'hatchback', 'wagon', 'van', 'minivan', 'pickup', 'pickup_truck', 'truck'],
  ['gun', 'firearm', 'weapon', 'handgun', 'pistol', 'revolver', 'rifle', 'shotgun'],
  ['knife', 'blade', 'machete', 'dagger'],
  ['phone', 'cellphone', 'cell_phone', 'smartphone', 'mobile', 'iphone', 'android'],
  ['person', 'people', 'man', 'woman', 'male', 'female', 'individual', 'suspect', 'pedestrian', 'human'],
];

// Expand a term to the set of interchangeable terms it belongs to (or just
// itself). Matches are membership-based, with a substring fallback so compound
// labels like "pickup_truck" still resolve.
export function synonymSet(term: string): string[] {
  const t = term.toLowerCase().trim();
  for (const group of OBJECT_SYNONYM_GROUPS) {
    if (group.some(g => g === t || t.includes(g) || g.includes(t))) return group;
  }
  return [t];
}

// True if a searched object label matches a detected label, allowing for
// synonyms/hypernyms and partial (substring) overlap in either direction.
export function labelMatches(searchLabel: string, detectedLabel: string): boolean {
  const det = detectedLabel.toLowerCase();
  return synonymSet(searchLabel).some(term => det.includes(term) || term.includes(det));
}

// True if a search token (or any of its synonyms) appears in a haystack string.
// The haystack is assumed already lower-cased.
export function tokenMatchesText(token: string, lowerHaystack: string): boolean {
  return synonymSet(token).some(term => lowerHaystack.includes(term));
}
