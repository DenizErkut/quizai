import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseGradeImport } from '../lib/grade-import-parser'

for (const bookType of ['xlsx','xls','csv'] as const) test(`grade importer preserves Turkish text, school numbers and grades in ${bookType}`, () => {
  const input = [['Ö.No','Sınıf','İsim','Matematik'],['0012','6-D','Çağrı Öğüt',87]]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(input),'Notlar')
  const buffer = XLSX.write(workbook,{ type:'buffer',bookType })
  const rows = parseGradeImport(buffer)
  assert.equal(rows[1][0],'0012')
  assert.equal(rows[1][2],'Çağrı Öğüt')
  assert.equal(rows[1][3],'87')
})
test('wide data and excessive rows are refused even when the header is short', () => {
  const wide = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wide,XLSX.utils.aoa_to_sheet([['İsim'],Array(101).fill('x')]),'Notlar')
  assert.throws(()=>parseGradeImport(XLSX.write(wide,{type:'buffer',bookType:'xlsx'})),/100 sütun/)
  assert.throws(()=>parseGradeImport(new TextEncoder().encode('İsim\n'+Array(2001).fill('Çağrı').join('\n'))),/2.000/)
})
