'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (getToken()) router.replace('/admin/dashboard');
    else router.replace('/login');
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-admin-muted">Redirecting…</p>
    </div>
  );
}
