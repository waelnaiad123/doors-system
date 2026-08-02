import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { useAuth } from '../AuthContext'

export default function ReminderBanner() {
  const { profile } = useAuth()
  const location = useLocation()
  const [unentered, setUnentered] = useState([])
  const [approvalsCount, setApprovalsCount] = useState(0)
  const [deliveriesCount, setDeliveriesCount] = useState(0)
  const [ready, setReady] = useState(false)

  useEffect(() => { if (profile) load() }, [profile?.id, location.pathname]) // eslint-disable-line

  async function load() {
    try {
      if (['technician', 'supervisor', 'admin'].includes(profile.role)) {
        const { data } = await fetchAllRows((from, to) =>
          supabase.from('v_unentered_workforce').select('*').range(from, to)
        )
        setUnentered(data || [])
      }
      if (['supervisor', 'engineer', 'admin'].includes(profile.role)) {
        const { data } = await fetchAllRows((from, to) =>
          supabase.from('v_installations_detail').select('status, technician_role')
            .in('status', ['pending_review', 'supervisor_approved']).range(from, to)
        )
        const rows = data || []
        const count = profile.role === 'supervisor'
          ? rows.filter((r) => r.status === 'pending_review' && r.technician_role !== 'supervisor').length
          : rows.length
        setApprovalsCount(count)
      }
      if (['engineer', 'admin'].includes(profile.role)) {
        const { data } = await fetchAllRows((from, to) =>
          supabase.from('v_deliveries_detail').select('status').eq('status', 'pending_review').range(from, to)
        )
        setDeliveriesCount((data || []).length)
      }
    } finally {
      setReady(true)
    }
  }

  if (!profile || !ready) return null
  const showEntry = unentered.length > 0
  const showApprovals = approvalsCount > 0
  const showDeliveries = deliveriesCount > 0
  if (!showEntry && !showApprovals && !showDeliveries) return null

  return (
    <div className="reminder-banner">
      {showEntry && (
        <Link to="/technician" className="reminder-line">
          ⚠️ {unentered.length} مشروع فيه عمال ولسه محتاج تسجيل تركيب أو ملاحظة اليوم
        </Link>
      )}
      {showApprovals && (
        <Link to="/approval" className="reminder-line">
          🔔 {approvalsCount} بند تركيب بانتظار اعتمادك
        </Link>
      )}
      {showDeliveries && (
        <Link to="/approval" className="reminder-line">
          🔔 {deliveriesCount} تسليم بانتظار اعتمادك
        </Link>
      )}
    </div>
  )
}
