/* Shifo Life: website applications into the CRM funnel.
   Netlify runs this function by itself after every verified (spam-checked) form submission;
   it cannot be called from outside. Each Contact form application becomes a lead with stage "applied",
   which the CEO, admins and account managers see in the CRM (Funnel). */
import { getStore } from '@netlify/blobs';

const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

export default async (req) => {
  let body;
  try { body = await req.json(); } catch (e) { return new Response('bad request', { status: 400 }); }
  const p = body && body.payload ? body.payload : {};
  const d = p.data || {};
  const form = p.form_name || d['form-name'] || '';
  if (form !== 'contact') return new Response('skipped');   // the clinic booking form has its own list
  if (d.company) return new Response('skipped');             // the hidden spam trap was filled in

  const id = /^[a-z0-9]{6,40}$/i.test(p.id || '') ? p.id : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const at = p.created_at && !isNaN(Date.parse(p.created_at)) ? new Date(p.created_at).toISOString() : new Date().toISOString();
  const lead = {
    id, at, source: 'website',
    name: str(d.name, 120), phone: str(d.phone, 60), contact: str(d.contact, 40),
    interest: str(d.interest, 60), message: str(d.message, 2000),
    stage: 'applied', attempts: 0, updated: at, follow: '',
    history: [{ at, by: 'Website', to: 'applied', note: '' }]
  };
  if (!lead.name && !lead.phone) return new Response('skipped');
  // Netlify may retry an event: write only once per submission
  await getStore({ name: 'academy', consistency: 'strong' }).setJSON(`leads/${id}`, lead, { onlyIfNew: true });
  return new Response('ok');
};
