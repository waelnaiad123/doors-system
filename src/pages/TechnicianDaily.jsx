import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { sortByItemOrder } from '../lib/itemOrder'
import { useAuth } from '../AuthContext'
import { cairoTodayStr, cairoHour } from '../lib/cairoTime'

function todayStr() {
  return cairoTodayStr()
}

// النهاردة تفضل متاحة للاختيار لحد الساعة 8 بالليل، حتى لو اتسجل عليها تركيب جزئي بالفعل
function isTodayStillOpen() {
  return cairoHour() < 20
}

export default function TechnicianDaily() {
  const { profile } = useAuth()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [eligibleDates, setEligibleDates] = useState([])
  const [loadingDates, setLoadingDates] = useState(false)
  const [workDate, setWorkDate] = useState('')
  const [today, setToday] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingPending, setLoadingPending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [workforceToday, setWorkforceToday] = useState([])
  const [untouchedProjectIds, setUntouchedProjectIds] = useState(new Set())
  const [notesToday, setNotesToday] = useState([])
  const [installNotes, setInstallNotes] = useState('')
  const [nonExecReason, setNonExecReason] = useState('')
  const [noteStatus, setNoteStatus] = useState(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [savingNote, setSavingNote] = useState(false)

  useEffect(() => { loadProjects() }, []) // eslint-disable-line
  useEffect(() => { if (projects.length > 0) { loadWorkforceReminder(); loadToday(); loadUntouchedProjects() } }, [projects]) // eslint-disable-line
  useEffect(() => { if (projectId) { loadPending(); loadEligibleDates() } }, [projectId, search]) // eslint-disable-line
  useEffect(() => { if (projectId) loadNote() }, [projectId, workDate]) // eslint-disable-line

  async function loadUntouchedProjects() {
    const projectIds = projects.map((p) => p.id)
    if (projectIds.length === 0) { setUntouchedProjectIds(new Set()); return }
    const { data, error } = await fetchAllRows((from, to) =>
      supabase.from('v_installations_detail').select('project_id').in('project_id', projectIds).range(from, to)
    )
    if (error) { setError(error.message); return }
    const touched = new Set((data || []).map((r) => r.project_id))
    setUntouchedProjectIds(new Set(projectIds.filter((id) => !touched.has(id))))
  }

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

  // التواريخ المسموح تختارها لتسجيل التركيب: أي يوم فيه حصر أفراد ولسه معندوش أي
  // تركيب متسجل خالص، بالإضافة للنهاردة تحديدًا (تفضل متاحة لحد الساعة 8 مساءً
  // حتى لو فيها تركيب جزئي متسجل بالفعل، عشان يقدر يكمل باقي شغل اليوم).
  async function loadEligibleDates() {
    setLoadingDates(true)
    setError('')
    const { data: wfRows, error: wfErr } = await fetchAllRows((from, to) =>
      supabase.from('daily_workforce').select('work_date').eq('project_id', projectId).gt('headcount', 0).range(from, to)
    )
    if (wfErr) { setError(wfErr.message); setLoadingDates(false); return }
    // نجيب تواريخ التركيب المسجّلة فعليًا على هذا المشروع تحديدًا (أي حالة، حتى المعلّق يكفي إنه "متسجل")
    const { data: instForProject, error: instProjErr } = await fetchAllRows((from, to) =>
      supabase.from('v_installations_detail').select('installed_at').eq('project_id', projectId).range(from, to)
    )
    if (instProjErr) { setError(instProjErr.message); setLoadingDates(false); return }

    const installedDates = new Set((instForProject || []).map((r) => r.installed_at))
    const workforceDates = [...new Set((wfRows || []).map((r) => r.work_date))]
    const today_ = todayStr()

    const eligible = workforceDates.filter((d) => {
      if (d === today_) return !installedDates.has(d) || isTodayStillOpen()
      return !installedDates.has(d)
    }).sort((a, b) => b.localeCompare(a)) // الأحدث فوق

    setEligibleDates(eligible)
    setWorkDate((prev) => {
      if (prev && eligible.includes(prev)) return prev
      if (eligible.includes(today_)) return today_
      return eligible[0] || ''
    })
    setLoadingDates(false)
  }

  async function loadNote() {
    if (!workDate) return
    const { data, error } = await supabase
      .from('daily_project_notes').select('*')
      .eq('project_id', projectId).eq('note_date', workDate).eq('created_by', profile.id)
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
        project_id: projectId, note_date: workDate, created_by: profile.id,
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

  const untouchedProjects = useMemo(() => {
    return projects.filter((p) => untouchedProjectIds.has(p.id) && !reminderProjects.some((r) => r.id === p.id))
  }, [projects, untouchedProjectIds, reminderProjects])

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
    if (!workDate) { setError('اختر تاريخ التركيب الأول'); return }
    setSubmitting(true)
    setError('')
    try {
      const rows = Array.from(selected).map((id) => ({
        door_item_id: id, technician_id: profile.id, installed_at: workDate, status: 'pending_review',
      }))
      const { error } = await supabase.from('installation_records').insert(rows)
      if (error) throw error
      // لو المسجّل مشرف، اعتماده بيروح للمهندس مباشرة (مش لمشرف زميله) - installation_required_approver_roles
      const nextApprover = profile.role === 'supervisor' ? 'المهندس' : 'المشرف'
      setNotice(`تم تسجيل ${rows.length} بند بنجاح بتاريخ ${workDate}، بانتظار اعتماد ${nextApprover}.`)
      await Promise.all([loadPending(), loadToday(), loadWorkforceReminder(), loadEligibleDates()])
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
    await Promise.all([loadPending(), loadToday(), loadWorkforceReminder(), loadEligibleDates()])
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
            <optgroup label="مشاريع جديدة لسه معملتش فيها تركيب خالص">
              {untouchedProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.project_number} — {p.project_name}</option>
              ))}
            </optgroup>
          </select>
          {reminderProjects.length === 0 && untouchedProjects.length === 0 && !loadingProjects && (
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6 }}>
              مفيش مشروع متاح للتسجيل دلوقتي. لازم يبقى فيه حصر أفراد النهاردة على المشروع الأول، أو يكون مشروع جديد لسه معملتش فيه تركيب خالص.
            </p>
          )}
        </div>

        {projectId && (
          <div className="field">
            <label>تاريخ التركيب</label>
            {loadingDates ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>جارِ تجهيز التواريخ المتاحة...</p>
            ) : eligibleDates.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--danger)' }}>
                مفيش تاريخ متاح للتسجيل حاليًا على هذا المشروع (لازم يبقى فيه حصر أفراد أولًا، أو النهاردة قفلت بعد الساعة 8).
              </p>
            ) : (
              <select value={workDate} onChange={(e) => setWorkDate(e.target.value)} style={{ width: '100%' }}>
                {eligibleDates.map((d) => (
                  <option key={d} value={d}>{d === todayStr() ? `${d} (النهاردة)` : d}</option>
                ))}
              </select>
            )}
            {workDate && workDate !== todayStr() && (
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

      {projectId && workDate && (
        <div className="card">
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ marginBottom: 0 }}>ملاحظات يوم {workDate} عن المشروع (اختياري)</h2>
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
                <label>أسباب عدم التنفيذ (لو حصلت مشكلة منعت التركيب في هذا اليوم)</label>
                <textarea rows={2} style={{ width: '100%' }} value={nonExecReason} onChange={(e) => setNonExecReason(e.target.value)} />
              </div>
              <button className="btn-secondary" disabled={savingNote} onClick={saveNote}>
                {savingNote ? 'جارِ الحفظ...' : 'حفظ الملاحظات'}
              </button>
            </>
          )}
        </div>
      )}

      {projectId && workDate && (
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
                  {selected.size > 0 ? `تم اختيار ${selected.size} بند` : 'اختر البنود اللي تم تركيبها'}
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
