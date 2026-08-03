import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { useAuth } from '../AuthContext'

export default function AdminProductivitySummary() {
  const { profile } = useAuth()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [rows, setRows] = useState([])
  const [addWorks, setAddWorks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const authorized = profile.role === 'admin' || profile.is_installations_manager

  useEffect(() => { if (authorized) load() }, [year, month]) // eslint-disable-line

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { data: prodRows, error: e1 } = await fetchAllRows((from, to) =>
        supabase
          .from('monthly_productivity')
          .select('engineer_id, project_id, month_points, current_points, profiles!monthly_productivity_engineer_id_fkey(full_name), projects(project_name, project_number)')
          .eq('year', year).eq('month', month)
          .range(from, to)
      )
      if (e1) throw e1
      setRows(prodRows || [])

      const { data: addRows, error: e2 } = await fetchAllRows((from, to) =>
        supabase
          .from('additional_works')
          .select('engineer_id, factory_storage, install_storage, factory_repairs, other_points, profiles!additional_works_engineer_id_fkey(full_name)')
          .eq('year', year).eq('month', month)
          .range(from, to)
      )
      if (e2) throw e2
      setAddWorks(addRows || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const perEngineer = useMemo(() => {
    const m = new Map()
    rows.forEach((r) => {
      const name = r.profiles?.full_name || '—'
      if (!m.has(r.engineer_id)) m.set(r.engineer_id, { name, monthPoints: 0, projectCount: 0, additionalPoints: 0 })
      const e = m.get(r.engineer_id)
      e.monthPoints += Number(r.month_points) || 0
      e.projectCount += 1
    })
    addWorks.forEach((r) => {
      const total = (Number(r.factory_storage) || 0) + (Number(r.install_storage) || 0)
        + (Number(r.factory_repairs) || 0) + (Number(r.other_points) || 0)
      const name = r.profiles?.full_name || '—'
      if (!m.has(r.engineer_id)) m.set(r.engineer_id, { name, monthPoints: 0, projectCount: 0, additionalPoints: 0 })
      m.get(r.engineer_id).additionalPoints += total
    })
    return Array.from(m.values()).sort((a, b) => b.monthPoints - a.monthPoints)
  }, [rows, addWorks])

  const grandTotalPoints = perEngineer.reduce((s, e) => s + e.monthPoints, 0)
  const grandTotalAdditional = perEngineer.reduce((s, e) => s + e.additionalPoints, 0)

  return (
    <div>
      <h1>ملخص إنتاجية المهندسين</h1>
      {!authorized ? (
        <div className="alert alert-error">هذه الشاشة متاحة للأدمن أو مدير التركيبات فقط.</div>
      ) : (
        <>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
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

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>
      ) : perEngineer.length === 0 ? (
        <div className="card empty-state"><div className="icon">📋</div>لا توجد تقارير مُسجّلة لهذا الشهر بعد.</div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
            <span className="badge badge-ok">إجمالي نقاط كل المهندسين: {Math.round(grandTotalPoints)}</span>
            <span className="badge badge-pending">إجمالي الأعمال الإضافية: {Math.round(grandTotalAdditional)}</span>
          </div>
          <table>
            <thead>
              <tr><th>المهندس</th><th>عدد المشاريع</th><th>نقاط منفذة خلال الشهر</th><th>نقاط أعمال إضافية</th><th>الإجمالي</th></tr>
            </thead>
            <tbody>
              {perEngineer.map((e) => (
                <tr key={e.name}>
                  <td>{e.name}</td>
                  <td>{e.projectCount}</td>
                  <td>{Math.round(e.monthPoints)}</td>
                  <td>{Math.round(e.additionalPoints)}</td>
                  <td><strong>{Math.round(e.monthPoints + e.additionalPoints)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}
    </div>
  )
}
