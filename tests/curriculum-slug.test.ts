import test from 'node:test'
import assert from 'node:assert/strict'
import { gradeNumberFromSlug, gradeSlug, slugify } from '../lib/curriculum-slug'

test('Türkçe karakterli ders adları ASCII slug olur', () => {
  assert.equal(slugify('Türkçe'), 'turkce')
  assert.equal(slugify('Din Kültürü ve Ahlak Bilgisi'), 'din-kulturu-ve-ahlak-bilgisi')
  assert.equal(slugify('T.C. İnkılap Tarihi ve Atatürkçülük'), 'tc-inkilap-tarihi-ve-ataturkculuk')
  assert.equal(slugify('Fen Bilimleri'), 'fen-bilimleri')
  assert.equal(slugify('  Işık, ses!  '), 'isik-ses')
})

test('sınıf slug gidiş-dönüş', () => {
  assert.equal(gradeSlug('7. sınıf'), '7-sinif')
  assert.equal(gradeSlug('ortaokul 12. sınıf'), '12-sinif')
  assert.equal(gradeSlug('üniversite'), null)
  assert.equal(gradeNumberFromSlug('7-sinif'), 7)
  assert.equal(gradeNumberFromSlug('13-sinif'), null)
  assert.equal(gradeNumberFromSlug('x'), null)
})
