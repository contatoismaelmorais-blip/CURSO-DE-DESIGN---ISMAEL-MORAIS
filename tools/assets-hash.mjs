// Imprime o tamanho e o sha256 dos assets do fundo.
// Serve para conferir se o arquivo do projeto é exatamente o anexo enviado.
// Roda em Node: node tools/assets-hash.mjs [arquivos...]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// --limpar apaga as cópias temporárias usadas só para comparar com o anexo.
const querLimpar = process.argv.includes('--limpar');
const args = process.argv.slice(2).filter((a) => a !== '--limpar');
const files = args;
const alvos = files.length ? files : ['public/fundo.png', 'public/fundo.mp4'];

if (querLimpar) {
  for (const temporario of ['public/fundo-novo.png', 'public/fundo-novo.mp4']) {
    if (!existsSync(temporario)) continue;
    rmSync(temporario, { force: true });
    console.log(`${temporario}: cópia temporária removida`);
  }
}

for (const alvo of alvos) {
  const file = resolve(alvo);
  if (!existsSync(file)) {
    console.log(`${alvo}: arquivo não encontrado`);
    continue;
  }
  const buf = readFileSync(file);
  const sha = createHash('sha256').update(buf).digest('hex');
  console.log(`${alvo}\n  tamanho : ${(statSync(file).size / 1024 / 1024).toFixed(2)} MB\n  sha256  : ${sha}`);
}
