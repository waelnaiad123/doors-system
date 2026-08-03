import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { ROLES } from '../lib/roles'
import ReminderBanner from './ReminderBanner'

const NAV_BY_ROLE = {
  admin: [
    { to: '/projects', label: 'المشاريع' },
    { to: '/assignments', label: 'تخصيص المشاريع' },
    { to: '/users', label: 'المستخدمون' },
    { to: '/technician', label: 'تسجيل تركيب' },
    { to: '/workforce', label: 'حصر الأفراد' },
    { to: '/approval', label: 'اعتماد الإدخالات' },
    { to: '/delivery', label: 'التسليمات' },
    { to: '/project-status', label: 'موقف مشروع' },
    { to: '/reports', label: 'التقارير' },
    { to: '/installation-card', label: 'كارت متابعة تركيبات' },
    { to: '/additional-works', label: 'بيان الأعمال الإضافية' },
    { to: '/monthly-productivity', label: 'تقرير إنتاجية الشهر' },
    { to: '/productivity-summary', label: 'ملخص إنتاجية المهندسين' },
  ],
  data_entry: [
    { to: '/projects', label: 'المشاريع' },
    { to: '/assignments', label: 'تخصيص المهندس' },
    { to: '/project-status', label: 'موقف مشروع' },
  ],
  technician: [
    { to: '/technician', label: 'تسجيل تركيب' },
    { to: '/project-status', label: 'موقف مشروع' },
  ],
  supervisor: [
    { to: '/workforce', label: 'حصر الأفراد' },
    { to: '/technician', label: 'تسجيل تركيب' },
    { to: '/approval', label: 'اعتماد الإدخالات' },
    { to: '/project-status', label: 'موقف مشروع' },
    { to: '/reports', label: 'التقارير' },
    { to: '/installation-card', label: 'كارت متابعة تركيبات' },
  ],
  engineer: [
    { to: '/projects', label: 'المشاريع' },
    { to: '/assignments', label: 'تخصيص المشاريع' },
    { to: '/workforce', label: 'حصر الأفراد' },
    { to: '/approval', label: 'اعتماد الإدخالات' },
    { to: '/project-status', label: 'موقف مشروع' },
    { to: '/reports', label: 'التقارير' },
    { to: '/installation-card', label: 'كارت متابعة تركيبات' },
    { to: '/additional-works', label: 'بيان الأعمال الإضافية' },
    { to: '/monthly-productivity', label: 'تقرير إنتاجية الشهر' },
    { to: '/productivity-summary', label: 'ملخص إنتاجية المهندسين' },
  ],
  delivery_entry: [
    { to: '/delivery', label: 'التسليمات' },
    { to: '/project-status', label: 'موقف مشروع' },
  ],
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const items = NAV_BY_ROLE[profile?.role] || []

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
          <button className="btn-secondary sm" onClick={signOut}>تسجيل الخروج</button>
        </div>
      </nav>
      <main className="main">
        <div className="no-print"><ReminderBanner /></div>
        <Outlet />
      </main>
    </div>
  )
}
