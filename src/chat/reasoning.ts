/**
 * Helpers for splitting a streamed assistant response into "reasoning" and
 * "answer" halves. Models like Qwen 3 and DeepSeek R1 emit a `<think>…</think>`
 * block before their final answer; the chat UI hides this by default but
 * may want to expose it behind a toggle ("Show thinking").
 *
 * Three patterns we have to handle:
 *   1. Full block:        `<think>…</think>` followed by answer
 *   2. Streaming inside a block (no close yet): `<think>…` (still generating)
 *   3. Jinja-prefilled open tag (Qwen 3 ChatML):
 *      The chat template injects `<think>\n` as part of the assistant prefix,
 *      so the streamed tokens begin mid-reasoning and only the closing
 *      `</think>` appears in the model's output.
 */

/**
 * Sentinel tags we use to inline tool results into the assistant's turn
 * (so model can continue from prefill without restarting its template's
 * `<|channel|>thought` block). Hidden from the rendered message — the
 * user sees only the model's natural-language answer that integrates the
 * results, not the raw payload.
 */
export const TOOL_RESULT_OPEN = '<tool_result>';
export const TOOL_RESULT_CLOSE = '</tool_result>';

/**
 * Return the visible (answer) portion — reasoning blocks removed.
 * Used by the chat UI and by the persisted message content.
 *
 * Handles three conventions:
 *   • `<think>…</think>` — Qwen 3, DeepSeek R1, etc.
 *   • `<|channel|>thought … <|channel|>final …` — Harmony format used by
 *     gpt-oss-style fine-tunes and Unsloth's Gemma 4 chat template when
 *     llama.rn renders prompts with `jinja: true`.
 *   • `<tool_result>…</tool_result>` — our own inline tool-result markers,
 *     emitted into the buffer so prefill-based continuation rounds carry
 *     the tool data without using `role: 'tool'` messages (which Gemma's
 *     template doesn't honor).
 */
export const stripReasoning = (s: string): string => {
  let out = s.replace(/<tool_result>[\s\S]*?<\/tool_result>\s*/g, ''); // tool inlines
  // Qwen 3 / ChatML-trained models emit tool calls as raw text alongside
  // the structured tool_calls llama.rn parses. Hide the raw text from
  // display — llama.rn already gave us the structured form.
  out = out.replace(/<tool_call>[\s\S]*?<\/tool_call>\s*/g, '');
  out = out.replace(/<tool_call>[\s\S]*$/g, ''); // unclosed (still streaming)
  out = out.replace(/<think>[\s\S]*?<\/think>\s*/g, ''); // case 1
  out = out.replace(/<think>[\s\S]*$/g, ''); // case 2
  if (out.includes('</think>')) {
    // case 3: closing tag without a preceding opening tag → prefill case
    out = out.replace(/^[\s\S]*?<\/think>\s*/, '');
  }

  // Harmony channels: keep only the content after the LAST `<|channel|>`
  // marker, which by convention is the "final" channel (the user-facing
  // answer). Earlier channels — `analysis`, `thought`, `commentary` —
  // are model scratchpad and get hidden.
  //
  // Channel-name regex is intentionally case-sensitive (no `i` flag) and
  // strict to lowercase letters + underscores: real channel names are
  // always lowercase tokens like `thought`, `analysis`, `final`. Without
  // this, an unnamed channel followed by an uppercase answer letter
  // ("<|channel|>I found …") was eating the "I".
  if (out.includes('<|channel|>')) {
    const re = /<\|channel\|>(?:[a-z_]+\s*)?/g;
    const markers = [...out.matchAll(re)];
    if (markers.length >= 2) {
      const last = markers[markers.length - 1];
      if (last && last.index !== undefined) {
        out = out.slice(last.index + last[0].length);
      }
    } else if (markers.length === 1) {
      // Single channel marker means we're still streaming inside the
      // analysis channel — hide everything until the next marker arrives.
      out = '';
    }
  }

  return out;
};

/**
 * Return ONLY the reasoning text (without the surrounding tags). Empty
 * string when the response had no reasoning. Use this to populate a
 * collapsed "Show thinking" UI element next to the assistant message.
 */
export const extractReasoning = (s: string): string => {
  const collected: string[] = [];

  // case 1: full <think>…</think> blocks
  const blockRe = /<think>([\s\S]*?)<\/think>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(s)) !== null) collected.push((m[1] ?? '').trim());

  // case 3: prefilled-open variant — content before the first </think>
  // when there's no preceding <think>.
  if (s.includes('</think>') && !/<think>[\s\S]*?<\/think>/.test(s)) {
    const idx = s.indexOf('</think>');
    collected.push(s.slice(0, idx).trim());
  }

  // Harmony channels: pull out the content of every non-final channel.
  // We treat all channels except the LAST one as reasoning. (See the
  // matching regex in `stripReasoning` for why the `i` flag is omitted.)
  if (s.includes('<|channel|>')) {
    const re = /<\|channel\|>(?:[a-z_]+\s*)?/g;
    const markers = [...s.matchAll(re)];
    if (markers.length >= 2) {
      for (let i = 0; i < markers.length - 1; i++) {
        const start = (markers[i]?.index ?? 0) + (markers[i]?.[0].length ?? 0);
        const end = markers[i + 1]?.index ?? s.length;
        const chunk = s.slice(start, end).trim();
        if (chunk) collected.push(chunk);
      }
    }
  }

  return collected.filter(Boolean).join('\n\n');
};
