import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'

const TABLES = [
  'profiles', 'projects', 'doors', 'door_items', 'item_types',
  'project_assignments', 'project_assignment_doors',
  'installation_records', 'deliveries',
  'daily_workforce', 'daily_project_notes',
  'monthly_productivity', 'additional_works',
]

export default function BackupExport() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')

  async function handleExport() {
    setBusy(true)
    setError('')
    setProgress('')
    try {
      const dump = {}
      for (const table of TABLES) {
        setProgress(`جارِ تصدير ${table}...`)
        const { data, error } = await fetchAllRows((from, to) =>
          supabase.from(table).select('*').range(from, to)
        )
        if (error) throw new Error(`${table}: ${error.message}`)
        dump[table] = data || []
      }

      const payload = {
        exported_at: new Date().toISOString(),
        tables: dump,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const dateStr = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `نسخة-احتياطية-${dateStr}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setProgress('تم تحميل النسخة الاحتياطية بنجاح.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1>نسخة احتياطية</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {progress && !error && <div className="alert alert-ok">{progress}</div>}

      <div className="card">
        <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 14 }}>
          الزرار ده بيحمّل ملف واحد فيه كل بيانات المشاريع والتركيبات والتسليمات والمستخدمين والتقارير — نسخة كاملة تقدر ترجعلها لو احتجت.
          احفظ الملف في مكان آمن (جوجل درايف مثلًا) بعد كل تحميل.
        </p>
        <button className="btn-primary" disabled={busy} onClick={handleExport}>
          {busy ? 'جارِ التصدير...' : '⬇ تحميل نسخة احتياطية الآن'}
        </button>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14 }}>
          نصيحة: كرّر الخطوة دي مرة كل أسبوع على الأقل، أو قبل أي تعديل كبير على النظام.
        </p>
      </div>
    </div>
  )
}
