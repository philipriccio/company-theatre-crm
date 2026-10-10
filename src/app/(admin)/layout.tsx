import "../audience.css";
import { Sidebar } from "@/components/Sidebar";

// Route groups keep CRM chrome out of subscriber pages without changing URLs.
// Access control remains the authenticated reverse-proxy catch-all.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="workspace-shell">
      <a href="#main-content" className="workspace-skip">Skip to content</a><Sidebar />
      <main id="main-content" className="flex-1 min-w-0 min-h-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
