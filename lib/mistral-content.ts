/**
 * Mistral `message.content` bazı modellerde düz metin, bazılarında parça dizisidir (`[{type:'text',text}, {type:'thinking',...}]`).
 * Yalnızca görünür metin parçalarını birleştirir; düşünme (thinking) parçaları ve bilinmeyen türler atılır.
 */
export function mistralContentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(chunk => {
    if (typeof chunk === 'string') return chunk
    const c = chunk as { type?: unknown; text?: unknown } | null
    return c && (c.type === undefined || c.type === 'text') && typeof c.text === 'string' ? c.text : ''
  }).join('')
}
