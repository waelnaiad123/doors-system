import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { sortByItemOrder } from '../lib/itemOrder'
import { useAuth } from '../AuthContext'

function todayStr() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function TechnicianDaily() {
  const { profile } = useAuth()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [workDate, setWorkDate] = useState(todayStr())
  const [today, setToday] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingPending, setLoadingPending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [workforceToday, setWorkforceToday] = useState([])
  const [notesToday, setNotesToday] = useState([])
  const [installNotes, setInstallNotes] = useState('')
  const [nonExecReason, setNonExecReason] = useState('')
  const [noteStatus, setNoteStatus] = useState(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [savingNote, setSavingNote] = useState(false)

  useEffect(() => { loadProjects() }, []) // eslint-disable-line
  useEffect(() => { if (projects.length > 0) { loadWorkforceReminder(); loadToday() } }, [projects]) // eslint-disable-line
  useEffect(() => { if (projectId) loadPending() }, [projectId, search]) // eslint-disable-line
  useEffect(() => { if (projectId) loadNote() }, [projectId]) // eslint-disable-line

  async function loadWorkforceReminder() {
    const projectIds = projects.map((p) => p.id)
    const { data, error } = await supabase
      .from('daily_workforce').select('project_id, headcount')
      .eq('work_date', todayStr()).gt('headcount', 0).in('project_id', projectIds)
    if (error) { setError(error.message); return }
    setWorkforceToday(data || [])
    const { data: notesData, error: notesErr } = await supabase
      .from('daily_project_notes').select('project_id')
      .eq('note_date', todayStr()).in('project_id', projectIds)
    if (notesErr) { setError(notesErr.message); return }
    setNotesToday(notesData || [])
  }

  async function loadNote() {
    const { data, error } = await supabase
      .from('daily_project_notes').select('*')
      .eq('project_id', projectId).eq('note_date', todayStr()).eq('created_by', profile.id)
      .maybeSingle()
    if (error) { setError(error.message); return }
    if (data) {
      setInstallNotes(data.installation_notes || '')
      setNonExecReason(data.non_execution_reason || '')
      setNoteStatus(data.status)
      setNotesOpen(true)
    } else {
      setInstallNotes(''); setNonExecReason(''); setNoteStatus(null)
      setNotesOpen(false)
    }
  }

  async function saveNote() {
    if (!installNotes.trim() && !nonExecReason.trim()) { setError('اكتب حاجة في إحدى الخانتين الأول'); return }
    setSavingNote(true)
    setError('')
    const { error } = await supabase
      .from('daily_project_notes')
      .upsert({
        project_id: projectId, note_date: todayStr(), created_by: profile.id,
        installation_notes: installNotes.trim() || null,
        non_execution_reason: nonExecReason.trim() || null,
      }, { onConflict: 'project_id,note_date,created_by' })
    setSavingNote(false)
    if (error) { setError(error.message); return }
    setNotice('تم حفظ الملاحظات.')
    await Promise.all([loadNote(), loadWorkforceReminder()])
  }

  async function loadProjects() {
    setLoadingProjects(true)
    const { data, error } = await supabase
      .from('projects').select('id, project_name, project_number').order('project_name')
    if (error) setError(error.message)
    setProjects(data || [])
    setLoadingProjects(false)
  }

  async function loadPending() {
    setLoadingPending(true)
    setError('')
    const { data, error } = await fetchAllRows((from, to) => {
      let q = supabase.from('v_pending_door_items').select('*').eq('project_id', projectId).order('door_code')
      if (search.trim()) q = q.ilike('door_code', `%${search.trim()}%`)
      return q.range(from, to)
    })
    if (error) setError(error.message)
    setPending(data || [])
    setSelected(new Set())
    setLoadingPending(false)
  }

  async function loadToday() {
    const projectIds = projects.map((p) => p.id)
    if (projectIds.length === 0) { setToday([]); return }
    const { data, error } = await supabase
      .from('v_installations_detail')
      .select('*')
      .in('project_id', projectIds)
      .eq('installed_at', todayStr())
      .order('door_code')
    if (!error) setToday(data || [])
  }

  const groupedByDoor = useMemo(() => {
    const m = new Map()
    pending.forEach((it) => {
      if (!m.has(it.door_code)) m.set(it.door_code, { door_code: it.door_code, location: it.location, items: [] })
      m.get(it.door_code).items.push(it)
    })
    return Array.from(m.values()).map((d) => ({ ...d, items: sortByItemOrder(d.items, (it) => it.item_type) }))
  }, [pending])

  const MAX_DOORS_SHOWN = 100
  const visibleDoors = groupedByDoor.slice(0, MAX_DOORS_SHOWN)

  const enteredProjectIds = useMemo(() => {
    const s = new Set(today.map((r) => r.project_id))
    notesToday.forEach((n) => s.add(n.project_id))
    return s
  }, [today, notesToday])

  const reminderProjects = useMemo(() => {
    return workforceToday
      .filter((w) => !enteredProjectIds.has(w.project_id))
      .map((w) => projects.find((p) => p.id === w.project_id))
      .filter(Boolean)
  }, [workforceToday, enteredProjectIds, projects])

  function toggle(id) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  function toggleDoor(doorItems, checked) {
    setSelected((s) => {
      const n = new Set(s)
      doorItems.forEach((it) => { checked ? n.add(it.door_item_id) : n.delete(it.door_item_id) })
      return n
    })
  }

  async function handleSubmit() {
    if (selected.size === 0) return
    if (!workDate) { setError('اختر تاريخ التركيب الفعلي الأول'); return }
    if (workDate > todayStr()) { setError('تاريخ التركيب لا يمكن أن يكون في المستقبل'); return }
    setSubmitting(true)
    setError('')
    try {
      const rows = Array.from(selected).map((id) => ({
        door_item_id: id, technician_id: profile.id, installed_at: workDate, status: 'pending_review',
      }))
      const { error } = await supabase.from('installation_records').insert(rows)
      if (error) throw error
      setNotice(`تم تسجيل ${rows.length} بند بنجاح بتاريخ ${workDate}، بانتظار اعتماد المشرف.`)
      await Promise.all([loadPending(), loadToday(), loadWorkforceReminder()])
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUndo(installationId) {
    setError('')
    const { error } = await supabase.from('installation_records').delete().eq('id', installationId)
    if (error) { setError(error.message); return }
    await Promise.all([loadPending(), loadToday(), loadWorkforceReminder()])
  }

  return (
    <div>
      <h1>تسجيل تركيب</h1>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {reminderProjects.length > 0 && (
        <div className="alert alert-error">
          ⚠️ فيه مشاريع بها عمال النهاردة ولسه ما اتسجّلش فيها تركيب أو ملاحظة:{' '}
          {reminderProjects.map((p, i) => (
            <span key={p.id}>
              <button type="button" onClick={() => setProjectId(p.id)}
                style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>
                {p.project_name}
              </button>
              {i < reminderProjects.length - 1 ? '، ' : ''}
            </span>
          ))}
        </div>
      )}

      <div className="card">
        <div className="field">
          <label>اختر المشروع</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: '100%' }}>
            <option value="">
              {loadingProjects ? 'جارِ التحميل...' : '-- اختر مشروعًا --'}
            </option>
            {reminderProjects.length > 0 && (
              <optgroup label="مشاريع فيها عمال ولسه محتاجة إدخال">
                {reminderProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.project_number} — {p.project_name}</option>
                ))}
              </optgroup>
            )}
            <optgroup label="باقي مشاريعي">
              {projects
                .filter((p) => !reminderProjects.some((r) => r.id === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.project_number} — {p.project_name}</option>
                ))}
            </optgroup>
          </select>
        </div>

        {projectId && (
          <div className="field">
            <label>تاريخ التركيب الفعلي</label>
            <input type="date" value={workDate} max={todayStr()} onChange={(e) => setWorkDate(e.target.value)} />
            {workDate !== todayStr() && (
              <p style={{ fontSize: 12, color: 'var(--pending)', marginTop: 4 }}>
                ⚠️ بتسجّل تركيب بتاريخ سابق ({workDate})، مش النهاردة.
              </p>
            )}
          </div>
        )}

        {projectId && (
          <div className="field">
            <label>ابحث عن كود باب</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="مثال: D-101" style={{ width: '100%' }} />
          </div>
        )}
      </div>

      {projectId && (
        <div className="card">
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ marginBottom: 0 }}>ملاحظات اليوم عن المشروع (اختياري)</h2>
            <button className="btn-secondary sm" onClick={() => setNotesOpen((s) => !s)}>
              {notesOpen ? 'إخفاء' : (installNotes || nonExecReason) ? 'عرض' : '+ إضافة'}
            </button>
          </div>
          {notesOpen && (
            <>
              {noteStatus && (
                <div className="alert alert-ok" style={{ marginTop: 10 }}>
                  الحالة: {noteStatus === 'approved' ? 'معتمدة' : noteStatus === 'rejected' ? 'مرفوضة' : 'بانتظار الاعتماد'}
                </div>
              )}
              <div className="field" style={{ marginTop: 10 }}>
                <label>ملاحظات تركيب (أي عمل إضافي تم في المشروع)</label>
                <textarea rows={2} style={{ width: '100%' }} value={installNotes} onChange={(e) => setInstallNotes(e.target.value)} />
              </div>
              <div className="field">
                <label>أسباب عدم التنفيذ (لو حصلت مشكلة منعت التركيب النهاردة)</label>
                <textarea rows={2} style={{ width: '100%' }} value={nonExecReason} onChange={(e) => setNonExecReason(e.target.value)} />
              </div>
              <button className="btn-secondary" disabled={savingNote} onClick={saveNote}>
                {savingNote ? 'جارِ الحفظ...' : 'حفظ الملاحظات'}
              </button>
            </>
          )}
        </div>
      )}

      {projectId && (
        <div className="card">
          {loadingPending ? (
            <p style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>
          ) : groupedByDoor.length === 0 ? (
            <div className="empty-state">
              <div className="icon">✅</div>
              كل البنود في هذا المشروع تم تسجيل تركيبها بالفعل (أو لا يوجد أبواب مطابقة للبحث).
            </div>
          ) : (
            <>
              {visibleDoors.map((d) => {
                const allSelected = d.items.every((it) => selected.has(it.door_item_id))
                return (
                  <div key={d.door_code} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox" className="door-select-all" checked={allSelected}
                        onChange={(e) => toggleDoor(d.items, e.target.checked)}
                      />
                      <strong className="code-cell" style={{ fontSize: 15 }}>{d.door_code}</strong>
                      {d.location && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>({d.location})</span>}
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingRight: 4 }}>
                      {d.items.map((it) => (
                        <label
                          key={it.door_item_id}
                          className={`chip-select ${selected.has(it.door_item_id) ? 'selected' : 'unselected'}`}
                        >
                          <input
                            type="checkbox" checked={selected.has(it.door_item_id)}
                            onChange={() => toggle(it.door_item_id)}
                          />
                          {it.item_type} × {it.quantity}
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
              {groupedByDoor.length > MAX_DOORS_SHOWN && (
                <p style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>
                  بيظهر أول {MAX_DOORS_SHOWN} باب فقط من إجمالي {groupedByDoor.length} — استخدم البحث فوق لتضييق النتائج.
                </p>
              )}

              <div className="sticky-action-bar">
                <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                  {selected.size > 0 ? `تم اختيار ${selected.size} بند` : 'اختر البنود اللي تم تركيبها اليوم'}
                </span>
                <button className="btn-primary" disabled={selected.size === 0 || submitting} onClick={handleSubmit}>
                  {submitting ? 'جارِ الحفظ...' : `تسجيل التركيب (${selected.size})`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <h2>التركيبات المسجّلة اليوم (كل الفريق)</h2>
          {today.length > 0 && (
            <span className="badge badge-ok">
              إجمالي النقاط: {today.reduce((s, r) => s + (Number(r.points_earned) || 0), 0)}
            </span>
          )}
        </div>
        {today.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>لسه معملتش أي تسجيل تركيب النهاردة.</p>
        ) : (
          <table>
            <thead>
              <tr><th>المشروع</th><th>الباب</th><th>البند</th><th>مين دخّله</th><th>النقاط</th><th>الحالة</th><th></th></tr>
            </thead>
            <tbody>
              {today.map((r) => (
                <tr key={r.installation_id}>
                  <td>{r.project_name}</td>
                  <td className="code-cell">{r.door_code}</td>
                  <td>{r.item_type}</td>
                  <td style={{ fontSize: 12.5, color: r.technician_id === profile.id ? 'inherit' : 'var(--muted)' }}>
                    {r.technician_id === profile.id ? 'أنا' : r.technician_name}
                  </td>
                  <td className="code-cell">{r.points_earned}</td>
                  <td>
                    <span className={r.status === 'approved' ? 'badge badge-ok' : 'badge badge-pending'}>
                      {r.status === 'approved' ? 'معتمد' : 'بانتظار الاعتماد'}
                    </span>
                  </td>
                  <td>
                    {r.status === 'pending_review' && r.technician_id === profile.id && (
                      <button className="btn-danger sm" onClick={() => handleUndo(r.installation_id)}>تراجع</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
