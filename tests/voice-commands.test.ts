import test from 'node:test'
import assert from 'node:assert/strict'
import { matchVoiceCommand } from '../lib/voice-commands'

test('voice commands open pages only with an action word', () => {
  assert.deepEqual(matchVoiceCommand('Açık uçlu soruları aç'), { type: 'navigate', href: '/acik-uclu', label: 'Açık Uçlu Sorular' })
  assert.deepEqual(matchVoiceCommand('ana sayfaya git'), { type: 'navigate', href: '/home', label: 'Ana Sayfa' })
  assert.deepEqual(matchVoiceCommand('Yazılıya hazırlanıyorum sayfasını aç'), { type: 'navigate', href: '/yazili', label: 'Yazılıya Hazırlanıyorum' })
  assert.equal(matchVoiceCommand('anlık test nasıl çözülür'), null)
  assert.equal(matchVoiceCommand('açık uçlu sorularda rubrik ne demek ve nasıl puanlanır acaba'), null)
  assert.equal(matchVoiceCommand(''), null)
})

test('voice commands control audio and the input', () => {
  assert.deepEqual(matchVoiceCommand('sesi durdur'), { type: 'stop' })
  assert.deepEqual(matchVoiceCommand('Sus'), { type: 'stop' })
  assert.deepEqual(matchVoiceCommand('tekrar oku'), { type: 'repeat' })
  assert.deepEqual(matchVoiceCommand('temizle'), { type: 'clear' })
})
