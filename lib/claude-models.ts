// Single place for the Claude Sonnet model id and the request settings that go with it.
//
// Claude Sonnet 4.5 is retired on 30 Nov 2026. Claude Sonnet 5.5 differs in ways that matter here:
// - it thinks by default (thinking tokens count toward max_tokens and a reply can start with a
//   `thinking` block), while these routes want a plain, bounded reply -> `between_tools`, the lowest
//   thinking setting (accepted only by Sonnet 5.5, only at effort `high` or below, takes no other field);
// - non-default temperature / top_p / top_k and forced tool_choice are rejected (400);
// - the tokenizer produces roughly 30% more tokens for the same text -> scale max_tokens.
export const CLAUDE_SONNET = 'claude-sonnet-5-5'

/** Spread into `messages.create({...})` for calls that run on Claude Sonnet 5.5. */
export const SONNET_PARAMS = { thinking: { type: 'between_tools' } as never }

/**
 * Same as SONNET_PARAMS, but safe when the model comes from an environment override: any other model
 * (a rollback to an older Sonnet, a Haiku) rejects `between_tools`.
 */
export function sonnetParams(model: string): { thinking?: never } {
  return model.startsWith('claude-sonnet-5-5') ? SONNET_PARAMS : {}
}

/** max_tokens for Claude Sonnet 5.5: the same reply needs ~30% more tokens than on Sonnet 4.5. */
export function sonnetTokens(tokens: number): number {
  return Math.ceil(tokens * 1.3)
}

/** Concatenated text of a Messages API reply; ignores thinking / tool_use blocks wherever they sit. */
export function responseText(message: { content?: Array<{ type: string; text?: string }> } | null | undefined): string {
  return (message?.content ?? []).filter(block => block.type === 'text').map(block => block.text ?? '').join('')
}
