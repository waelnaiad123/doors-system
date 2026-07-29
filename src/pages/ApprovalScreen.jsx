import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { useAuth } from '../AuthContext'
import ProgressRing from '../components/ProgressRing'

export default function ApprovalScreen() {
  const { profile } = useAuth()
  const [projectsPending, setProjectsPending] = useState([])
  const [projectId, setProjectId] = useState('')
  const [records, setRecords] = useState([])
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
    if (profile.role === 'supervisor') return rec.technician_role !== 'supervisor'
    return false
  }

  useEffect(() => { loadOverview() }, []) // eslint-disable-line
  useEffect(() => { if (projectId) loadRecords() }, [projectId]) // eslint-disable-line

  async function loadOverview() {
    setLoadingOverview(true)
    setError('')
    const { data, error } = await fetchAllRows((from, to) =>
      supabase
        .from('v_installations_detail')
        .select('project_id, project_number, project_name, technician_role, status')
        .eq('status', 'pending_review')
        .range(from, to)
    )
    if (error) { setError(error.message); setLoadingOverview(false); return }
    const eligible = (data || []).filter(canApprove)
    const m = new Map()
    eligible.forEach((r) => {
      if (!m.has(r.project_id)) m.set(r.project_id, { project_id: r.project_id, project_number: r.project_number, project_name: r.project_name, count: 0 })
      m.get(r.project_id).count++
    })
    const list = Array.from(m.values()).sort((a, b) => b.count - a.count)
    setProjectsPending(list)
    // لو المشروع المفتوح حاليًا ما بقاش محتاج اعتماد (خلصنا كل حاجة فيه)، اقفله
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
        .in('status', ['pending_review', 'approved'])
        .order('door_code')
        .range(from, to)
    )
    if (error) setError(error.message)
    setRecords(data || [])
    setSelected(new Set())
    setLoadingRecords(false)
  }

  const pending = useMemo(() => records.filter((r) => r.status === 'pending_review'), [records])
  const eligiblePending = useMemo(() => pending.filter(canApprove), [pending]) // eslint-disable-line

  const groupedByDoor = useMemo(() => {
    const m = new Map()
    pending.forEach((r) => {
      if (!m.has(r.door_code)) m.set(r.door_code, { door_code: r.door_code, items: [] })
      m.get(r.door_code).items.push(r)
    })
    return Array.from(m.values())
  }, [pending])

  const summaryByItem = useMemo(() => {
    const m = new Map()
    records.forEach((r) => {
      if (!m.has(r.item_type)) m.set(r.item_type, { key: r.item_type, approved: 0, pending: 0 })
      const row = m.get(r.item_type)
      r.status === 'approved' ? row.approved++ : row.pending++
    })
    return Array.from(m.values()).sort((a, b) => a.key.localeCompare(b.key, 'ar'))
  }, [records])

  const summaryByDoor = useMemo(() => {
    const m = new Map()
    records.forEach((r) => {
      if (!m.has(r.door_code)) m.set(r.door_code, { key: r.door_code, approved: 0, pending: 0 })
      const row = m.get(r.door_code)
      r.status === 'approved' ? row.approved++ : row.pending++
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
      const { error } = await supabase
        .from('installation_records')
        .update({ status: 'approved', supervisor_id: profile.id, reviewed_at: new Date().toISOString() })
        .in('id', ids)
      if (error) throw error
      setNotice(`تم اعتماد ${ids.length} بند بنجاح.`)
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
    const { error } = await supabase
      .from('installation_records')
      .update({ status: 'rejected', supervisor_id: profile.id, reviewed_at: new Date().toISOString(), notes: reason })
      .eq('id', id)
    setBusy(false)
    if (error) { setError(error.message); return }
    await Promise.all([loadRecords(), loadOverview()])
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
              {projectsPending.map((p) => (
                <option key={p.project_id} value={p.project_id}>
                  {p.project_number} — {p.project_name} ({p.count} بند)
                </option>
              ))}
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
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{totalApproved} من {totalAll} بند معتمد</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{pending.length} بند بانتظار الاعتماد</div>
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
                      <th>معتمد</th><th>بانتظار</th><th>إجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summaryView === 'item' ? summaryByItem : summaryByDoor).map((row) => (
                      <tr key={row.key}>
                        <td className={summaryView === 'door' ? 'code-cell' : ''}>{row.key}</td>
                        <td>{row.approved}</td><td>{row.pending}</td><td>{row.approved + row.pending}</td>
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
    </div>
  )
}
