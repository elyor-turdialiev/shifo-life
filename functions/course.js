// Shifo Academy course content. Only signed-in users get content:
// - students: the Student Edition of their own level (role "b1", "b2" or "c1")
// - teachers (role "teacher"): any level, Student or Teacher Edition
const DATA = require('./course-data.json');

const LEVELS = ['b1', 'b2', 'c1'];
const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
  body: JSON.stringify(body)
});

exports.handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;
  if (!user) return json(401, { error: 'not_logged_in' });

  const roles = ((user.app_metadata && user.app_metadata.roles) || []).map(r => String(r).toLowerCase().trim());
  const isTeacher = roles.includes('teacher') || roles.includes('admin');
  const own = LEVELS.filter(l => roles.includes(l));
  const q = event.queryStringParameters || {};

  let level = String(q.level || '').toLowerCase();
  if (isTeacher) {
    if (!LEVELS.includes(level)) level = own[0] || 'b1';
  } else {
    if (!own.length) return json(403, { error: 'no_level' });
    if (!own.includes(level)) level = own[0];
  }
  const edition = isTeacher && q.edition === 'teacher' ? 'teacher' : 'student';
  const book = DATA[level][edition];

  if (q.section) {
    const s = book.find(x => x.id === q.section);
    if (!s) return json(404, { error: 'not_found' });
    return json(200, { level, edition, section: s });
  }
  return json(200, {
    level, edition, levels: isTeacher ? LEVELS : own,
    sections: book.map(({ id, title, week }) => ({ id, title, week }))
  });
};
