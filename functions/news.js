// Shifo Life news ticker: latest official travel-health notices (CDC) and
// travel advisories (U.S. Department of State). Both are public-domain U.S.
// government feeds. Netlify caches the result, so the feeds are read at most
// about once an hour.
const FEEDS = [
  { src: 'CDC', kind: 'health', url: 'https://wwwnc.cdc.gov/travel/rss/notices.xml', take: 7 },
  { src: 'U.S. State Dept', kind: 'travel', url: 'https://travel.state.gov/_res/rss/TAsTWs.xml', take: 7, pin: /uzbekistan/i }
];

const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? decode(m[1]) : ''; };

async function read(feed) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(feed.url, { signal: ctl.signal, headers: { 'User-Agent': 'ShifoLife-NewsTicker/1.0' } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = (xml.match(/<item\b[\s\S]*?<\/item>/gi) || []).map(it => {
      const title = tag(it, 'title'), link = tag(it, 'link'), date = new Date(tag(it, 'pubDate'));
      const lvl = (title.match(/Level\s*(\d)/i) || [])[1];
      return { src: feed.src, kind: feed.kind, title, link, date: isNaN(date) ? null : date.toISOString(), level: lvl ? +lvl : null };
    }).filter(i => i.title && /^https:\/\//.test(i.link));
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const picked = items.slice(0, feed.take);
    if (feed.pin) items.filter(i => feed.pin.test(i.title) && !picked.includes(i)).forEach(i => picked.unshift(i));
    return picked;
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

exports.handler = async () => {
  const lists = await Promise.all(FEEDS.map(read));
  // interleave health and travel so both kinds show up
  const out = [];
  for (let i = 0; i < Math.max(...lists.map(l => l.length)); i++) lists.forEach(l => l[i] && out.push(l[i]));
  const ok = out.length > 0;
  return {
    statusCode: ok ? 200 : 503,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': ok ? 'public, max-age=900' : 'no-store',
      'Netlify-CDN-Cache-Control': ok ? 'public, durable, s-maxage=3600, stale-while-revalidate=86400' : 'no-store'
    },
    body: JSON.stringify({ updated: new Date().toISOString(), items: out })
  };
};
