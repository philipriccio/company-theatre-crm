'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navigation = [
  { name: 'Dashboard', href: '/', icon: DashboardIcon },
  { name: 'Contacts', href: '/contacts', icon: ContactsIcon },
  { name: 'Tags', href: '/tags', icon: TagsIcon },
  { name: 'Campaigns', href: '/campaigns', icon: CampaignsIcon },
  { name: 'Templates', href: '/templates', icon: TemplatesIcon },
  { name: 'Settings', href: '/settings', icon: SettingsIcon },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex flex-col w-64 bg-[#0a0a0a]">
      {/* Logo */}
      <div className="flex items-center justify-center h-20 border-b border-white/5">
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-wider text-white">
            THE COMPANY
          </h1>
          <p className="text-[10px] tracking-[0.3em] text-[#ff3b1d] uppercase">
            Theatre
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && pathname.startsWith(item.href))
          const Icon = item.icon
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`
                group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                transition-all duration-200 ease-out relative
                ${isActive
                  ? 'bg-[rgba(255,255,255,0.08)] text-white'
                  : 'text-stone-400 hover:bg-[rgba(255,255,255,0.05)] hover:text-white'
                }
              `}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#ff3b1d]" />
              )}
              <Icon 
                className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${
                  isActive ? 'text-[#ff3b1d]' : 'text-stone-500 group-hover:text-stone-300'
                }`} 
              />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-[#ff3b1d] flex items-center justify-center">
            <span className="text-xs font-bold text-white">CT</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-stone-300 truncate">
              CRM
            </p>
            <p className="text-[10px] text-neutral-600">
              v1.0
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Custom Icons
function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function ContactsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" />
    </svg>
  )
}

function TagsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 9h7l5 5v7a1 1 0 01-1 1H5a1 1 0 01-1-1V9z" />
      <path d="M8 9V5a1 1 0 011-1h10a1 1 0 011 1v10l-5 5" />
      <circle cx="8" cy="13" r="1" fill="currentColor" />
    </svg>
  )
}

function CampaignsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9l9 5 9-5" />
    </svg>
  )
}

function TemplatesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 10h16" />
      <path d="M10 10v10" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
    </svg>
  )
}
