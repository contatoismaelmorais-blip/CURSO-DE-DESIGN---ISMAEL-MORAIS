// Teste da camada de arquivos (db.js) usando o fallback de localStorage.
// Roda em Node: node test/db.test.mjs
import assert from 'node:assert/strict';

/* ------------------------------------------------------------------ stubs */
const memoria = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => memoria.set(k, String(v)),
  removeItem: (k) => memoria.delete(k),
};
globalThis.window = { dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};
globalThis.FileReader = class FileReader {
  readAsDataURL(blob) {
    blob
      .arrayBuffer()
      .then((buf) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`;
        this.onload?.();
      })
      .catch((err) => this.onerror?.(err));
  }
};

const { saveFile, listFiles, countFiles, getFile, deleteFile, downloadFile, formatSize, formatDate } =
  await import('../db.js');

const aulaId = 'aula_teste_db';
await deleteFile('inexistente').catch(() => {});

const arquivo = new File(['conteudo do material'], 'material-aula.txt', { type: 'text/plain' });
const registro = await saveFile(aulaId, arquivo);
assert.ok(registro.id, 'saveFile não retornou id');
assert.equal(registro.nome, 'material-aula.txt', 'saveFile não preservou o nome do arquivo');
assert.equal(registro.aulaId, aulaId);

const lista = await listFiles(aulaId);
assert.equal(lista.length, 1, `esperava 1 arquivo, veio ${lista.length}`);
assert.equal(await countFiles(aulaId), 1);

const item = await getFile(registro.id);
assert.ok(item, 'getFile não encontrou o arquivo');
assert.equal(item.tamanho, registro.tamanho);

await saveFile(aulaId, new File(['segundo'], 'segundo.txt', { type: 'text/plain' }));
assert.equal((await listFiles(aulaId)).length, 2);

await deleteFile(registro.id);
assert.equal((await listFiles(aulaId)).length, 1, 'deleteFile não removeu o arquivo');

assert.equal(formatSize(512), '512 B');
assert.equal(formatSize(2048), '2.0 KB');
assert.equal(formatSize(3 * 1024 * 1024), '3.0 MB');
assert.ok(formatDate(Date.now()).match(/\d{2}\/\d{2}\/\d{4}|\d{2} de .+ de \d{4}/i), 'formatDate inesperado');

console.log('OK — persistência de arquivos (save/list/get/delete), tamanhos e datas validados.');
