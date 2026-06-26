'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/shops', label: 'Shop Management' },
  { href: '/admin/users', label: 'User Management' },
  { href: '/admin/subscriptions', label: 'Subscriptions' },
  {
    label: 'Customer App Directory',
    children: [
      { href: '/admin/directory/banners', label: 'Home Banners' },
      { href: '/admin/directory/support-contacts', label: 'Support Contacts' },
      { href: '/admin/directory/faq-items', label: 'FAQ' },
      { href: '/admin/directory/app-content', label: 'App Content (About/Terms)' },
    ],
  },
  {
    label: 'Master Data',
    children: [
      { href: '/admin/master/device-categories', label: 'Categories' },
      { href: '/admin/master/brands', label: 'Brands' },
      { href: '/admin/master/category-brand-mapping', label: 'Category-Brand Mapping' },
      { href: '/admin/master/series', label: 'Series' },
      { href: '/admin/master/models', label: 'Models' },
      { href: '/admin/master/colors', label: 'Colors' },
      { href: '/admin/master/repair-services', label: 'Repair Services' },
      { href: '/admin/master/repair-categories', label: 'Repair Categories' },
      { href: '/admin/master/technician-work-statuses', label: 'Work Status' },
      { href: '/admin/master/ram-options', label: 'RAM Options' },
      { href: '/admin/master/storage-options', label: 'Storage Options' },
    ],
  },
  {
    label: 'Sell Flow Master Data',
    children: [
      { href: '/admin/master/screening-questions', label: 'Screening Questions' },
      { href: '/admin/master/condition-groups', label: 'Condition Groups' },
      { href: '/admin/master/functional-issues', label: 'Functional Issues' },
      { href: '/admin/master/device-configuration', label: 'Device Configuration' },
    ],
  },
  {
    label: 'Marketplace',
    children: [
      { href: '/admin/marketplace/items', label: 'Items' },
    ],
  },
];

export default function Sidebar({ onLogout }) {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-admin-border bg-admin-card flex flex-col">
      <div className="p-4 border-b border-admin-border">
        <span className="font-semibold text-slate-100">Repair Shop Admin</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {nav.map((item) =>
          item.href ? (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm ${
                pathname === item.href
                  ? 'bg-admin-accent/20 text-admin-accent'
                  : 'text-slate-300 hover:bg-admin-dark hover:text-slate-100'
              }`}
            >
              {item.label}
            </Link>
          ) : (
            <div key={item.label} className="pt-2">
              <p className="px-3 py-1 text-xs font-medium text-admin-muted uppercase tracking-wider">
                {item.label}
              </p>
              <div className="mt-1 space-y-0.5">
                {item.children.map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    className={`block rounded-lg px-3 py-2 text-sm ${
                      pathname === c.href
                        ? 'bg-admin-accent/20 text-admin-accent'
                        : 'text-slate-300 hover:bg-admin-dark hover:text-slate-100'
                    }`}
                  >
                    {c.label}
                  </Link>
                ))}
              </div>
            </div>
          )
        )}
      </nav>
      {onLogout && (
        <div className="p-3 border-t border-admin-border">
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-lg px-3 py-2 text-sm text-admin-muted hover:bg-admin-dark hover:text-slate-100"
          >
            Log out
          </button>
        </div>
      )}
    </aside>
  );
}
