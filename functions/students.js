// Shifo Academy student list, for teachers only.
// Reads the Netlify Identity users of this site and returns those with the "student" role.
const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
  body: JSON.stringify(body)
});

exports.handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;
  if (!user) return json(401, { error: 'not_logged_in' });
  const roles = ((user.app_metadata && user.app_metadata.roles) || []).map(r => String(r).toLowerCase().trim());
  if (!roles.includes('teacher')) return json(403, { error: 'teachers_only' });

  const identity = context.clientContext.identity;
  if (!identity || !identity.url || !identity.token) return json(500, { error: 'identity_unavailable' });

  try {
    const res = await fetch(`${identity.url}/admin/users?per_page=500`, { headers: { Authorization: `Bearer ${identity.token}` } });
    if (!res.ok) return json(502, { error: 'identity_error', status: res.status });
    const data = await res.json();
    const students = (data.users || [])
      .map(u => {
        const r = ((u.app_metadata && u.app_metadata.roles) || []).map(x => String(x).toLowerCase().trim());
        return {
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
    return json(200, { students });
  } catch (e) {
    return json(500, { error: 'failed' });
  }
};
