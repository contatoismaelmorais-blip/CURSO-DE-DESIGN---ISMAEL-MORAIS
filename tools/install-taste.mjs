// Instala as skills do taste-skill na pasta de skills do projeto.
// Equivalente em português do install.sh (que exige bash) para o Windows:
// cria uma junção (junction) da skill em .claude/skills/<nome>, e se o
// sistema não permitir junction, copia os arquivos.
//
//   node tools/install-taste.mjs            # instala todas as skills
//   node tools/install-taste.mjs --list     # lista nome -> pasta
//   node tools/install-taste.mjs --uninstall
//   node tools/install-taste.mjs --copy     # copia em vez de criar junction
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const RAIZ = resolve('.');
const ORIGEM = join(RAIZ, 'taste-skill-main', 'skills');
const DESTINO = join(RAIZ, '.claude', 'skills');
const args = process.argv.slice(2);
const modo = args.includes('--uninstall') ? 'uninstall' : args.includes('--list') ? 'list' : 'install';
const usarCopia = args.includes('--copy');

/** Lê o nome da skill no frontmatter do SKILL.md (cai para o nome da pasta). */
function nomeDaSkill(dir) {
  const md = join(dir, 'SKILL.md');
  if (!existsSync(md)) return '';
  const texto = readFileSync(md, 'utf8');
  const linhas = texto.split(/\r?\n/);
  if (linhas[0]?.trim() !== '---') return '';
  for (const linha of linhas.slice(1)) {
    if (linha.trim() === '---') break;
    const m = /^name:\s*(.+)$/.exec(linha.trim());
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

if (!existsSync(ORIGEM)) {
  console.error(`Pasta de skills não encontrada: ${ORIGEM}`);
  process.exit(1);
}

const skills = readdirSync(ORIGEM, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => {
    const dir = join(ORIGEM, d.name);
    return { pasta: d.name, dir, nome: nomeDaSkill(dir) || d.name };
  });

if (!skills.length) {
  console.log('Nenhuma skill encontrada em taste-skill-main/skills.');
  process.exit(0);
}

if (modo === 'list') {
  for (const s of skills) console.log(`${s.nome.padEnd(28)} skills/${s.pasta}`);
  process.exit(0);
}

mkdirSync(DESTINO, { recursive: true });

for (const s of skills) {
  const alvo = join(DESTINO, s.nome);
  if (modo === 'uninstall') {
    if (!existsSync(alvo)) continue;
    rmSync(alvo, { recursive: true, force: true });
    console.log(`removido ${relative(RAIZ, alvo)}`);
    continue;
  }
  if (existsSync(alvo) || (() => { try { return lstatSync(alvo); } catch { return false; } })()) {
    rmSync(alvo, { recursive: true, force: true });
  }
  try {
    if (usarCopia) throw new Error('copia');
    symlinkSync(s.dir, alvo, 'junction');
    console.log(`junction  ${relative(RAIZ, alvo)} -> ${relative(RAIZ, s.dir)}`);
  } catch (err) {
    cpSync(s.dir, alvo, { recursive: true });
    console.log(`copiado   ${relative(RAIZ, alvo)} (${err.message})`);
  }
}

console.log(`\nSkills instaladas em ${relative(RAIZ, DESTINO)}:`);
for (const s of skills) console.log(`  - ${s.nome}`);
