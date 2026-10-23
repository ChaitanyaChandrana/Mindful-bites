// Mindful Bites: reads meal photos and answers food questions with Claude.
// Needs the ANTHROPIC_API_KEY environment variable in Netlify. The site password
// (Netlify visitor access) also protects this function.
const MODEL = process.env.MB_MODEL || 'claude-sonnet-5-5';
const MAX_IMAGES = 4;
const MAX_PROMPT = 40000;
const MAX_BODY = 5.5 * 1024 * 1024;

const json = (status, obj) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(500, { error: 'The server is missing its ANTHROPIC_API_KEY.' });
  if ((event.body || '').length > MAX_BODY) return json(413, { error: 'Photos are too large. Try fewer or smaller photos.' });

  let req;
  try { req = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }
  const prompt = String(req.prompt || '');
  const images = Array.isArray(req.images) ? req.images.slice(0, MAX_IMAGES) : [];
  if (!prompt || prompt.length > MAX_PROMPT) return json(400, { error: 'Missing or oversized prompt' });

  const content = [];
  for (const img of images) {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(img || ''));
    if (!m) return json(400, { error: 'Unsupported image' });
    content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  content.push({ type: 'text', text: prompt });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: 'You help a person with advanced kidney disease choose foods. Follow the instructions in the user message exactly. Reply with only the JSON the user asks for, with no extra words and no code fences.',
        messages: [{ role: 'user', content }],
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json(502, { error: (data && data.error && data.error.message) || ('Claude returned ' + r.status) });
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return json(200, { text });
  } catch (e) {
    return json(502, { error: 'Could not reach Claude: ' + (e && e.message ? e.message : e) });
  }
};
