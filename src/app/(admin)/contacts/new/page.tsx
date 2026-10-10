'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
export default function NewContact() { const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [existing, setExisting] = useState(''); return <div className="audience-page"><header className="audience-header"><div><p className="eyebrow">GROW A RELATIONSHIP</p><h1>Add a person.</h1><p>This creates an audience record, not a mailing subscription.</p></div><Link href="/contacts">← Back to audience</Link></header><form className="audience-panel audience-create" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(''); setExisting(''); const body = Object.fromEntries(new FormData(e.currentTarget)); try {
    const response = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) {
        setExisting(typeof data.contact?.id === 'string' ? data.contact.id : '');
        throw new Error(data.error || 'Unable to save');
    }
    router.push(`/contacts/${data.id}`);
    router.refresh();
}
catch (err) {
    setError(err instanceof Error ? err.message : 'Could not save. Your details are still here.');
}
finally {
    setBusy(false);
} }}><label>Email address<input name="email" type="email" maxLength={254} autoComplete="email" required/></label><label>First name<input name="firstName" maxLength={100} autoComplete="given-name"/></label><label>Last name<input name="lastName" maxLength={100} autoComplete="family-name"/></label><label>Organisation<input name="organization" maxLength={200} autoComplete="organization"/></label><label>How do you know them?<input name="context" maxLength={500}/></label><p className="audience-muted">Mailing permission stays off. No email is sent and no consent evidence is invented.</p>{error && <p role="alert" className="text-sm text-red-700">{error} {existing && <Link href={`/contacts/${encodeURIComponent(existing)}`}>Open existing person →</Link>}</p>}<div className="audience-actions"><button className="btn btn-primary btn-md" disabled={busy}>{busy ? 'Saving…' : 'Create person'}</button><Link className="btn btn-secondary btn-md" href="/contacts">Cancel</Link></div></form></div>; }
