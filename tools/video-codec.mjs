// Relê o cabeçalho do vídeo de fundo e informa codec, duração e resolução.
// Útil para saber se o arquivo roda em todos os navegadores alvo antes de
// confiar no fundo animado. Roda em Node: node tools/video-codec.mjs [arquivo]
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] || 'public/fundo.mp4');
if (!existsSync(file)) {
  console.error('Arquivo não encontrado:', file);
  process.exit(1);
}

const buf = readFileSync(file);
const ascii = (s) => Buffer.from(s, 'ascii');

// Codec do track de vídeo: procuramos os SampleEntry dentro de "stsd".
const codecTags = ['avc1', 'avc3', 'hvc1', 'hev1', 'vp09', 'vp08', 'av01', 'mp4v'];
const codecs = codecTags.filter((tag) => buf.includes(ascii(tag)));

// Duração: caixa mvhd (version 0 => timescale no offset 20, duration no 24
// contados a partir do início da caixa).
function mvhd() {
  const i = buf.indexOf(ascii('mvhd'));
  if (i < 0) return null;
  const version = buf[i + 4];
  const base = version === 1 ? i + 4 + 4 + 8 + 8 : i + 4 + 4 + 4 + 4;
  const timescale = buf.readUInt32BE(base);
  const duration = version === 1 ? Number(buf.readBigUInt64BE(base + 4)) : buf.readUInt32BE(base + 4);
  return { timescale, duration, seconds: duration / timescale };
}

// Resolução: caixa tkhd (version 0 => width/height 80 bytes depois do tipo).
function tkhd() {
  const i = buf.indexOf(ascii('tkhd'));
  if (i < 0) return null;
  const version = buf[i + 4];
  const off = i + (version === 1 ? 88 : 80);
  return { width: buf.readUInt32BE(off) / 65536, height: buf.readUInt32BE(off + 4) / 65536 };
}

const m = mvhd();
const t = tkhd();
const size = statSync(file).size;

console.log(`arquivo   : ${file}`);
console.log(`tamanho   : ${(size / 1024 / 1024).toFixed(2)} MB`);
console.log(`codec     : ${codecs.length ? codecs.join(', ') : 'não identificado'}`);
console.log(`resolução : ${t ? `${Math.round(t.width)}x${Math.round(t.height)}` : 'não identificada'}`);
console.log(`duração   : ${m ? `${m.seconds.toFixed(2)} s` : 'não identificada'}`);
