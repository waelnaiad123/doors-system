import React, { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'

const TABLES = [
  'profiles', 'profiles_private', 'projects', 'doors', 'door_items', 'item_types',
  'project_assignments', 'project_assignment_doors',
  'installation_records', 'deliveries',
  'daily_workforce', 'daily_project_notes',
  'monthly_productivity', 'additional_works',
]

// ترتيب الاستعادة لازم يحترم الروابط بين الجداول (الأب قبل الابن).
// "profiles" و"profiles_private" مستبعدين عمدًا: صفوفهم مرتبطة بحسابات دخول
// حقيقية (auth) مش ممكن نعيد إنشاءها من ملف. لو حساب اتمسح، أي بيانات بترجّع
// له (created_by, technician_id...) هترفض تلقائيًا وهيظهر في تقرير الفشل.
const RESTORE_ORDER = [
  'item_types', 'projects', 'doors', 'door_items',
  'project_assignments', 'project_assignment_doors',
  'installation_records', 'deliveries',
  'daily_workforce', 'daily_project_notes',
  'monthly_productivity', 'additional_works',
]

const BATCH_SIZE = 20

export default function BackupExport() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')

  const [restoreFile, setRestoreFile] = useState(null)
  const [restoreData, setRestoreData] = useState(null)
  const [restoreLog, setRestoreLog] = useState([])
  const [restoring, setRestoring] = useState(false)

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

      const payload = { exported_at: new Date().toISOString(), tables: dump }
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

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setRestoreLog([])
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!parsed.tables) throw new Error('الملف ده مش نسخة احتياطية صالحة (مفيش بيانات جداول فيه).')
      setRestoreFile(file)
      setRestoreData(parsed)
    } catch (e) {
      setError('تعذّرت قراءة الملف: ' + e.message)
      setRestoreFile(null)
      setRestoreData(null)
    }
  }

  async function handleRestore() {
    if (!restoreData) return
    const confirmText = window.prompt(
      'استعادة النسخة الاحتياطية هتضيف/تحدّث البيانات الموجودة بنفس الأرقام (id) من الملف. العملية دي مينفعش نتراجع عنها بسهولة.\nاكتب "استعادة" للتأكيد:'
    )
    if (confirmText !== 'استعادة') return

    setRestoring(true)
    setError('')
    const log = []
    for (const table of RESTORE_ORDER) {
      const rows = restoreData.tables[table] || []
      if (rows.length === 0) { log.push({ table, total: 0, ok: 0, failed: 0 }); setRestoreLog([...log]); continue }
      let ok = 0, failed = 0
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' })
        if (error) failed += batch.length
        else ok += batch.length
      }
      log.push({ table, total: rows.length, ok, failed })
      setRestoreLog([...log])
    }
    setRestoring(false)
  }

  return (
    <div>
      <h1>نسخة احتياطية</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {progress && !error && <div className="alert alert-ok">{progress}</div>}

      <div className="card">
        <h2 style={{ marginBottom: 8 }}>تصدير (تحميل نسخة جديدة)</h2>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 14 }}>
          الزرار ده بيحمّل ملف واحد فيه كل بيانات المشاريع والتركيبات والتسليمات والمستخدمين والتقارير.
          احفظ الملف في مكان آمن (جوجل درايف مثلًا) بعد كل تحميل.
        </p>
        <button className="btn-primary" disabled={busy} onClick={handleExport}>
          {busy ? 'جارِ التصدير...' : '⬇ تحميل نسخة احتياطية الآن'}
        </button>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14 }}>
          نصيحة: كرّر الخطوة دي مرة كل أسبوع على الأقل، أو قبل أي تعديل كبير على النظام.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 8 }}>استعادة (رفع نسخة قديمة)</h2>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 14 }}>
          ارفع ملف نسخة احتياطية سبق تحميله، وهيتم إضافة/تحديث البيانات في النظام الحالي (مش حذف أي حاجة موجودة مش في الملف).
          حسابات المستخدمين نفسها (تسجيل الدخول) مش بترجع بالطريقة دي - لو محتاج ترجّع حساب اتمسح، اعمله من شاشة "المستخدمون" يدويًا.
        </p>
        <input type="file" accept=".json" onChange={handleFileSelect} />

        {restoreData && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 700 }}>
              الملف: {restoreFile?.name} (نُسخ بتاريخ {restoreData.exported_at ? new Date(restoreData.exported_at).toLocaleDateString('ar-EG') : '—'})
            </p>
            <table style={{ marginTop: 8 }}>
              <thead><tr><th>الجدول</th><th>عدد الصفوف بالملف</th></tr></thead>
              <tbody>
                {RESTORE_ORDER.map((t) => (
                  <tr key={t}><td>{t}</td><td>{(restoreData.tables[t] || []).length}</td></tr>
                ))}
              </tbody>
            </table>
            <button className="btn-danger" style={{ marginTop: 14 }} disabled={restoring} onClick={handleRestore}>
              {restoring ? 'جارِ الاستعادة...' : '⚠ ابدأ الاستعادة'}
            </button>
          </div>
        )}

        {restoreLog.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <strong style={{ fontSize: 13.5 }}>نتيجة الاستعادة:</strong>
            <table style={{ marginTop: 6 }}>
              <thead><tr><th>الجدول</th><th>الإجمالي</th><th>نجح</th><th>فشل</th></tr></thead>
              <tbody>
                {restoreLog.map((r) => (
                  <tr key={r.table}>
                    <td>{r.table}</td><td>{r.total}</td>
                    <td style={{ color: 'var(--ok)' }}>{r.ok}</td>
                    <td style={{ color: r.failed > 0 ? 'var(--danger)' : 'inherit' }}>{r.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              أي صفوف فشلت غالبًا بسبب حساب مستخدم مرتبط بيها اتمسح من النظام، أو لإن الملف مأخوذ قبل تحديث لشكل
              أحد الجداول (زي إضافة خانات إجبارية جديدة) ومحتاج نسخة أحدث بنفس الشكل الحالي. الباقي رجع بنجاح.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
