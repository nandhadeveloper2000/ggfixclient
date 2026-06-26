'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { getToken, setToken } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!getToken()) {
      router.replace('/login');
    }
  }, [mounted, router, pathname]);

  const handleLogout = () => {
    setToken(null);
    router.replace('/login');
  };

  if (!mounted || !getToken()) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-admin-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 shrink-0 flex items-center gap-3 border-b border-admin-border bg-admin-card px-4">
        <Image
          src="/logo.png"
          alt="GloboGreen"
          width={36}
          height={36}
          className="object-contain"
        />
        <span className="text-sm font-medium text-slate-200">www.globogreen.in</span>
      </header>
      <div className="flex flex-1 min-h-0">
        <Sidebar onLogout={handleLogout} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
