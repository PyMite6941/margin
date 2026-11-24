// Optional AI, bring your own. Off until an account with a model is added in Settings → AI;
// nothing here runs or loads otherwise. Two request formats cover nearly every service:
//   openai     any OpenAI-compatible /chat/completions endpoint
//   anthropic  the Anthropic Messages API
// Accounts (service, model, key or token, plan, limit) live in a .env file: see keys.js.
// A key is sent only to its account's address. In the desktop apps requests go through
// window.desktop.request, which is not subject to browser CORS limits.

// plan: what the account usually is, preselected when adding one. local: needs no key.
// Chat-app subscriptions (ChatGPT Plus, Claude Pro, Gemini in the Google One plans) do not
// include API access, so they have no entry; GitHub's plans do, through GitHub Models.
export const SERVICES = {
  openai: { label: 'OpenAI', format: 'openai', url: 'https://api.openai.com/v1', plan: 'payg', models: 'https://platform.openai.com/docs/models' },
  anthropic: { label: 'Anthropic', format: 'anthropic', url: 'https://api.anthropic.com/v1', plan: 'payg', models: 'https://docs.anthropic.com/en/docs/about-claude/models' },
  github: {
    label: 'GitHub Models (GitHub and Copilot plans)', format: 'openai', url: 'https://models.github.ai/inference', plan: 'subscription',
    credential: 'GitHub token', models: 'https://github.com/marketplace?type=models',
    hint: 'Uses the AI requests included with your GitHub account; Copilot plans get higher daily limits. Make a fine-grained token with the "Models: read" permission. Model names look like publisher/model.',
  },
  openrouter: { label: 'OpenRouter', format: 'openai', url: 'https://openrouter.ai/api/v1', plan: 'payg', models: 'https://openrouter.ai/models', hint: 'Prepaid credits, and some free models with daily request limits.' },
  gemini: { label: 'Google Gemini (AI Studio)', format: 'openai', url: 'https://generativelanguage.googleapis.com/v1beta/openai', plan: 'free', models: 'https://ai.google.dev/gemini-api/docs/models', hint: 'An AI Studio key has a free tier with daily request limits, or pay-as-you-go billing.' },
  groq: { label: 'Groq', format: 'openai', url: 'https://api.groq.com/openai/v1', plan: 'free', models: 'https://console.groq.com/docs/models' },
  mistral: { label: 'Mistral', format: 'openai', url: 'https://api.mistral.ai/v1', plan: 'payg', models: 'https://docs.mistral.ai/getting-started/models/' },
  ollama: { label: 'Ollama (on this computer)', format: 'openai', url: 'http://localhost:11434/v1', plan: 'local', local: true, models: 'https://ollama.com/library', hint: 'In a browser, start Ollama with OLLAMA_ORIGINS set to this site\'s address.' },
  lmstudio: { label: 'LM Studio (on this computer)', format: 'openai', url: 'http://localhost:1234/v1', plan: 'local', local: true },
  custom: { label: 'Other OpenAI-compatible service', format: 'openai', url: '', plan: 'payg', hint: 'Any address that serves /chat/completions: Together, DeepSeek, Fireworks, llama.cpp, a company gateway…' },
  'custom-anthropic': { label: 'Other Anthropic-compatible service', format: 'anthropic', url: '', plan: 'payg' },
};
export const PLANS = { payg: 'Pay as you go', subscription: 'Subscription', free: 'Free tier', local: 'On this computer' };

const KEY = 'margin.ai';
const DEFAULTS = { autoSwitch: false };
// Settings saved before accounts existed also hold format, url, model and key: App moves them into the .env file.
export const loadAI = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...DEFAULTS }; } };
export const saveAI = cfg => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* storage full or blocked */ } };

const SYSTEM = 'You are an editing tool inside a text editor. Follow the instruction on the given text and reply with only the resulting text: no preamble, no explanation, no code fences around the whole reply.';

async function post(url, headers, body, signal) {
  if (window.desktop?.request) {
    // The desktop request cannot be cancelled, so a stop (Escape) stops waiting for it: the
    // reply, if one comes, is dropped rather than replacing the text after the user said no.
    const stopped = new Promise((_, fail) => {
      const stop = () => fail(new DOMException('Stopped', 'AbortError'));
      if (signal?.aborted) stop(); else signal?.addEventListener('abort', stop, { once: true });
    });
    const res = await Promise.race([window.desktop.request({ method: 'POST', url, headers, body: JSON.stringify(body) }), stopped]);
    return { ok: res.status >= 200 && res.status < 300, status: res.status, text: res.text };
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

export const serviceOf = account => SERVICES[account.service] || SERVICES.custom;
export const addressOf = account => (account.url.trim() || serviceOf(account).url).replace(/\/+$/, '');

// One request with one account. Resolves to { text, tokens }: the reply, and the tokens the
// service counted for it. Errors carry the HTTP status, so keys.js can tell a used-up
// account from other problems.
export async function ask(account, instruction, text, signal) {
  const base = addressOf(account);
  if (!base) throw new Error(`The ${account.name} account has no address`);
  const prompt = `${instruction}\n\n<text>\n${text}\n</text>`;
  const headers = { 'content-type': 'application/json' };
  const anthropic = serviceOf(account).format === 'anthropic';
  let url, body;
  if (anthropic) {
    url = `${base}/messages`;
    Object.assign(headers, { 'x-api-key': account.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
    body = { model: account.model.trim(), max_tokens: 8192, system: SYSTEM, messages: [{ role: 'user', content: prompt }] };
  } else {
    url = `${base}/chat/completions`;
    if (account.key) headers.authorization = `Bearer ${account.key}`;
    body = { model: account.model.trim(), messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] };
  }

  const res = await post(url, headers, body, signal);
  let data;
  try { data = JSON.parse(res.text); } catch { data = null; }
  if (!res.ok) {
    const message = data?.error?.message || (typeof data?.error === 'string' && data.error) || data?.message || `HTTP ${res.status}`;
    throw Object.assign(new Error(message), { status: res.status });
  }
  const reply = anthropic
    ? data?.content?.filter(b => b.type === 'text').map(b => b.text).join('')
    : data?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string') throw new Error('The service sent back no text');
  const u = data.usage || {};
  const tokens = (u.input_tokens ?? u.prompt_tokens ?? 0) + (u.output_tokens ?? u.completion_tokens ?? 0) || u.total_tokens || 0;
  return { text: reply, tokens };
}
