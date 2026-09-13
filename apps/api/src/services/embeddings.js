// Embeddings para la memoria del agente: Gemini `gemini-embedding-001`.
//
// Se pide el vector a 768 dimensiones (la columna `customer_memory.embedding`
// es vector(768)): suficiente para distinguir "prefiere plazos cortos" de
// "Ana es su casera" y un tercio del tamaño por defecto. Sin GEMINI_API_KEY no
// hay embedder y la memoria cae a recuperación por recencia; nunca tumba la API.

export const EMBEDDING_DEFAULT_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMENSIONS = 768;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 15_000;
const MAX_TEXT_CHARS = 2000;

// Literal que pgvector acepta con `::vector`: "[0.1,0.2,...]".
export const toVectorLiteral = (values) => `[${values.map((v) => Number(v).toPrecision(8)).join(',')}]`;

export function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export function createEmbedder({
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_EMBEDDING_MODEL || EMBEDDING_DEFAULT_MODEL,
  dimensions = EMBEDDING_DIMENSIONS,
  baseUrl = process.env.GEMINI_BASE_URL || GEMINI_BASE_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) return null;
  const url = `${baseUrl}/models/${model}:embedContent`;

  // `taskType` afina el vector: RETRIEVAL_DOCUMENT para lo que se guarda,
  // RETRIEVAL_QUERY para la pregunta con la que se busca.
  async function embed(text, { taskType = 'RETRIEVAL_DOCUMENT' } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          content: { parts: [{ text: String(text ?? '').slice(0, MAX_TEXT_CHARS) }] },
          taskType,
          outputDimensionality: dimensions,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Gemini embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const values = data?.embedding?.values;
      if (!Array.isArray(values) || values.length !== dimensions) {
        throw new Error(`Gemini embeddings: se esperaban ${dimensions} dimensiones y llegaron ${values?.length ?? 0}.`);
      }
      return values;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`Gemini embeddings: tiempo de espera agotado (${TIMEOUT_MS / 1000}s).`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return { model, dimensions, embed };
}
