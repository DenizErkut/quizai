import * as XLSX from 'xlsx'
import { UserFacingError } from './api-error'

export function parseGradeImport(buffer: ArrayBuffer | Uint8Array): string[][] {
  const book = XLSX.read(buffer, { type:'array', sheetRows:2002, bookVBA:false, raw:true })
  if (!book.SheetNames.length) throw new UserFacingError('Dosyada okunabilir bir sayfa yok.')
  const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], { header:1, blankrows:false, defval:'', raw:false })
  if (rows.length<2) throw new UserFacingError('En az bir başlık ve bir veri satırı gerekli.')
  if (rows.length>2001 || rows.some(row=>row.length>100)) throw new UserFacingError('En fazla 2.000 öğrenci satırı ve 100 sütun yükleyebilirsiniz.')
  return rows.map(row=>row.map(value=>String(value ?? '').trim()))
}
