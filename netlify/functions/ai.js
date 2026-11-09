// Netlify function: lets Mindful Bites read meal photos and unknown foods with Claude.
// Setup (once): Netlify > Site configuration > Environment variables:
//   ANTHROPIC_API_KEY = your key from console.anthropic.com
//   SITE_ORIGIN       = https://your-site.netlify.app   (blocks other websites from using your key)
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';
const json = (code, obj) => ({ statusCode: code, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(obj) });
exports.handler = async (event) => {
  if (event.httpMethod === 'GET') return json(process.env.ANTHROPIC_API_KEY ? 200 : 503, { ok: !!process.env.ANTHROPIC_API_KEY });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(503, { error: 'AI is not set up yet (missing ANTHROPIC_API_KEY).' });
  const allow = process.env.SITE_ORIGIN;
  const origin = event.headers.origin || event.headers.Origin || '';
  if (allow && origin && origin.replace(/\/$/, '') !== allow.replace(/\/$/, '')) return json(403, { error: 'Not allowed from this site.' });
  if ((event.body || '').length > 6_000_000) return json(413, { error: 'Photo is too large.' });
  let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad request.' }); }
  const prompt = String(b.prompt || '').slice(0, 8000);
  if (!prompt) return json(400, { error: 'Missing prompt.' });
  const content = [];
  for (const d of (Array.isArray(b.images) ? b.images : []).slice(0, 3)) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(d));
    if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  content.push({ type: 'text', text: prompt });
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      signal: ctl.signal,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 900, messages: [{ role: 'user', content }] })
    });
    const d = await r.json();
    if (!r.ok) return json(502, { error: (d.error && d.error.message) || ('AI error ' + r.status) });
    const text = (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    return json(200, { text });
  } catch (e) { return json(504, { error: e && e.name === 'AbortError' ? 'Claude took longer than Netlify allows (10 seconds). Try a closer, sharper photo of just the label.' : 'Could not reach the AI service.' }); }
  finally { clearTimeout(timer); }
};
