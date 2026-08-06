import React, { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { ROLES } from '../lib/roles'
import { supabase } from '../lib/supabaseClient'
import ReminderBanner from './ReminderBanner'

const NAV_BY_ROLE = {
  admin: [
    { to: '/dashboard', label: 'الرئيسية' },
    { to: '/projects', label: 'المشاريع' },
    { to: '/assignments', label: 'تخصيص المشاريع' },
    { to: '/users', label: 'المستخدمون' },
    { to: '/backup', label: 'نسخة احتياطية' },
    { to: '/technician', label: 'تسجيل تركيب' },
    { to: '/workforce', label: 'حصر الأفراد' },
    { to: '/approval', label: 'اعتماد الإدخالات' },
    { to: '/delivery', label: 'التسليمات' },
    { to: '/project-status', label: 'موقف مشروع' },
    { to: '/reports', label: 'التقارير' },
    { to: '/installation-card', label: 'كارت متابعة تركيبات' },
    { to: '/productivity-summary', label: 'ملخص إنتاجية المهندسين' },
    { to: '/projects-overview', label: 'نظرة عامة على المشاريع' },
  ],
  data_entry: [
    { to: '/dashboard', label: 'الرئيسية' },
    { to: '/projects', label: 'المشاريع' },
    { to: '/assignments', label: 'تخصيص المهندس' },
    { to: '/project-status', label: 'موقف مشروع' },
  ],
  technician: [
    { to: '/dashboard', label: 'الرئيسية' },
    { to: '/technician', label: 'تسجيل تركيب' },
    { to: '/project-status', label: 'موقف مشروع' },
  ],
  supervisor: [
    { to: '/dashboard', label: 'الرئيسية' },
    { to: '/workforce', label: 'حصر الأفراد' },
    { to: '/technician', label: 'تسجيل تركيب' },
    { to: '/approval', label: 'اعتماد الإدخالات' },
    { to: '/project-status', label: 'موقف مشروع' },
    { to: '/reports', label: 'التقارير' },
    { to: '/installation-card', label: 'كارت متابعة تركيبات' },
  ],
  engineer: [
    { to: '/dashboard', label: 'الرئيسية' },
    { to: '/projects', label: 'المشاريع' },
    { to: '/assignments', label: 'تخصيص المشاريع' },
    { to: '/workforce', label: 'حصر الأفراد' },
    { to: '/approval', label: 'اعتماد الإدخالات' },
    { to: '/project-status', label: 'موقف مشروع' },
    { to: '/reports', label: 'التقارير' },
    { to: '/installation-card', label: 'كارت متابعة تركيبات' },
    { to: '/additional-works', label: 'بيان الأعمال الإضافية' },
    { to: '/monthly-productivity', label: 'تقرير إنتاجية الشهر' },
    { to: '/productivity-summary', label: 'ملخص إنتاجية المهندسين', requiresFlag: 'is_installations_manager' },
    { to: '/projects-overview', label: 'نظرة عامة على المشاريع', requiresFlag: 'is_installations_manager' },
    { to: '/users', label: 'المستخدمون', requiresFlag: 'is_installations_manager' },
  ],
  delivery_entry: [
    { to: '/dashboard', label: 'الرئيسية' },
    { to: '/delivery', label: 'التسليمات' },
    { to: '/project-status', label: 'موقف مشروع' },
  ],
}

function ChangePasswordBox({ onClose }) {
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSave() {
    setError('')
    if (pw1.length < 6) { setError('كلمة السر لازم تكون 6 حروف على الأقل'); return }
    if (pw1 !== pw2) { setError('كلمتا السر مش متطابقتين'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setBusy(false)
    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(onClose, 1500)
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 10, marginTop: 8 }}>
      {done ? (
        <div style={{ fontSize: 12.5, color: '#7ee0a0' }}>تم تغيير كلمة السر بنجاح.</div>
      ) : (
        <>
          {error && <div style={{ fontSize: 12, color: '#ff9b9b', marginBottom: 6 }}>{error}</div>}
          <input
            type="password" placeholder="كلمة السر الجديدة" value={pw1} onChange={(e) => setPw1(e.target.value)}
            style={{ width: '100%', marginBottom: 6, fontSize: 12.5, padding: 6, borderRadius: 6, border: 'none' }}
          />
          <input
            type="password" placeholder="تأكيد كلمة السر" value={pw2} onChange={(e) => setPw2(e.target.value)}
            style={{ width: '100%', marginBottom: 8, fontSize: 12.5, padding: 6, borderRadius: 6, border: 'none' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-primary sm" disabled={busy} onClick={handleSave} style={{ flex: 1 }}>
              {busy ? 'جارِ الحفظ...' : 'حفظ'}
            </button>
            <button className="btn-secondary sm" onClick={onClose} style={{ flex: 1 }}>إلغاء</button>
          </div>
        </>
      )}
    </div>
  )
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const [changingPw, setChangingPw] = useState(false)
  const items = (NAV_BY_ROLE[profile?.role] || []).filter((it) => !it.requiresFlag || profile?.[it.requiresFlag])

  return (
    <div className="app-shell">
      <nav className="sidebar no-print">
        <div className="brand">
          متابعة الأبواب
          <small>{profile?.full_name}{profile?.role ? ` — ${ROLES[profile.role]}` : ''}</small>
        </div>
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            {it.label}
          </NavLink>
        ))}
        <div className="user-box">
          <div>{profile?.full_name}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn-secondary sm" onClick={() => setChangingPw((s) => !s)} style={{ flex: 1 }}>
              تغيير كلمة السر
            </button>
            <button className="btn-secondary sm" onClick={signOut} style={{ flex: 1 }}>تسجيل الخروج</button>
          </div>
          {changingPw && <ChangePasswordBox onClose={() => setChangingPw(false)} />}
        </div>
      </nav>
      <main className="main">
        <div className="no-print"><ReminderBanner /></div>
        <Outlet />
      </main>
    </div>
  )
}
