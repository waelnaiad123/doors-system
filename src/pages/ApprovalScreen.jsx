import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { sortByItemOrder } from '../lib/itemOrder'
import { useAuth } from '../AuthContext'
import ProgressRing from '../components/ProgressRing'
import { cairoTodayStr } from '../lib/cairoTime'

function todayStr() {
  return cairoTodayStr()
}

const STATUS_LABEL = {
  pending_review: 'بانتظار اعتماد المشرف',
  supervisor_approved: 'معتمد من المشرف - بانتظار المهندس',
  approved: 'معتمد نهائيًا',
  rejected: 'مرفوض',
}

// لو المشرف نفسه هو اللي سجّل التركيب، مفيش خطوة "اعتماد مشرف" فعليًا -
// بتروح لاعتماد المهندس مباشرة، فالتسمية لازم توضح ده بدل ما تقول
// "بانتظار اعتماد المشرف" وهو نفسه المشرف اللي مش هيعتمدها.
function installLabel(rec) {
  if (rec.status === 'pending_review' && rec.technician_role === 'supervisor') {
    return 'بانتظار اعتماد المهندس'
  }
  return STATUS_LABEL[rec.status]
}
const STATUS_BADGE = {
  pending_review: 'badge-pending',
  supervisor_approved: 'badge-pending',
  approved: 'badge-ok',
  rejected: 'badge-danger',
}

export default function ApprovalScreen() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const [projectsPending, setProjectsPending] = useState([])
  const [projectId, setProjectId] = useState(searchParams.get('project') || '')
  const [records, setRecords] = useState([])
  const [notes, setNotes] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [summaryView, setSummaryView] = useState('item')
  const [showSummary, setShowSummary] = useState(true)

  function canApprove(rec) {
    if (profile.role === 'admin' || profile.role === 'engineer') return true
    if (profile.role === 'supervisor') return rec.status === 'pending_review' && rec.technician_role !== 'supervisor'
    return false
  }

  useEffect(() => { loadOverview() }, []) // eslint-disable-line
  useEffect(() => { if (projectId) { loadRecords(); loadNotes(); loadDeliveries() } }, [projectId]) // eslint-disable-line

  async function loadOverview() {
    setLoadingOverview(true)
    setError('')
    const { data, error } = await fetchAllRows((from, to) =>
      supabase
        .from('v_installations_detail')
        .select('project_id, project_number, project_name, technician_role, status')
        .in('status', ['pending_review', 'supervisor_approved'])
        .range(from, to)
    )
    if (error) { setError(error.message); setLoadingOverview(false); return }
    const eligible = (data || []).filter(canApprove)
    const m = new Map()
    function ensure(id, number, name) {
      if (!m.has(id)) m.set(id, { project_id: id, project_number: number, project_name: name, installCount: 0, notesCount: 0, deliveryCount: 0 })
      return m.get(id)
    }
    eligible.forEach((r) => { ensure(r.project_id, r.project_number, r.project_name).installCount++ })

    if (profile.role === 'supervisor' || profile.role === 'engineer' || profile.role === 'admin') {
      const { data: pendingNotes } = await fetchAllRows((from, to) =>
        supabase
          .from('daily_project_notes')
          .select('project_id, projects(project_number, project_name)')
          .eq('status', 'pending_review')
          .range(from, to)
      )
      ;(pendingNotes || []).forEach((n) => {
        ensure(n.project_id, n.projects?.project_number, n.projects?.project_name).notesCount++
      })
    }

    // اعتماد التسليمات مقصور على المهندس/الأدمن فقط (زي ما هي محددة في قاعدة
    // البيانات) - من غير الاستعلام ده، مشروع فيه بس تسليم معلّق (من غير تركيب
    // أو ملاحظة معلّقة) كان مستحيل يظهر في القائمة خالص لأي دور، حتى لو كانت
    // شاشة الاعتماد نفسها جاهزة تعتمده لو المشروع اتفتح بطريقة تانية
    if (profile.role === 'engineer' || profile.role === 'admin') {
      const { data: pendingDeliveries } = await fetchAllRows((from, to) =>
        supabase
          .from('v_deliveries_detail')
          .select('project_id, project_number, project_name')
          .eq('status', 'pending_review')
          .range(from, to)
      )
      ;(pendingDeliveries || []).forEach((d) => {
        ensure(d.project_id, d.project_number, d.project_name).deliveryCount++
      })
    }

    const total = (p) => p.installCount + p.notesCount + p.deliveryCount
    const list = Array.from(m.values()).sort((a, b) => total(b) - total(a))
    setProjectsPending(list)
    if (projectId && !list.some((p) => p.project_id === projectId)) setProjectId('')
    setLoadingOverview(false)
  }

  async function loadRecords() {
    setLoadingRecords(true)
    setError('')
    const { data, error } = await fetchAllRows((from, to) =>
      supabase
        .from('v_installations_detail')
        .select('*')
        .eq('project_id', projectId)
        .in('status', ['pending_review', 'supervisor_approved', 'approved'])
        .order('serial')
        .range(from, to)
    )
    if (error) setError(error.message)
    setRecords(data || [])
    setSelected(new Set())
    setLoadingRecords(false)
  }

  async function loadNotes() {
    const { data, error } = await supabase
      .from('daily_project_notes').select('*, profiles!daily_project_notes_created_by_fkey(full_name, role)')
      .eq('project_id', projectId).order('note_date', { ascending: false })
    if (!error) setNotes(data || [])
  }

  async function loadDeliveries() {
    if (profile.role !== 'engineer' && profile.role !== 'admin') { setDeliveries([]); return }
    const { data, error } = await fetchAllRows((from, to) =>
      supabase.from('v_deliveries_detail').select('*').eq('project_id', projectId).eq('status', 'pending_review').range(from, to)
    )
    if (!error) setDeliveries(data || [])
  }

  async function reviewDelivery(id, newStatus) {
    let reason = null
    if (newStatus === 'rejected') reason = window.prompt('سبب الرفض (اختياري):') || null
    setBusy(true)
    setError('')
    const { data, error } = await supabase
      .from('deliveries')
      .update({ status: newStatus, approved_by: profile.id, approved_at: new Date().toISOString(), ...(reason ? { notes: reason } : {}) })
      .eq('id', id)
      .select()
    setBusy(false)
    if (error) { setError(error.message); return }
    if (!data || data.length === 0) { setError('لم يتم تحديث أي بند — تأكد إنك مخصص كمهندس على هذا المشروع.'); return }
    setNotice(newStatus === 'approved' ? 'تم اعتماد التسليم.' : 'تم رفض التسليم.')
    await loadDeliveries()
  }

  async function approveAllDeliveries() {
    if (deliveries.length === 0) return
    setBusy(true)
    setError('')
    try {
      const ids = deliveries.map((d) => d.delivery_id)
      const { data, error } = await supabase
        .from('deliveries')
        .update({ status: 'approved', approved_by: profile.id, approved_at: new Date().toISOString() })
        .in('id', ids)
        .select()
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('لم يتم تحديث أي تسليم — غالبًا إنت مش مخصص كمهندس على هذا المشروع.')
      }
      setNotice(`تم اعتماد ${data.length} تسليم بنجاح.`)
      await Promise.all([loadDeliveries(), loadOverview()])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const pending = useMemo(() => records.filter((r) => r.status === 'pending_review' || r.status === 'supervisor_approved'), [records])
  const eligiblePending = useMemo(() => pending.filter(canApprove), [pending]) // eslint-disable-line
  const groupedByDoor = useMemo(() => {
    const m = new Map()
    pending.forEach((r) => {
      if (!m.has(r.door_code)) m.set(r.door_code, { door_code: r.door_code, items: [] })
      m.get(r.door_code).items.push(r)
    })
    return Array.from(m.values()).map((d) => ({ ...d, items: sortByItemOrder(d.items, (r) => r.item_type) }))
  }, [pending])

  function bucketOf(status) {
    if (status === 'approved') return 'approved'
    if (status === 'supervisor_approved') return 'supervisor_approved'
    return 'pending'
  }

  const summaryByItem = useMemo(() => {
    const m = new Map()
    records.forEach((r) => {
      if (!m.has(r.item_type)) m.set(r.item_type, { key: r.item_type, approved: 0, supervisor_approved: 0, pending: 0 })
      m.get(r.item_type)[bucketOf(r.status)]++
    })
    return sortByItemOrder(Array.from(m.values()), (row) => row.key)
  }, [records])

  const summaryByDoor = useMemo(() => {
    const m = new Map()
    records.forEach((r) => {
      if (!m.has(r.door_code)) m.set(r.door_code, { key: r.door_code, approved: 0, supervisor_approved: 0, pending: 0 })
      m.get(r.door_code)[bucketOf(r.status)]++
    })
    return Array.from(m.values()).sort((a, b) => a.key.localeCompare(b.key))
  }, [records])

  const totalApproved = records.filter((r) => r.status === 'approved').length
  const totalAll = records.length
  const overallPct = totalAll > 0 ? Math.round((100 * totalApproved) / totalAll) : 0
  const totalPoints = records.reduce((s, r) => s + (Number(r.points_earned) || 0), 0)
  const approvedPoints = records.filter((r) => r.status === 'approved').reduce((s, r) => s + (Number(r.points_earned) || 0), 0)

  function toggle(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleDoor(items, checked) {
    const eligible = items.filter(canApprove)
    setSelected((s) => {
      const n = new Set(s)
      eligible.forEach((it) => (checked ? n.add(it.installation_id) : n.delete(it.installation_id)))
      return n
    })
  }

  async function approveIds(ids) {
    if (ids.length === 0) return
    setBusy(true)
    setError('')
    try {
      const nextStatus = profile.role === 'supervisor' ? 'supervisor_approved' : 'approved'
      const { data, error } = await supabase
        .from('installation_records')
        .update({ status: nextStatus, supervisor_id: profile.id, reviewed_at: new Date().toISOString() })
        .in('id', ids)
        .select()
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('لم يتم تحديث أي بند — غالبًا إنت مش مخصص على هذا المشروع بالدور المناسب. راجع "تخصيص المشاريع".')
      }
      setNotice(`تم اعتماد ${data.length} بند بنجاح.`)
      await Promise.all([loadRecords(), loadOverview()])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function reject(id) {
    const reason = window.prompt('سبب الرفض (اختياري):') || null
    setBusy(true)
    setError('')
    const { data, error } = await supabase
      .from('installation_records')
      .update({ status: 'rejected', supervisor_id: profile.id, reviewed_at: new Date().toISOString(), notes: reason })
      .eq('id', id)
      .select()
    setBusy(false)
    if (error) { setError(error.message); return }
    if (!data || data.length === 0) {
      setError('لم يتم تحديث البند — غالبًا إنت مش مخصص على هذا المشروع بالدور المناسب.')
      return
    }
    await Promise.all([loadRecords(), loadOverview()])
  }

  async function reviewNote(note, newStatus, editedText) {
    setBusy(true)
    setError('')
    const payload = {
      status: newStatus, reviewed_by: profile.id, reviewed_at: new Date().toISOString(),
    }
    if (editedText !== undefined) payload.installation_notes = editedText
    const { error } = await supabase.from('daily_project_notes').update(payload).eq('id', note.id)
    setBusy(false)
    if (error) { setError(error.message); return }
    await loadNotes()
  }

  return (
    <div>
      <h1>اعتماد الإدخالات</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {!loadingOverview && projectsPending.length === 0 && (
        <div className="card empty-state">
          <div className="icon">✅</div>
          مفيش أي بند بانتظار اعتمادك حاليًا في أي مشروع. كل حاجة تمام!
        </div>
      )}

      {(loadingOverview || projectsPending.length > 0) && (
        <div className="card">
          <div className="field">
            <label>
              {loadingOverview
                ? 'جارِ التحميل...'
                : `اختر المشروع (${projectsPending.length} مشروع بانتظار اعتمادك)`}
            </label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: '100%' }}>
              <option value="">-- اختر مشروعًا --</option>
              {projectsPending.map((p) => {
                const parts = []
                if (p.installCount > 0) parts.push(`${p.installCount} تركيب`)
                if (p.notesCount > 0) parts.push(`${p.notesCount} ملاحظة`)
                if (p.deliveryCount > 0) parts.push(`${p.deliveryCount} تسليم`)
                return (
                  <option key={p.project_id} value={p.project_id}>
                    {p.project_number} — {p.project_name} ({parts.join('، ')})
                  </option>
                )
              })}
            </select>
          </div>
        </div>
      )}

      {projectId && !loadingRecords && (
        <div className="card">
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <h2>ملخص المشروع</h2>
            <button className="btn-secondary sm" onClick={() => setShowSummary((s) => !s)}>
              {showSummary ? 'إخفاء' : 'إظهار'}
            </button>
          </div>
          {showSummary && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <ProgressRing percent={overallPct} size={56} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{totalApproved} من {totalAll} بند معتمد نهائيًا</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{pending.length} بند لسه محتاج اعتماد</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>النقاط: {approvedPoints} معتمدة من {totalPoints} إجمالي</div>
                </div>
              </div>
              <div className="toolbar">
                <button className={summaryView === 'item' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setSummaryView('item')}>حسب البند</button>
                <button className={summaryView === 'door' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setSummaryView('door')}>حسب الباب</button>
              </div>
              <div style={{ maxHeight: 220, overflow: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{summaryView === 'item' ? 'البند' : 'الباب'}</th>
                      <th>معتمد نهائيًا</th><th>معتمد من المشرف</th><th>بانتظار</th><th>إجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summaryView === 'item' ? summaryByItem : summaryByDoor).map((row) => (
                      <tr key={row.key}>
                        <td className={summaryView === 'door' ? 'code-cell' : ''}>{row.key}</td>
                        <td>{row.approved}</td><td>{row.supervisor_approved}</td><td>{row.pending}</td>
                        <td>{row.approved + row.supervisor_approved + row.pending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {projectId && (
        <div className="card">
          {loadingRecords ? (
            <p style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>
          ) : pending.length === 0 ? (
            <div className="empty-state"><div className="icon">✅</div>مفيش بنود بانتظار الاعتماد في هذا المشروع حاليًا.</div>
          ) : (
            <>
              <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                <h2>بانتظار الاعتماد ({pending.length})</h2>
                <button className="btn-primary" disabled={busy || eligiblePending.length === 0}
                  onClick={() => approveIds(eligiblePending.map((r) => r.installation_id))}>
                  اعتماد كل الظاهر في المشروع ({eligiblePending.length})
                </button>
              </div>
              {groupedByDoor.map((d) => {
                const eligibleItems = d.items.filter(canApprove)
                const allSelected = eligibleItems.length > 0 && eligibleItems.every((it) => selected.has(it.installation_id))
                return (
                  <div key={d.door_code} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
                    <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: eligibleItems.length ? 'pointer' : 'default' }}>
                        <input
                          type="checkbox" className="door-select-all" checked={allSelected}
                          disabled={eligibleItems.length === 0}
                          onChange={(e) => toggleDoor(d.items, e.target.checked)}
                        />
                        <strong className="code-cell" style={{ fontSize: 15 }}>{d.door_code}</strong>
                      </label>
                      {eligibleItems.length > 0 && (
                        <button className="btn-ok sm" disabled={busy}
                          onClick={() => approveIds(eligibleItems.map((it) => it.installation_id))}>
                          اعتماد الباب بالكامل ({eligibleItems.length})
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {d.items.map((r) => {
                        const eligible = canApprove(r)
                        return (
                          <div key={r.installation_id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                              background: selected.has(r.installation_id) ? 'var(--pending-soft)' : 'var(--bg)',
                            }}>
                            {eligible ? (
                              <input type="checkbox" checked={selected.has(r.installation_id)}
                                onChange={() => toggle(r.installation_id)} style={{ width: 20, height: 20, flexShrink: 0 }} />
                            ) : (
                              <span title="يحتاج اعتماد مهندس" style={{ flexShrink: 0 }}>🔒</span>
                            )}
                            <span style={{ flex: 1, fontSize: 14 }}>{r.item_type} × {r.quantity}</span>
                            <span
                              className="badge code-cell"
                              style={{
                                fontSize: 11,
                                background: r.installed_at === todayStr() ? 'var(--empty-soft)' : 'var(--pending-soft)',
                                color: r.installed_at === todayStr() ? 'var(--muted)' : 'var(--pending)',
                                fontWeight: r.installed_at === todayStr() ? 400 : 700,
                              }}
                            >
                              {r.installed_at === todayStr() ? 'اليوم' : r.installed_at}
                            </span>
                            <span className={`badge ${STATUS_BADGE[r.status]}`} style={{ fontSize: 11 }}>{installLabel(r)}</span>
                            <span className="badge badge-empty" style={{ fontSize: 11 }}>{r.points_earned} نقطة</span>
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.technician_name}</span>
                            {eligible && (
                              <>
                                <button className="btn-ok sm" disabled={busy} onClick={() => approveIds([r.installation_id])}>اعتماد</button>
                                <button className="btn-danger sm" disabled={busy} onClick={() => reject(r.installation_id)}>رفض</button>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              <div className="sticky-action-bar">
                <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                  {selected.size > 0 ? `تم اختيار ${selected.size} بند` : 'اختر بنود للاعتماد المُجمّع'}
                </span>
                <button className="btn-primary" disabled={selected.size === 0 || busy}
                  onClick={() => approveIds(Array.from(selected))}>
                  اعتماد المحدد ({selected.size})
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {projectId && notes.length > 0 && (
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>ملاحظات وأسباب عدم التنفيذ اليومية</h2>
          {notes.map((n) => (
            <NoteRow key={n.id} note={n} busy={busy} onReview={reviewNote} currentUserId={profile.id} />
          ))}
        </div>
      )}

      {projectId && deliveries.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <h2 style={{ marginBottom: 0 }}>تسليمات بانتظار الاعتماد ({deliveries.length})</h2>
            <button className="btn-primary" disabled={busy} onClick={approveAllDeliveries}>
              اعتماد كل التسليمات الظاهرة ({deliveries.length})
            </button>
          </div>
          {deliveries.map((d) => (
            <div key={d.delivery_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--bg)', marginBottom: 6, flexWrap: 'wrap' }}>
              <span className="code-cell">{d.door_code}</span>
              <span style={{ flex: 1, fontSize: 14 }}>{d.item_type} × {d.quantity}</span>
              <span style={{ fontSize: 12.5 }}>
                {d.delivery_type === 'client' ? `عميل — ${d.client_delivery_date}` : `استشاري — ${d.consultant_wir_code}`}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{d.delivered_by_name}</span>
              <button className="btn-ok sm" disabled={busy} onClick={() => reviewDelivery(d.delivery_id, 'approved')}>اعتماد</button>
              <button className="btn-danger sm" disabled={busy} onClick={() => reviewDelivery(d.delivery_id, 'rejected')}>رفض</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NoteRow({ note, busy, onReview, currentUserId }) {
  const [text, setText] = useState(note.installation_notes || '')
  const [editing, setEditing] = useState(false)
  const isOwnNote = note.created_by === currentUserId

  function statusLabel() {
    if (note.status === 'pending_review') {
      return note.profiles?.role === 'supervisor' ? 'بانتظار اعتماد المهندس' : 'بانتظار اعتماد المشرف أو المهندس'
    }
    return STATUS_LABEL[note.status]
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
      <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13 }}>
          <span className="code-cell">{note.note_date}</span> — {note.profiles?.full_name || '—'}
        </span>
        <span className={`badge ${STATUS_BADGE[note.status]}`}>{statusLabel()}</span>
      </div>
      {note.non_execution_reason && (
        <div style={{ fontSize: 13.5, marginBottom: 6 }}>
          <strong>سبب عدم التنفيذ: </strong>{note.non_execution_reason}
        </div>
      )}
      {note.installation_notes && !editing && (
        <div style={{ fontSize: 13.5, marginBottom: 6 }}>
          <strong>ملاحظات: </strong>{note.installation_notes}
        </div>
      )}
      {editing && (
        <textarea rows={2} style={{ width: '100%', marginBottom: 6 }} value={text} onChange={(e) => setText(e.target.value)} />
      )}
      {note.status === 'pending_review' && !isOwnNote && (
        <div className="toolbar">
          {!editing ? (
            <button className="btn-secondary sm" onClick={() => setEditing(true)}>تعديل الصياغة</button>
          ) : (
            <button className="btn-secondary sm" disabled={busy} onClick={() => { onReview(note, 'pending_review', text); setEditing(false) }}>حفظ التعديل</button>
          )}
          <button className="btn-ok sm" disabled={busy} onClick={() => onReview(note, 'approved', editing ? text : undefined)}>اعتماد</button>
          <button className="btn-danger sm" disabled={busy} onClick={() => onReview(note, 'rejected', undefined)}>رفض</button>
        </div>
      )}
    </div>
  )
}
