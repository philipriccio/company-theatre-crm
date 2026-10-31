import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { identity } from '@/lib/auth/store';
import { cookieName } from '@/lib/auth/access';
import "../audience.css";
import { Sidebar } from "@/components/Sidebar";

// Route groups keep CRM chrome out of subscriber pages without changing URLs.
// Application sessions supplement the unchanged reverse-proxy gate.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await identity((await cookies()).get(cookieName())?.value)
  if (!user) redirect('/login')
  return (
    <div className="workspace-shell">
      <a href="#main-content" className="workspace-skip">Skip to content</a><Sidebar />
      <main id="main-content" className="flex-1 min-w-0 min-h-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
