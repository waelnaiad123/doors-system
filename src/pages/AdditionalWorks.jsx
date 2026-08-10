import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { useAuth } from '../AuthContext'
import { cairoTodayStr } from '../lib/cairoTime'

export default function AdditionalWorks() {
  const { profile } = useAuth()
  const [todayY, todayM, todayD] = cairoTodayStr().split('-').map(Number)
  const canManageOthers = profile.role === 'admin' || profile.is_installations_manager
  const [engineersList, setEngineersList] = useState([])
  const [selectedEngineerId, setSelectedEngineerId] = useState(profile.role === 'engineer' ? profile.id : '')
  const [year, setYear] = useState(todayY)
  const [month, setMonth] = useState(todayM)
  const [projects, setProjects] = useState([])
  const [rows, setRows] = useState({}) // project_id -> {factory_storage, install_storage, factory_repairs, other_points}
  const [addProjectId, setAddProjectId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const isCurrentOrPastMonth = year < todayY || (year === todayY && month <= todayM)
  const isThisExactMonth = year === todayY && month === todayM
  const canEdit = isCurrentOrPastMonth && (!isThisExactMonth || todayD >= 21)

  useEffect(() => {
    if (canManageOthers) loadEngineersList()
  }, []) // eslint-disable-line
  useEffect(() => { if (selectedEngineerId) loadProjects() }, [selectedEngineerId]) // eslint-disable-line
  useEffect(() => { if (projects.length > 0) loadRows() }, [year, month, projects]) // eslint-disable-line

  async function loadEngineersList() {
    const { data, error } = await supabase.from('profiles').select('id, full_name').eq('role', 'engineer').eq('is_active', true).order('full_name')
    if (error) { setError(error.message); return }
    setEngineersList(data || [])
  }

  async function loadProjects() {
    setLoading(true)
    const { data, error } = await fetchAllRows((from, to) =>
      supabase.from('projects').select('id, project_name, project_number').order('project_name').range(from, to)
    )
    if (error) setError(error.message)
    setProjects(data || [])
    setLoading(false)
  }

  async function loadRows() {
    const { data, error } = await supabase
      .from('additional_works')
      .select('*')
      .eq('engineer_id', selectedEngineerId).eq('year', year).eq('month', month)
    if (error) { setError(error.message); return }
    const map = {}
    ;(data || []).forEach((r) => { map[r.project_id] = r })
    setRows(map)
  }

  async function saveRow(projectId, field, value) {
    if (!canEdit) return
    const num = Number(value)
    if (!Number.isFinite(num) || num < 0) return
    setError(''); setNotice('')
    const current = rows[projectId] || {}
    const payload = {
      project_id: projectId, engineer_id: selectedEngineerId, year, month,
      factory_storage: current.factory_storage || 0,
      install_storage: current.install_storage || 0,
      factory_repairs: current.factory_repairs || 0,
      other_points: current.other_points || 0,
      updated_by: profile.id,
      [field]: num,
    }
    const { error } = await supabase.from('additional_works').upsert(payload, { onConflict: 'project_id,engineer_id,year,month' })
    if (error) { setError(error.message); return }
    setNotice('تم الحفظ.')
    loadRows()
  }

  const activeProjectIds = useMemo(() => Object.keys(rows), [rows])
  const activeProjects = useMemo(
    () => projects.filter((p) => activeProjectIds.includes(p.id)),
    [projects, activeProjectIds]
  )
  const availableToAdd = useMemo(
    () => projects.filter((p) => !activeProjectIds.includes(p.id)),
    [projects, activeProjectIds]
  )

  function addProject() {
    if (!canEdit || !addProjectId) return
    setRows((r) => ({ ...r, [addProjectId]: { factory_storage: 0, install_storage: 0, factory_repairs: 0, other_points: 0 } }))
    setAddProjectId('')
  }

  return (
    <div>
      <h1>بيان الأعمال الإضافية</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}
      {!canEdit && isThisExactMonth && (
        <div className="alert" style={{ background: 'var(--pending-soft)', color: 'var(--pending)' }}>
          بيان هذا الشهر بيتفتح للتسجيل يوم 21 فقط. النهاردة يوم {todayD}.
        </div>
      )}

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {canManageOthers && (
            <div className="field">
              <label>المهندس</label>
              <select value={selectedEngineerId} onChange={(e) => setSelectedEngineerId(e.target.value)}>
                <option value="">-- اختر مهندسًا --</option>
                {engineersList.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>السنة</label>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>الشهر</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!selectedEngineerId ? (
        <div className="card empty-state"><div className="icon">👷</div>اختر مهندسًا الأول عشان تشوف بياناته.</div>
      ) : (
        <>
          <div className="card">
            <div className="field">
              <label>إضافة مشروع للبيان</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={addProjectId} onChange={(e) => setAddProjectId(e.target.value)} style={{ flex: 1 }} disabled={!canEdit}>
                  <option value="">-- اختر مشروعًا --</option>
                  {availableToAdd.map((p) => (
                    <option key={p.id} value={p.id}>{p.project_number} — {p.project_name}</option>
                  ))}
                </select>
                <button className="btn-primary" onClick={addProject} disabled={!canEdit || !addProjectId}>إضافة</button>
              </div>
            </div>
          </div>

          {loading ? (
            <p style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>
          ) : activeProjects.length === 0 ? (
            <div className="card empty-state"><div className="icon">📋</div>لم تُضف أي مشاريع بعد لهذا الشهر.</div>
          ) : (
            <div className="card">
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>المشروع</th><th>تشوين مصنع</th><th>تشوين تركيبات</th><th>إصلاحات على حساب المصنع</th><th>أخرى</th><th>الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeProjects.map((p) => {
                      const r = rows[p.id] || {}
                      const total = (Number(r.factory_storage) || 0) + (Number(r.install_storage) || 0) + (Number(r.factory_repairs) || 0) + (Number(r.other_points) || 0)
                      return (
                        <tr key={p.id}>
                          <td>{p.project_number} — {p.project_name}</td>
                          {['factory_storage', 'install_storage', 'factory_repairs', 'other_points'].map((field) => (
                            <td key={field}>
                              <input
                                type="number" min={0} defaultValue={r[field] || 0} disabled={!canEdit}
                                onBlur={(e) => { if (Number(e.target.value) !== (r[field] || 0)) saveRow(p.id, field, e.target.value) }}
                                style={{ width: 70 }}
                              />
                            </td>
                          ))}
                          <td><strong>{total}</strong></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
