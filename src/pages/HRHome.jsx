import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { useAuth } from '../AuthContext'
import { cairoTodayStr, cairoHour } from '../lib/cairoTime'
import { WorkforceRow } from './WorkforceScreen'

// الصفحة الرئيسية (والوحيدة) لدور "الموارد البشرية" - وصول حصري لتسجيل حصر
// الأفراد على كل المشاريع المسجّلة في النظام (بدون تخصيص فردي لكل مشروع، عكس
// كل الأدوار التانية)، مع ملخص سريع لحصر اليوم أو أي يوم يتم اختياره، وقفل
// الساعة 12 ظهرًا (زي قفل الساعة 4 للمشرف، بس بميعاد مختلف ودور مختلف).
export default function HRHome() {
  const { profile, signOut } = useAuth()
  const [date, setDate] = useState(cairoTodayStr())
  const [projects, setProjects] = useState([])
  const [entries, setEntries] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showEntryForm, setShowEntryForm] = useState(false)

  const isLocked = profile.role === 'hr' && cairoHour() >= 12

  useEffect(() => { loadProjects() }, [])
  useEffect(() => { if (projects.length > 0) loadEntries() }, [date, projects]) // eslint-disable-line

  async function loadProjects() {
    setLoading(true)
    const { data, error } = await fetchAllRows((from, to) =>
      supabase.from('projects').select('id, project_name, project_number').neq('final_delivery_status', 'delivered').order('project_name').range(from, to)
    )
    if (error) { setError(error.message); setLoading(false); return }
    setProjects(data || [])
    setLoading(false)
  }

  async function loadEntries() {
    const { data, error } = await supabase.from('daily_workforce').select('*').eq('work_date', date)
    if (error) { setError(error.message); return }
    const map = {}
    ;(data || []).forEach((r) => { map[r.project_id] = r })
    setEntries(map)
  }

  async function handleSave(projectId, headcountValue, plannedPointsValue, notesValue) {
    if (isLocked) return
    setSavingId(projectId)
    setError(''); setNotice('')
    const headcount = Number(headcountValue)
    const plannedPoints = Number(plannedPointsValue) || 0
    if (isNaN(headcount) || headcount < 0) { setError('اكتب رقم صحيح لعدد الأفراد'); setSavingId(''); return }
    const { error } = await supabase
      .from('daily_workforce')
      .upsert({
        project_id: projectId, work_date: date, headcount, planned_points: plannedPoints,
        notes: notesValue || null, recorded_by: profile.id,
      }, { onConflict: 'project_id,work_date' })
    setSavingId('')
    if (error) { setError(error.message); return }
    setNotice('تم الحفظ.')
    await loadEntries()
  }

  const enteredCount = projects.filter((p) => entries[p.id]).length
  const totalHeadcount = projects.reduce((s, p) => s + (entries[p.id]?.headcount || 0), 0)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ marginBottom: 0 }}>حصر الأفراد — {profile?.full_name}</h1>
        <button className="btn-secondary sm" onClick={signOut}>تسجيل الخروج</button>
      </div>
      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>موارد بشرية — وصول لكل المشاريع</p>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}
      {isLocked && (
        <div className="alert" style={{ background: 'var(--pending-soft)', color: 'var(--pending)' }}>
          شاشة تسجيل حصر الأفراد مقفولة بعد الساعة 12 ظهرًا يوميًا. تقدر تشوف حصر النهاردة، ومتقدرش تدخل أو تعدّل حاجة جديدة دلوقتي.
        </div>
      )}

      <div className="card">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>التاريخ</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {/* ملخص سريع لحصر اليوم المختار - نظرة عامة قبل الدخول في تفاصيل كل مشروع */}
      <div className="card">
        <h3 style={{ marginBottom: 10 }}>ملخص حصر {date}</h3>
        {loading ? (
          <p style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
              <span className="badge badge-ok">مشاريع اتسجّل حصرها: {enteredCount} / {projects.length}</span>
              <span className="badge badge-empty">إجمالي الأفراد المسجّلين: {totalHeadcount}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>المشروع</th><th>عدد الأفراد</th><th>ملاحظات</th></tr></thead>
                <tbody>
                  {projects.map((p) => {
                    const e = entries[p.id]
                    return (
                      <tr key={p.id}>
                        <td>{p.project_number} — {p.project_name}</td>
                        <td>{e ? e.headcount : <span style={{ color: 'var(--muted)' }}>لسه ما اتسجّلش</span>}</td>
                        <td>{e?.notes || ''}</td>
                      </tr>
                    )
                  })}
                  {projects.length === 0 && (
                    <tr><td colSpan={3} style={{ color: 'var(--muted)' }}>مفيش مشاريع نشطة حاليًا.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showEntryForm ? 12 : 0 }}>
          <h3 style={{ marginBottom: 0 }}>تسجيل / تعديل حصر الأفراد</h3>
          <button type="button" className="btn-secondary sm" onClick={() => setShowEntryForm((s) => !s)}>
            {showEntryForm ? 'إخفاء' : 'إظهار'}
          </button>
        </div>
        {showEntryForm && (
          loading ? (
            <p style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>
          ) : projects.length === 0 ? (
            <div className="empty-state"><div className="icon">📋</div>لا توجد مشاريع نشطة حاليًا.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {projects.map((p) => (
                <WorkforceRow
                  key={p.id}
                  project={p}
                  entry={entries[p.id]}
                  busy={savingId === p.id}
                  locked={isLocked}
                  isNew={false}
                  onSave={(hc, pp, notes) => handleSave(p.id, hc, pp, notes)}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
