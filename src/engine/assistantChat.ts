import { getOpenAIClient, searchVectorStore, getVectorStoreStatus } from '../utils/openaiClient';
import { getVectorStoreId } from '../storage/config';
import { AssistantItem } from '../components/AssistantPanel';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function buildSystemPrompt(items: AssistantItem[], vectorContext: string): string {
  const evidenceSummary = items.map(e => {
    const lines = [
      `• ${e.title} (ID: ${e.id})`,
      e.category       && `  Category: ${e.category}`,
      e.officer        && `  Officer: ${e.officer}`,
      e.date_recorded  && `  Recorded: ${e.date_recorded}`,
      e.media_class    && `  Type: ${e.media_class}`,
      e.description    && `  Description: ${e.description}`,
      e.objects_detected && `  Objects detected: ${e.objects_detected}`,
    ].filter(Boolean);
    return lines.join('\n');
  }).join('\n\n');

  return [
    'You are an investigative assistant embedded in a law enforcement evidence management platform.',
    items.length === 0
      ? 'No evidence has been selected yet. First, classify the user\'s request into one of three buckets:\n1. GREETING / CAPABILITY QUESTION — user is saying hello or asking what you can do. Respond in a friendly, concise way (no headers or bullets).\n2. PLATFORM DATA QUERY — user is asking about information that lives in the platform\'s operational systems, NOT in evidence files. This includes: device or body camera assignments, officer records, case assignments, device inventory, user accounts, or any structured database lookup. For these, respond with a single sentence acknowledging you can\'t look up that data directly, then emit: <feature_request title="[concise feature name]" description="[1–2 sentences describing what the user wanted to look up]" />\n3. EVIDENCE ANALYSIS REQUEST — user is asking to analyze, summarize, investigate, correlate, draft, or answer questions about specific people, facts, timelines, witnesses, or case details from evidence files. For these, respond with a single short sentence acknowledging the request and letting them know you need them to select the relevant evidence first, then end your response with exactly <needs_evidence/> on its own line. Do not attempt the task. NEVER hallucinate content.'
      : 'Evidence has been selected. Always engage directly with the user\'s message using the evidence provided. Only fall back to a capability introduction if the user explicitly asks what you can do.',
    'You are helping an officer analyze the following selected evidence items only — do not reference any other evidence:\n',
    evidenceSummary,
    vectorContext ? `\nRelevant content retrieved from the evidence files:\n${vectorContext}` : '',
    vectorContext
      ? '\nIMPORTANT: Evidence content has been retrieved above. You MUST answer the user\'s question directly and specifically using that content. Extract and state concrete facts, names, dates, and details found in the text. NEVER use hedging language like "this document might contain", "could provide", "may include", or "it would be beneficial to review" — those phrases are forbidden. If the retrieved content does not contain the specific answer, say so in one plain sentence. Do not suggest the user review documents themselves.'
      : '',
    '\nYou MUST begin every response with a <thinking> block. Format it exactly as:\n<thinking>\n[4–6 word phrase describing your approach, e.g. "Cross-referencing timeline and witness accounts"]\n\n[2–3 sentences of reasoning: what the user is asking, which evidence is relevant, what approach you will take. Do NOT write your answer here.]\n</thinking>\nThen write your response after the closing tag.',
    '\nYou can help investigate patterns, connections, and insights. When it makes sense, you may also propose structured actions on the selected evidence.',
    '\nACTIONS — CRITICAL INSTRUCTIONS: When the user asks to add evidence items to a case, you MUST immediately emit a single <action> tag covering all selected items. Do NOT emit one tag per item — always combine all item IDs into the "items" attribute as a comma-separated list. Format:\n<action type="add_to_case" items="EV-ID1,EV-ID2,EV-ID3" value="Case Name" />\nThe UI will present a single approval card for the entire batch. NEVER emit multiple action tags for the same action type — always consolidate.',
    '\nMETADATA EDITS — CRITICAL INSTRUCTIONS: When the user asks you to edit, change, update, set, or add any metadata field on an evidence item, you MUST immediately emit a <metadata_edit> tag. Do NOT ask the user to confirm in text first — the tag itself creates an approval card in the UI where the user can click "Apply" or "Dismiss". Your job is to emit the tag right away; the UI handles confirmation. Format (emit immediately after 1 sentence acknowledging the change):\n<metadata_edit evidence_id="EV-EXACTID" field="category" value="Assault" />\n<metadata_edit evidence_id="EV-EXACTID" field="status" value="under review" />\n<metadata_edit evidence_id="EV-EXACTID" field="description" value="New description text" />\nValid fields:\n  category → Assault, Traffic Stop, Homicide, Theft, Shooting, Domestic, Drug Offense, Burglary, Police Event, Non Event, Other\n  status → active, archived, under review\n  description → any text\nRULES: Use the exact evidence_id from the evidence list above. Emit the tag on its own line immediately after your 1-sentence acknowledgement. NEVER say "please confirm", "would you like to", or ask for permission — just emit the tag. Never emit inside the thinking block.',
    'Format your response in clean markdown. Use bullet points, bold, and headers where appropriate.',
    'Be concise and factual. Only draw on the evidence listed above.',
    'When you reference a specific piece of evidence, cite its ID inline immediately after the relevant claim using square brackets, e.g. [EV-16M3TQA7]. Use a separate bracket for each ID — never group multiple IDs in one bracket (do NOT write [EV-ID1, EV-ID2], instead write [EV-ID1][EV-ID2]). Only cite IDs from the evidence listed above. NEVER write an evidence ID or filename in plain prose — only inside square brackets.',
    items.length > 0 ? '\nDRAFT REPORTS: If the user asks you to draft, write, or generate a report, incident report, summary report, or any written document, you MUST output the full draft inside a <draft_report> block. Use the format:\n<draft_report title="[Descriptive report title]">\n[Full report content in clean markdown]\n</draft_report>\nBefore the block, write 1–2 sentences in plain markdown acknowledging what you are drafting. Do NOT include the report content outside the block.' : null,
    '\nTIMELINE: If the user asks for a timeline, chronology, or sequence of events, present the evidence as a markdown table with columns: Date | Time | Title | Type | Officer. Sort rows chronologically. Only include evidence items that have a recorded date.',
    '\nFEATURE REQUESTS: If the user asks you to do something that is outside your capabilities — such as sending emails, making calls, accessing external systems, performing real-world actions, or anything this platform does not support — respond with a brief 1-sentence acknowledgement explaining you cannot do that, then immediately emit: <feature_request title="[concise feature name, 3–6 words]" description="[1–2 sentences describing what the user wanted to do]" />\nDo NOT apologise repeatedly or suggest workarounds. Just acknowledge and emit the tag.',
  ].filter(Boolean).join('\n');
}

export interface StreamResult {
  sourcedItems: AssistantItem[];
  chunksByFileId: Record<string, string>;
}

export async function chatWithEvidenceStream(
  userMessage: string,
  history: ChatMessage[],
  items: AssistantItem[],
  onChunk: (chunk: string) => void
): Promise<StreamResult> {
  const openai = getOpenAIClient();
  if (!openai) throw new Error('No OpenAI API key configured.');

  const vectorStoreId = getVectorStoreId();
  let vectorContext = '';
  let sourcedItems: AssistantItem[] = [];
  const chunksByFileId: Record<string, string> = {};

  console.log('[chat] vectorStoreId:', vectorStoreId);
  console.log('[chat] items with vector_file_id:', items.filter(e => e.vector_file_id).map(e => ({ id: e.id, vector_file_id: e.vector_file_id })));

  if (vectorStoreId) {
    try {
      const storeStatus = await getVectorStoreStatus(vectorStoreId);
      console.log('[chat] vector store status:', storeStatus);
    } catch (e) {
      console.warn('[chat] could not fetch vector store status:', e);
    }
  }

  if (vectorStoreId) {
    const selectedFileIds = [...new Set(items.map(e => e.vector_file_id).filter(Boolean) as string[])];
    console.log('[chat] selectedFileIds:', selectedFileIds);
    if (selectedFileIds.length > 0) {
      // Build a meaningful retrieval query — user messages like "summarize" are action words
      // with no semantic signal for embedding search. Augment with evidence metadata.
      const metaTokens = items
        .flatMap(e => [e.title, e.category, e.description].filter(Boolean))
        .join(' ');
      const isBroadRequest = userMessage.trim().split(/\s+/).length <= 4 ||
        /^(summar|overview|describ|tell me|explain|what|who|when|where|analyz|review)/i.test(userMessage.trim());
      const retrievalQuery = isBroadRequest
        ? `${metaTokens} ${userMessage}`.trim()
        : userMessage;

      console.log('[chat] retrievalQuery:', retrievalQuery.slice(0, 200));

      // For exhaustive requests (summary, overview), search per-file with the item title
      // as anchor so every selected file gets representation in the context.
      const perFileChunks = await Promise.all(
        selectedFileIds.map(async fileId => {
          const item = items.find(e => e.vector_file_id === fileId);
          const fileQuery = isBroadRequest
            ? `${item?.title ?? ''} ${item?.description ?? ''} ${userMessage}`.trim()
            : retrievalQuery;
          try {
            const results = await searchVectorStore(vectorStoreId, fileQuery, 20);
            // Only keep chunks that actually belong to this file — the search is
            // store-wide, not per-file, so results can include unrelated files.
            // Falling back to "any result" would attribute other evidence's
            // content to this item's heading in the prompt.
            const fromFile = results.filter(c => c.fileId === fileId);
            return { fileId, item, chunks: fromFile.slice(0, 5) };
          } catch (e) {
            console.warn('[chat] searchVectorStore failed for file', fileId, e);
            return { fileId, item, chunks: [] };
          }
        })
      );

      console.log('[chat] per-file chunk counts:', perFileChunks.map(f => ({ fileId: f.fileId, count: f.chunks.length })));

      const allChunks = perFileChunks.flatMap(f => f.chunks);
      if (allChunks.length > 0) {
        vectorContext = perFileChunks
          .filter(f => f.chunks.length > 0)
          .map(f => `### ${f.item?.title ?? f.fileId}\n${f.chunks.map(c => c.text).join('\n\n')}`)
          .join('\n\n---\n\n');

        sourcedItems = items.filter(e => e.vector_file_id && perFileChunks.some(f => f.fileId === e.vector_file_id && f.chunks.length > 0));
        for (const { fileId, chunks } of perFileChunks) {
          if (chunks.length > 0) chunksByFileId[fileId] = chunks.map(c => c.text).join('\n\n');
        }
        console.log('[chat] vectorContext length:', vectorContext.length);
      } else {
        console.warn('[chat] No chunks retrieved for any file.');
      }
    }
  }

  const systemPrompt = buildSystemPrompt(items, vectorContext);

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.3,
    max_tokens: 2400,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (delta) onChunk(delta);
  }

  return { sourcedItems, chunksByFileId };
}
