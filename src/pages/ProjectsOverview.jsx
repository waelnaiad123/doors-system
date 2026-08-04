import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { useAuth } from '../AuthContext'
import { ROLES } from '../lib/roles'

const TRACKED_ITEMS = ['حلق', 'صب حلق', 'ضلفة']

function pct(part, total) {
  if (!total) return '—'
  return `${Math.round((part / total) * 100)}%`
}

export default function ProjectsOverview() {
  const { profile } = useAuth()
  const authorized = profile.role === 'admin' || profile.is_installations_manager

  const [projects, setProjects] = useState([])
  const [teams, setTeams] = useState({}) // project_id -> { role: [names] }
  const [totals, setTotals] = useState({}) // project_id -> { itemName: qty }
  const [installed, setInstalled] = useState({}) // project_id -> { itemName: qty }
  const [clientDelivered, setClientDelivered] = useState({})
  const [consultantDelivered, setConsultantDelivered] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { if (authorized) load() }, []) // eslint-disable-line

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { data: projRows, error: e1 } = await fetchAllRows((from, to) =>
        supabase.from('projects').select('id, project_name, project_number').order('project_name').range(from, to)
      )
      if (e1) throw e1
      setProjects(projRows || [])
      const projectIds = (projRows || []).map((p) => p.id)
      if (projectIds.length === 0) { setLoading(false); return }

      // الفريق لكل مشروع
      const { data: assigns, error: e2 } = await fetchAllRows((from, to) =>
        supabase
          .from('project_assignments')
          .select('project_id, role, profiles(full_name)')
          .in('project_id', projectIds).eq('is_active', true)
          .range(from, to)
      )
      if (e2) throw e2
      const teamMap = {}
      ;(assigns || []).forEach((a) => {
        if (!teamMap[a.project_id]) teamMap[a.project_id] = {}
        const name = a.profiles?.full_name
        if (!name) return
        if (!teamMap[a.project_id][a.role]) teamMap[a.project_id][a.role] = []
        if (!teamMap[a.project_id][a.role].includes(name)) teamMap[a.project_id][a.role].push(name)
      })
      setTeams(teamMap)

      // إجمالي البنود المتابَعة لكل مشروع
      const { data: doorsWithItems, error: e3 } = await fetchAllRows((from, to) =>
        supabase
          .from('doors')
          .select('project_id, door_items(quantity, item_types(name))')
          .in('project_id', projectIds)
          .range(from, to)
      )
      if (e3) throw e3
      const totalsMap = {}
      projectIds.forEach((id) => { totalsMap[id] = {} })
      ;(doorsWithItems || []).forEach((d) => {
        ;(d.door_items || []).forEach((it) => {
          const name = it.item_types?.name
          if (!TRACKED_ITEMS.includes(name)) return
          totalsMap[d.project_id][name] = (totalsMap[d.project_id][name] || 0) + Number(it.quantity || 0)
        })
      })
      setTotals(totalsMap)

      // المركّب (معتمد) لكل مشروع
      const { data: installs, error: e4 } = await fetchAllRows((from, to) =>
        supabase
          .from('v_installations_detail')
          .select('project_id, item_type, quantity')
          .in('project_id', projectIds).eq('status', 'approved')
          .range(from, to)
      )
      if (e4) throw e4
      const installedMap = {}
      projectIds.forEach((id) => { installedMap[id] = {} })
      ;(installs || []).forEach((r) => {
        if (!TRACKED_ITEMS.includes(r.item_type)) return
        installedMap[r.project_id][r.item_type] = (installedMap[r.project_id][r.item_type] || 0) + Number(r.quantity || 0)
      })
      setInstalled(installedMap)

      // التسليمات (عميل / استشاري) لكل مشروع
      const { data: deliveries, error: e5 } = await fetchAllRows((from, to) =>
        supabase
          .from('v_deliveries_detail')
          .select('project_id, item_type, quantity, delivery_type')
          .in('project_id', projectIds).eq('status', 'approved')
          .range(from, to)
      )
      if (e5) throw e5
      const clientMap = {}, consultantMap = {}
      projectIds.forEach((id) => { clientMap[id] = {}; consultantMap[id] = {} })
      ;(deliveries || []).forEach((r) => {
        if (!TRACKED_ITEMS.includes(r.item_type)) return
        const target = r.delivery_type === 'client' ? clientMap : consultantMap
        target[r.project_id][r.item_type] = (target[r.project_id][r.item_type] || 0) + Number(r.quantity || 0)
      })
      setClientDelivered(clientMap)
      setConsultantDelivered(consultantMap)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => p.project_name.toLowerCase().includes(q) || p.project_number.toLowerCase().includes(q))
  }, [projects, search])

  if (!authorized) {
    return <div className="alert alert-error">هذه الشاشة متاحة للأدمن أو مدير التركيبات فقط.</div>
  }

  return (
    <div>
      <h1>نظرة عامة على المشاريع</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card no-print">
        <div className="field">
          <label>ابحث عن مشروع</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%' }} />
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>
      ) : (
        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th rowSpan={2}>المشروع</th>
                  <th rowSpan={2}>الفريق</th>
                  {TRACKED_ITEMS.map((item) => <th key={item} colSpan={3}>{item}</th>)}
                </tr>
                <tr>
                  {TRACKED_ITEMS.map((item) => (
                    <React.Fragment key={item}>
                      <th>تركيب</th><th>تسليم عميل</th><th>تسليم استشاري</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((p) => {
                  const team = teams[p.id] || {}
                  const projTotals = totals[p.id] || {}
                  const projInstalled = installed[p.id] || {}
                  const projClient = clientDelivered[p.id] || {}
                  const projConsultant = consultantDelivered[p.id] || {}
                  return (
                    <tr key={p.id}>
                      <td>{p.project_number} — {p.project_name}</td>
                      <td style={{ minWidth: 180 }}>
                        {Object.keys(team).length === 0 ? (
                          <span style={{ color: 'var(--muted)' }}>لا يوجد فريق مخصص</span>
                        ) : (
                          Object.entries(team).map(([role, names]) => (
                            <div key={role} style={{ marginBottom: 2 }}>
                              <strong>{ROLES[role] || role}:</strong> {names.join('، ')}
                            </div>
                          ))
                        )}
                      </td>
                      {TRACKED_ITEMS.map((item) => {
                        const total = projTotals[item] || 0
                        return (
                          <React.Fragment key={item}>
                            <td>{pct(projInstalled[item] || 0, total)}</td>
                            <td>{pct(projClient[item] || 0, total)}</td>
                            <td>{pct(projConsultant[item] || 0, total)}</td>
                          </React.Fragment>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

