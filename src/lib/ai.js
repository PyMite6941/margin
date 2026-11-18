// Optional AI, bring your own. Off until the user fills in Settings → AI; nothing here runs
// or loads otherwise. Two request formats cover nearly every provider:
//   openai     any OpenAI-compatible /chat/completions endpoint: OpenAI, OpenRouter, Groq,
//              Mistral, DeepSeek, Together, Gemini's OpenAI endpoint, Ollama, LM Studio, llama.cpp
//   anthropic  the Anthropic Messages API
// The key is kept in localStorage on this device and sent only to the URL the user entered.
// In the desktop apps requests go through window.desktop.request, which is not subject to CORS.

export const FORMATS = {
  openai: { label: 'OpenAI-compatible', url: 'https://api.openai.com/v1', hint: 'OpenAI, OpenRouter, Groq, Mistral, Ollama (http://localhost:11434/v1), LM Studio (http://localhost:1234/v1)…' },
  anthropic: { label: 'Anthropic', url: 'https://api.anthropic.com/v1', hint: 'Claude models, e.g. claude-sonnet-5-5' },
};

const KEY = 'margin.ai';
export const loadAI = () => { try { return { format: 'openai', url: '', model: '', key: '', ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { format: 'openai', url: '', model: '', key: '' }; } };
export const saveAI = cfg => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* storage full or blocked */ } };
export const aiReady = cfg => Boolean(cfg.model.trim());

const SYSTEM = 'You are an editing tool inside a text editor. Follow the instruction on the given text and reply with only the resulting text: no preamble, no explanation, no code fences around the whole reply.';

async function post(url, headers, body, signal) {
  if (window.desktop?.request) {
    const res = await window.desktop.request({ method: 'POST', url, headers, body: JSON.stringify(body) });
    return { ok: res.status >= 200 && res.status < 300, status: res.status, text: res.text };
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

// Resolves to the model's reply as plain text.
export async function ask(cfg, instruction, text, signal) {
  const base = (cfg.url.trim() || FORMATS[cfg.format].url).replace(/\/+$/, '');
  const prompt = `${instruction}\n\n<text>\n${text}\n</text>`;
  const headers = { 'content-type': 'application/json' };
  let url, body;
  if (cfg.format === 'anthropic') {
    url = `${base}/messages`;
    Object.assign(headers, { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
    body = { model: cfg.model.trim(), max_tokens: 8192, system: SYSTEM, messages: [{ role: 'user', content: prompt }] };
  } else {
    url = `${base}/chat/completions`;
    if (cfg.key) headers.authorization = `Bearer ${cfg.key}`;
    body = { model: cfg.model.trim(), messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] };
  }

  const res = await post(url, headers, body, signal);
  let data;
  try { data = JSON.parse(res.text); } catch { data = null; }
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
  const reply = cfg.format === 'anthropic'
    ? data?.content?.filter(b => b.type === 'text').map(b => b.text).join('')
    : data?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string') throw new Error('The provider sent back no text');
  return reply;
}
