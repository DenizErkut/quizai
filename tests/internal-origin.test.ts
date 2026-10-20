import test from 'node:test'
import assert from 'node:assert/strict'
import { internalOrigin } from '../lib/internal-origin'

test('izinli ana bilgisayarlar olduğu gibi kullanılır', () => {
  assert.equal(internalOrigin('https://pratium.com'), 'https://pratium.com')
  assert.equal(internalOrigin('https://quizai-abc123.vercel.app'), 'https://quizai-abc123.vercel.app')
  assert.equal(internalOrigin('http://localhost:3000'), 'http://localhost:3000')
})
test('sahte/izinsiz Host için yedek kök kullanılır', () => {
  assert.equal(internalOrigin('https://evil.com', 'https://pratium.com'), 'https://pratium.com')
  assert.equal(internalOrigin('https://pratium.com.evil.com', 'https://pratium.com'), 'https://pratium.com')
  assert.equal(internalOrigin('http://pratium.com', 'https://pratium.com/'), 'https://pratium.com')
  assert.equal(internalOrigin('not a url', 'https://pratium.com'), 'https://pratium.com')
})
