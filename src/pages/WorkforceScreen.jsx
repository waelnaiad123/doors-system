import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { useAuth } from '../AuthContext'

function todayStr() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function WorkforceScreen() {
  const { profile } = useAuth()
  const [date, setDate] = useState(todayStr())
  const [projects, setProjects] = useState([])
  const [entries, setEntries] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => { loadProjects() }, [])
  useEffect(() => { if (projects.length > 0) loadEntries() }, [date, projects]) // eslint-disable-line

  async function loadProjects() {
    setLoading(true)
    const { data, error } = await fetchAllRows((from, to) =>
      supabase.from('projects').select('id, project_name, project_number').order('project_name').range(from, to)
    )
    if (error) setError(error.message)
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

  return (
    <div>
      <h1>حصر الأفراد والنقاط المخططة يوميًا</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="card">
        <div className="field">
          <label>التاريخ</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>
        ) : projects.length === 0 ? (
          <div className="empty-state"><div className="icon">📋</div>لا توجد مشاريع مخصصة لك.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {projects.map((p) => (
              <WorkforceRow
                key={p.id}
                project={p}
                entry={entries[p.id]}
                busy={savingId === p.id}
                onSave={(hc, pp, notes) => handleSave(p.id, hc, pp, notes)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function WorkforceRow({ project, entry, busy, onSave }) {
  const [headcount, setHeadcount] = useState(entry?.headcount ?? '')
  const [plannedPoints, setPlannedPoints] = useState(entry?.planned_points ?? '')
  const [notes, setNotes] = useState(entry?.notes ?? '')

  useEffect(() => {
    setHeadcount(entry?.headcount ?? '')
    setPlannedPoints(entry?.planned_points ?? '')
    setNotes(entry?.notes ?? '')
  }, [entry])

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <strong>{project.project_name}</strong>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}> ({project.project_number})</span>
        </div>
        {entry && <span className="badge badge-ok">تم التسجيل</span>}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ marginBottom: 0, width: 110 }}>
          <label>عدد الأفراد</label>
          <input type="number" min={0} value={headcount} onChange={(e) => setHeadcount(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div className="field" style={{ marginBottom: 0, width: 130 }}>
          <label>النقاط المخططة</label>
          <input type="number" min={0} value={plannedPoints} onChange={(e) => setPlannedPoints(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
          <label>ملاحظات (اختياري)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: '100%' }} />
        </div>
        <button className="btn-primary" disabled={busy || headcount === ''} onClick={() => onSave(headcount, plannedPoints, notes)}>
          {busy ? 'جارِ الحفظ...' : 'حفظ'}
        </button>
      </div>
    </div>
  )
}
