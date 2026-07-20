// Answers natural-language policy / procedure / legal questions typed into the
// search bar (e.g. "what is our policy for arresting someone with diplomatic
// immunity") with a concise AI overview, rather than treating them as an
// evidence lookup.

import { chatCompletion } from '../utils/openaiClient';

// Policy / procedure / legal vocabulary. A question touching any of these is a
// request for guidance, not an evidence search.
const POLICY_TERMS_RE = /\b(polic(y|ies)|procedures?|protocols?|guidelines?|regulations?|rules?|allowed|permitted|lawful|legal(ly)?|jurisdiction|miranda|use[- ]of[- ]force|chain[- ]of[- ]custody|probable cause|reasonable suspicion|diplomatic immunity|warrants?|subpoenas?|detain(ing|ment)?|arrest(ing)?|search and seiz|our (department|dept|agency))/i;

// A natural-language question: starts with an interrogative/modal, or ends in
// a question mark.
const QUESTION_FORM_RE = /(^\s*(what|how|when|why|can|could|should|shall|do|does|did|are|is|am|may|must|whether|if)\b)|\?\s*$/i;

/**
 * True when the query reads as a policy/procedure/legal question the user wants
 * explained — a full question (>= 4 words, interrogative form) that references
 * policy or legal vocabulary. Short keyword lookups never qualify.
 */
export function isPolicyQuestion(query: string): boolean {
  const q = query.trim();
  if (q.split(/\s+/).length < 4) return false;
  return QUESTION_FORM_RE.test(q) && POLICY_TERMS_RE.test(q);
}

const POLICY_SYSTEM = `You are a policy assistant embedded in a US municipal police department's evidence management system. Officers ask you natural-language questions about department policy, procedure, and the law.

Answer concisely and practically in 2–4 sentences, or a short bulleted list when the answer involves steps. Ground your answer in generally accepted US law-enforcement practice and legal principles, and be direct and actionable.

When the question involves legal specifics that vary by jurisdiction or that call for supervisory/legal judgment (e.g. diplomatic immunity, use of force, warrants, custody), briefly advise the officer to confirm with a supervisor or the department's policy manual. Never fabricate specific department policy numbers, statute citations, or case names.`;

/**
 * Generates a concise AI overview answering a policy question. Returns an empty
 * string on failure so callers can fall back to normal search output.
 */
export async function answerPolicyQuestion(query: string): Promise<string> {
  try {
    const answer = await chatCompletion(
      [
        { role: 'system', content: POLICY_SYSTEM },
        { role: 'user', content: query },
      ],
      { model: 'gpt-4o', temperature: 0.3, max_tokens: 400 }
    );
    return answer.trim();
  } catch {
    return '';
  }
}
