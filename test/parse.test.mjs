// Teste leve da lógica de parsing de links do YouTube e do estado das aulas.
// Roda em Node: node test/parse.test.mjs
import assert from 'node:assert/strict';

// Stubs mínimos de navegador usados por store.js
const memoria = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => memoria.set(k, String(v)),
  removeItem: (k) => memoria.delete(k),
};
globalThis.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const { parseYouTubeId, getAulas, getModulos, upsertAula, deleteAula } = await import('../store.js');

const casos = [
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ&t=30', 'dQw4w9WgXcQ'],
  ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['link inválido', ''],
  ['', ''],
];

for (const [entrada, esperado] of casos) {
  const obtido = parseYouTubeId(entrada);
  assert.equal(obtido, esperado, `parseYouTubeId(${JSON.stringify(entrada)}) => ${obtido}, esperado ${esperado}`);
}

const aulas = getAulas();
assert.ok(Array.isArray(aulas) && aulas.length > 0, 'aulas semeadas não foram encontradas');
assert.ok(aulas.every((a) => a.id && a.titulo && a.youtubeId), 'aula sem campos obrigatórios');
assert.ok(getModulos().length > 0, 'módulos semeados não foram encontrados');

const id = 'aula_teste';
upsertAula({ id, titulo: 'Aula de teste', descricao: 'x', moduloId: getModulos()[0].id, ordem: 99, youtubeId: 'dQw4w9WgXcQ', publicado: true, criadoEm: Date.now() });
assert.ok(getAulas().some((a) => a.id === id), 'upsertAula não persistiu a aula');
deleteAula(id);
assert.ok(!getAulas().some((a) => a.id === id), 'deleteAula não removeu a aula');

console.log(`OK — ${casos.length} casos de link + CRUD de aulas validados (${aulas.length} aulas semeadas).`);
