'use client'
// components/SubjectPerformanceChart.tsx
// Ders bazlı ortalama başarı grafiği — öğrenci (/report), veli
// (/parent/report) ve öğretmen/kurum/veli panellerinin "Ders Bazlı"
// sekmesinde (SectionalReportTable) TEK bir yerden paylaşılıyor. Aynı
// grafiğin birden fazla dosyada kopyalanıp zamanla birbirinden sapması
// (daha önce SiteFooter'da yaşanan sorun) burada tekrar edilmesin diye
// bilinçli olarak paylaşılan bir bileşen olarak kuruldu.
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export interface SubjectPerformanceDatum {
  subject: string
  avgPct: number
  testCount?: number
}

function pctColor(p: number): string {
  return p >= 80 ? '#3f725f' : p >= 50 ? '#f2b94b' : '#df5c3f'
}

export default function SubjectPerformanceChart({
  data,
  height = 220,
}: {
  data: SubjectPerformanceDatum[]
  height?: number
}) {
  if (!data.length) return null
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 12, right: 12, left: -20, bottom: 8 }}>
        <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="var(--border)" />
        <XAxis dataKey="subject" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `%${v}`} />
        <Tooltip
          formatter={(value: any, _name: any, props: any) => [
            `%${value}${props?.payload?.testCount ? ` (${props.payload.testCount} test)` : ''}`,
            'Ortalama',
          ]}
        />
        <Bar dataKey="avgPct" radius={[9, 9, 2, 2]} maxBarSize={48}>
          {data.map((d, i) => <Cell key={i} fill={pctColor(d.avgPct)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
