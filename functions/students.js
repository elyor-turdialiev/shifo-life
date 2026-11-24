// Shifo Academy people, for staff only (teacher, admin, ceo, manager).
// Reads the Netlify Identity users of this site: students ("student" role) and teachers ("teacher" role).
// A plain teacher (not admin, CEO or account manager) gets only students assigned to them, or not yet assigned.
const { getStore, connectLambda } = require('@netlify/blobs');
const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
  body: JSON.stringify(body)
});

exports.handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;
  if (!user) return json(401, { error: 'not_logged_in' });
  const roles = ((user.app_metadata && user.app_metadata.roles) || []).map(r => String(r).toLowerCase().trim());
  if (!['teacher', 'admin', 'ceo', 'manager'].some(r => roles.includes(r))) return json(403, { error: 'teachers_only' });

  const identity = context.clientContext.identity;
  if (!identity || !identity.url || !identity.token) return json(500, { error: 'identity_unavailable' });

  try {
    const res = await fetch(`${identity.url}/admin/users?per_page=500`, { headers: { Authorization: `Bearer ${identity.token}` } });
    if (!res.ok) return json(502, { error: 'identity_error', status: res.status });
    const data = await res.json();
    const people = (data.users || []);
    const staff = people
      .map(u => ({ id: u.id, name: (u.user_metadata && u.user_metadata.full_name) || '', email: u.email,
        roles: ((u.app_metadata && u.app_metadata.roles) || []).map(x => String(x).toLowerCase().trim()) }))
      .filter(u => u.roles.includes('teacher'))
      .map(u => ({ id: u.id, name: u.name, email: u.email }))
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    const students = people
      .map(u => {
        const r = ((u.app_metadata && u.app_metadata.roles) || []).map(x => String(x).toLowerCase().trim());
        return {
          id: u.id,
          name: (u.user_metadata && u.user_metadata.full_name) || '',
          email: u.email,
          level: ['b1', 'b2', 'c1'].find(l => r.includes(l)) || '',
          student: r.includes('student'),
          confirmed: !!u.confirmed_at,
          lastLogin: u.last_sign_in_at || null,
          since: u.created_at
        };
      })
      .filter(u => u.student)
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    const limited = !['admin', 'ceo', 'manager'].some(r => roles.includes(r));
    if (limited) {
      try {
        connectLambda(event);
        const assign = (await getStore({ name: 'academy', consistency: 'strong' }).get('crm/assign', { type: 'json' })) || {};
        return json(200, { students: students.filter(s => !assign[s.id] || assign[s.id].id === user.sub), staff });
      } catch (e) { console.error('assign', e); }   // the academy data itself stays protected either way
    }
    return json(200, { students, staff });
  } catch (e) {
    return json(500, { error: 'failed' });
  }
};
