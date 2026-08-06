import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { useAuth } from '../AuthContext'
import { ROLES, ROLE_LIST } from '../lib/roles'

export default function ProjectAssignments() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState(searchParams.get('project') || '')
  const [assignments, setAssignments] = useState([])
  const [profiles, setProfiles] = useState([])
  const [doors, setDoors] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const allowedRoles = useMemo(() => {
    if (profile.role === 'admin' || profile.is_installations_manager) return ROLE_LIST.filter((r) => r !== 'admin')
    if (profile.role === 'data_entry') return ['engineer']
    if (profile.role === 'engineer') return ['technician', 'supervisor', 'delivery_entry']
    return []
  }, [profile.role, profile.is_installations_manager])

  const [newUserId, setNewUserId] = useState('')
  const [newRole, setNewRole] = useState(profile.role === 'data_entry' ? 'engineer' : 'technician')
  const [scopeMode, setScopeMode] = useState('whole')
  const [doorSearch, setDoorSearch] = useState('')
  const [selectedDoors, setSelectedDoors] = useState(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadProjects(); loadProfiles() }, [])
  useEffect(() => { if (projectId) { loadAssignments(); loadDoors() } }, [projectId]) // eslint-disable-line

  async function loadProjects() {
    const { data, error } = await fetchAllRows((from, to) =>
      supabase.from('projects').select('id, project_name, project_number').order('project_name').range(from, to)
    )
    if (error) setError(error.message)
    setProjects(data || [])
  }

  async function loadProfiles() {
    const { data, error } = await supabase.from('profiles').select('id, full_name, role, is_active').order('full_name')
    if (error) setError(error.message)
    setProfiles(data || [])
  }

  async function loadDoors() {
    const { data } = await fetchAllRows((from, to) =>
      supabase.from('doors').select('id, door_code').eq('project_id', projectId).order('door_code').range(from, to)
    )
    setDoors(data || [])
  }

  async function loadAssignments() {
    setError('')
    const { data: aData, error: aErr } = await supabase
      .from('project_assignments').select('*').eq('project_id', projectId).order('assigned_at', { ascending: false })
    if (aErr) { setError(aErr.message); return }
    const ids = (aData || []).map((a) => a.id)
    let scopeMap = new Map()
    if (ids.length > 0) {
      const { data: adData, error: adErr } = await supabase.from('project_assignment_doors').select('assignment_id, door_id').in('assignment_id', ids)
      if (adErr) { setError(adErr.message); return }
      ;(adData || []).forEach((row) => {
        if (!scopeMap.has(row.assignment_id)) scopeMap.set(row.assignment_id, [])
        scopeMap.get(row.assignment_id).push(row.door_id)
      })
    }
    setAssignments((aData || []).map((a) => ({ ...a, doorIds: scopeMap.get(a.id) || [] })))
  }

  const matchedDoors = useMemo(() => (
    doorSearch.trim()
      ? doors.filter((d) => d.door_code.toLowerCase().includes(doorSearch.toLowerCase()))
      : doors
  ), [doors, doorSearch])
  const filteredDoors = useMemo(() => matchedDoors.slice(0, 100), [matchedDoors])

  function toggleDoorSel(id) {
    setSelectedDoors((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function roleCompatible(userBaseRole, assignmentRole) {
    if (userBaseRole === assignmentRole) return true
    if (userBaseRole === 'data_entry' && assignmentRole === 'delivery_entry') return true
    return false
  }

  async function handleAssign(e) {
    e.preventDefault()
    setError('')
    if (!newUserId) { setError('اختر مستخدمًا'); return }
    if (scopeMode === 'doors' && selectedDoors.size === 0) { setError('اختر بابًا واحدًا على الأقل، أو اختر "كل المشروع"'); return }

    const chosenUser = profiles.find((p) => p.id === newUserId)
    if (chosenUser && !roleCompatible(chosenUser.role, newRole)) {
      setError(`${chosenUser.full_name} دوره الأساسي "${ROLES[chosenUser.role]}"، ومينفعش يتخصص بدور "${ROLES[newRole]}".`)
      return
    }

    const duplicate = assignments.find((a) => a.is_active && a.user_id === newUserId && a.role === newRole)
    if (duplicate) {
      const ok = window.confirm('المستخدم ده مخصص بالفعل بنفس الدور على هذا المشروع. عايز تضيف تخصيص تاني (مثلاً لأبواب مختلفة)؟')
      if (!ok) return
    }

    setSaving(true)
    try {
      const { data: assignment, error: aErr } = await supabase
        .from('project_assignments')
        .insert({ project_id: projectId, user_id: newUserId, role: newRole, assigned_by: profile.id })
        .select().single()
      if (aErr) throw aErr
      if (scopeMode === 'doors') {
        const rows = Array.from(selectedDoors).map((door_id) => ({ assignment_id: assignment.id, door_id }))
        const { error: dErr } = await supabase.from('project_assignment_doors').insert(rows)
        if (dErr) throw dErr
      }
      setNotice('تم التخصيص بنجاح.')
      setNewUserId(''); setSelectedDoors(new Set()); setScopeMode('whole'); setDoorSearch('')
      await loadAssignments()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleEnd(id) {
    setError('')
    const { error } = await supabase
      .from('project_assignments')
      .update({ is_active: false, unassigned_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { setError(error.message); return }
    await loadAssignments()
  }

  return (
    <div>
      <h1>تخصيص المشاريع</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="card">
        <div className="field">
          <label>اختر المشروع</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: '100%' }}>
            <option value="">-- اختر مشروعًا --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.project_number} — {p.project_name}</option>
            ))}
          </select>
        </div>
      </div>

      {projectId && (
        <>
          <form className="card" onSubmit={handleAssign}>
            <h2 style={{ marginBottom: 12 }}>تخصيص جديد</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>المستخدم</label>
                <select value={newUserId} onChange={(e) => setNewUserId(e.target.value)}>
                  <option value="">اختر...</option>
                  {profiles
                    .filter((p) => p.is_active)
                    .filter((p) => roleCompatible(p.role, newRole))
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name} ({ROLES[p.role]})</option>
                    ))}
                </select>
              </div>
              <div className="field">
                <label>الدور في هذا المشروع</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  {allowedRoles.map((r) => (
                    <option key={r} value={r}>{ROLES[r]}</option>
                  ))}
                </select>
                {profile.role === 'data_entry' && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    تقدر تخصص مهندس (أو أكتر من مهندس) للمشروع بس. المهندس بعدها يقدر يخصص باقي الفنيين والمشرفين.
                  </p>
                )}
                {profile.role === 'engineer' && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    تقدر تخصص فني، مشرف، أو مدخل بيانات تسليمات على المشروع ده.
                  </p>
                )}
              </div>
            </div>

            <div className="field">
              <label>النطاق</label>
              <div className="toolbar">
                <button type="button" className={scopeMode === 'whole' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setScopeMode('whole')}>كل المشروع</button>
                <button type="button" className={scopeMode === 'doors' ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setScopeMode('doors')}>أبواب محددة</button>
              </div>
            </div>

            {scopeMode === 'doors' && (
              <div className="field">
                <input placeholder="ابحث عن كود باب..." value={doorSearch}
                  onChange={(e) => setDoorSearch(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
                <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                  {filteredDoors.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>لا توجد أبواب مطابقة.</p>}
                  {matchedDoors.length > 100 && (
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                      ظاهر أول 100 باب بس من {matchedDoors.length} مطابق. ضيّق البحث عشان تشوف الباقي.
                    </p>
                  )}
                  {filteredDoors.map((d) => (
                    <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px' }}>
                      <input type="checkbox" checked={selectedDoors.has(d.id)} onChange={() => toggleDoorSel(d.id)} style={{ width: 20, height: 20 }} />
                      <span className="code-cell">{d.door_code}</span>
                    </label>
                  ))}
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>{selectedDoors.size} باب محدد</p>
              </div>
            )}

            <button className="btn-primary" disabled={saving}>{saving ? 'جارِ الحفظ...' : 'تخصيص'}</button>
          </form>

          <div className="card">
            <h2 style={{ marginBottom: 12 }}>التخصيصات الحالية والسابقة</h2>
            {assignments.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>لا يوجد أي تخصيص على هذا المشروع بعد.</p>
            ) : (
              <table>
                <thead><tr><th>المستخدم</th><th>الدور</th><th>النطاق</th><th>الحالة</th><th></th></tr></thead>
                <tbody>
                  {assignments.map((a) => {
                    const prof = profiles.find((p) => p.id === a.user_id)
                    const doorCodes = a.doorIds.length
                      ? doors.filter((d) => a.doorIds.includes(d.id)).map((d) => d.door_code).join('، ')
                      : 'كل المشروع'
                    return (
                      <tr key={a.id}>
                        <td>{prof?.full_name || '—'}</td>
                        <td>{ROLES[a.role]}</td>
                        <td style={{ fontSize: 12.5 }}>{doorCodes}</td>
                        <td>{a.is_active ? <span className="badge badge-ok">نشط</span> : <span className="badge badge-empty">منتهي</span>}</td>
                        <td>{a.is_active && <button className="btn-danger sm" onClick={() => handleEnd(a.id)}>إنهاء</button>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
