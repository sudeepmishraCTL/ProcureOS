export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type Msg = { role: 'system' | 'user'; content: string | ContentPart[] };

type AIResponse = {
  choices?: Array<{ message?: { content?: string | ContentPart[] } }>;
};

function getAIConfig(modelOverride?: string) {
  const key = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1/chat/completions').replace(/\/$/, '');
  const model = modelOverride || process.env.AI_MODEL || 'gpt-4.1-mini';

  if (!key) {
    throw new Error('AI_API_KEY is not configured. Add an OpenAI-compatible API key to the server environment.');
  }

  return { key, baseUrl, model };
}

export async function callAI(messages: Msg[], modelOverride?: string): Promise<string> {
  const { key, baseUrl, model } = getAIConfig(modelOverride);

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error('AI authentication failed. Check AI_API_KEY and AI_BASE_URL.');
    }
    if (res.status === 429) throw new Error('AI rate limit reached. Please retry in a moment.');
    throw new Error(`AI provider error ${res.status}: ${body.slice(0, 400)}`);
  }

  const json = (await res.json()) as AIResponse;
  const content = json.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('');
  }
  return '';
}

/** Extract the first JSON value out of a model response (handles ```json fences). */
export function parseJSON<T>(raw: string): T {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) text = fence[1].trim();
  const start = text.search(/[[{]/);
  if (start === -1) throw new Error('Model returned no JSON');
  const open = text[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1)) as T;
    }
  }
  throw new Error('Model returned malformed JSON');
}
