import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { ROLES } from '../lib/roles'

const NAV_BY_ROLE = {
  admin: [
    { to: '/projects', label: 'المشاريع' },
    { to: '/assignments', label: 'تخصيص المشاريع' },
    { to: '/users', label: 'المستخدمون' },
    { to: '/technician', label: 'تسجيل تركيب' },
    { to: '/approval', label: 'اعتماد الإدخالات' },
    { to: '/delivery', label: 'التسليمات' },
    { to: '/reports', label: 'التقارير' },
  ],
  data_entry: [
    { to: '/projects', label: 'المشاريع' },
  ],
  technician: [
    { to: '/technician', label: 'تسجيل تركيب' },
  ],
  supervisor: [
    { to: '/approval', label: 'اعتماد الإدخالات' },
    { to: '/reports', label: 'التقارير' },
  ],
  engineer: [
    { to: '/projects', label: 'المشاريع' },
    { to: '/assignments', label: 'تخصيص المشاريع' },
    { to: '/approval', label: 'اعتماد الإدخالات' },
    { to: '/reports', label: 'التقارير' },
  ],
  delivery_entry: [
    { to: '/delivery', label: 'التسليمات' },
  ],
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const items = NAV_BY_ROLE[profile?.role] || []

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="brand">
          متابعة الأبواب
          <small>{ROLES[profile?.role] || ''}</small>
        </div>
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            {it.label}
          </NavLink>
        ))}
        <div className="user-box">
          <div>{profile?.full_name}</div>
          <button className="btn-secondary sm" onClick={signOut}>تسجيل الخروج</button>
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
