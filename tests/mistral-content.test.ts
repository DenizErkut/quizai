import test from 'node:test'
import assert from 'node:assert/strict'
import { mistralContentToText } from '../lib/mistral-content'

test('düz metin aynen döner', () => { assert.equal(mistralContentToText('{"questions":[]}'), '{"questions":[]}') })

test('parça dizisinde yalnız görünür metin birleştirilir, düşünme parçaları atılır', () => {
  const content = [{ type: 'thinking', thinking: [{ type: 'text', text: 'iç düşünce' }] }, { type: 'text', text: '{"questions":' }, { type: 'text', text: '[]}' }]
  assert.equal(mistralContentToText(content), '{"questions":[]}')
  assert.equal(mistralContentToText(['a', { text: 'b' }]), 'ab')
})

test('beklenmeyen tür boş metin olur ve fırlatmaz', () => {
  assert.equal(mistralContentToText(null), '')
  assert.equal(mistralContentToText({ foo: 1 }), '')
  assert.equal(mistralContentToText([42, null]), '')
})
