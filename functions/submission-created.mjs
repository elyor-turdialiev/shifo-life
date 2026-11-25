/* Shifo Life: website applications into the CRM funnel.
   Netlify runs this function by itself after every verified (spam-checked) form submission;
   it cannot be called from outside. Each Academy, Abroad or Contact form application becomes a lead
   with stage "applied", which the CEO, admins and account managers see in the CRM (Funnel).
   The Clinic booking form has its own list (clinic.mjs). */
import { getStore } from '@netlify/blobs';

const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const one = (v, list) => list.includes(v) ? v : '';
const FORMS = ['academy', 'abroad', 'contact'];
const PLANS = ['general', 'medical', 'intense', '3m'];
const TOPIC = { media: 'media', guest: 'media-guest', other: 'other' };

// What the person asked for, as the funnel's "interest", plus the choices they made on the form
function read(form, d) {
  const old = str(d.interest, 60);              // the earlier single Contact form sent this
  if (form === 'academy') {
    const plan = one(d.plan, PLANS);
    return { interest: plan ? 'academy-' + plan : 'academy', details: { level: one(d.level, ['unsure', 'a2', 'b1', 'b2', 'c1']), time: one(d.time, ['morning', 'afternoon', 'evening', 'weekend']) } };
  }
  if (form === 'abroad') {
    return { interest: 'abroad', details: { need: one(d.need, ['study', 'docs', 'settle', 'family', 'other']), where: one(d.where, ['uz', 'us', 'other']) } };
  }
  return { interest: TOPIC[d.topic] || (/^[a-z0-9-]{2,40}$/.test(old) ? old : 'other'), details: {} };
}

export default async (req) => {
  let body;
  try { body = await req.json(); } catch (e) { return new Response('bad request', { status: 400 }); }
  const p = body && body.payload ? body.payload : {};
  const d = p.data || {};
  const form = p.form_name || d['form-name'] || '';
  if (!FORMS.includes(form)) return new Response('skipped');   // the clinic booking form has its own list
  if (d.company) return new Response('skipped');             // the hidden spam trap was filled in

  const id = /^[a-z0-9]{6,40}$/i.test(p.id || '') ? p.id : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const at = p.created_at && !isNaN(Date.parse(p.created_at)) ? new Date(p.created_at).toISOString() : new Date().toISOString();
  const { interest, details } = read(form, d);
  Object.keys(details).forEach(k => { if (!details[k]) delete details[k]; });
  const lead = {
    id, at, source: 'website', form,
    name: str(d.name, 120), phone: str(d.phone, 60), contact: one(d.contact, ['telegram', 'whatsapp', 'call']),
    interest, details, message: str(d.message, 2000),
    stage: 'applied', attempts: 0, updated: at, follow: '',
    history: [{ at, by: 'Website', to: 'applied', note: '' }]
  };
  if (!lead.name && !lead.phone) return new Response('skipped');
  // Netlify may retry an event: write only once per submission
  await getStore({ name: 'academy', consistency: 'strong' }).setJSON(`leads/${id}`, lead, { onlyIfNew: true });
  return new Response('ok');
};
