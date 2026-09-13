import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultMemoryModel, MEMORY_GROQ_FALLBACK_MODEL } from '../src/services/memory-extractor.js';

// Aísla las variables que deciden el modelo de la extracción de memoria.
const withEnv = (vars, fn) => {
  const previous = {};
  for (const [k, v] of Object.entries(vars)) {
    previous[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

// El TPM de Groq es por modelo: si memoria y orquestación comparten modelo, un
// turno se come el cupo del siguiente y sale un 429 en plena demo.
test('la memoria se desvía a otro modelo cuando chocaría con el orquestador en Groq', () => {
  withEnv({ MEMORY_LLM_MODEL: undefined, LLM_PROVIDER: 'groq', GROQ_MODEL: 'openai/gpt-oss-120b' }, () => {
    assert.equal(defaultMemoryModel('groq'), MEMORY_GROQ_FALLBACK_MODEL);
  });
});

test('si el orquestador ya usa el modelo chico, la memoria no se desvía', () => {
  withEnv({ MEMORY_LLM_MODEL: undefined, LLM_PROVIDER: 'groq', GROQ_MODEL: MEMORY_GROQ_FALLBACK_MODEL }, () => {
    assert.equal(defaultMemoryModel('groq'), undefined);
  });
});

test('con el orquestador en Gemini no hay choque: la memoria usa el modelo configurado', () => {
  withEnv({ MEMORY_LLM_MODEL: undefined, LLM_PROVIDER: 'gemini', GROQ_MODEL: 'openai/gpt-oss-120b' }, () => {
    assert.equal(defaultMemoryModel('groq'), undefined);
  });
  withEnv({ MEMORY_LLM_MODEL: undefined }, () => {
    assert.equal(defaultMemoryModel('gemini'), undefined);
  });
});

test('MEMORY_LLM_MODEL manda sobre la elección automática', () => {
  withEnv({ MEMORY_LLM_MODEL: 'qwen/qwen3.6-27b', LLM_PROVIDER: 'groq', GROQ_MODEL: 'openai/gpt-oss-120b' }, () => {
    assert.equal(defaultMemoryModel('groq'), 'qwen/qwen3.6-27b');
  });
});
