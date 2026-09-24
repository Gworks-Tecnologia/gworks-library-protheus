#!/usr/bin/env node
//
// Executa uma User Function AdvPL/TLPP no Protheus, sem VS Code e sem ninguem
// clicando. Irmao do pth-compile.sh: um compila, o outro roda.
//
// COMO FUNCIONA. O AppServer publica o SmartClient WebApp, que e uma pagina web
// capaz de executar uma funcao indicada na propria URL:
//
//     <host>/webapp/?E=<ambiente>&P=<namespace.U_Funcao>&A=<arg1>&A=<arg2>&M=1
//
// CADA &A= E UM ARGUMENTO, na ordem -- nao e uma lista separada por virgula.
// Como e pagina web, da para dirigir por Chromium headless via CDP.
//
// POR QUE POR SCREENSHOT. As janelas do Protheus sao desenhadas em PIXEL, nao
// em DOM: varrer os frames por innerText devolve vazio enquanto o dialogo esta
// ali, visivel. So a pagina de erro fatal do runtime chega como texto (outro
// caminho de renderizacao) -- e ela e justamente a que carrega a pilha AdvPL.
//
// PRE-REQUISITO. O WebAgent tem de estar rodando (porta 21021) e em versao
// COMPATIVEL com a build do AppServer. Incompativel, a pagina responde
// "Acesso nao autorizado ao WebAgent" e nada executa.
//
// Uso:
//   node Scripts/pth-execute.mjs <namespace.U_Funcao> [rotulo] [segundos] [arg...]
//
// Servidor e ambiente saem de Scripts/pth-settings.json, o mesmo arquivo do
// pth-compile.sh (os campos estao descritos no topo dele). Aqui so importam
// ip, port e o ambiente -- user e password nao sao usados. Variaveis de
// ambiente ajustam a escolha sem editar o arquivo:
//   PROTHEUS_ENV   ambiente onde executar: um papel (default, rest, workflow,
//                  job, que valem env_default, env_rest, env_workflow e
//                  env_job) ou o nome de um ambiente de "environments".
//                  Default: env_default
//   PTH_SETTINGS   caminho de outro arquivo no lugar do padrao (um arquivo =
//                  um servidor)
//   PROTHEUS_URL   URL do WebApp, sem consultar o arquivo -- exige
//                  PROTHEUS_ENV (nome do ambiente, nao papel) junto, porque
//                  ambiente sem o servidor certo e o RPO errado. O WebApp
//                  usa a porta do AppServer: http://<ip>:<port>
//   PROTHEUS_BROWSER  executavel do Chromium/Chrome/Edge. Sem ele procura nos
//                  lugares de instalacao de Linux, Windows e macOS.
//
// Roda em Linux, Windows e macOS. No Windows, chame pelo pth-query.ps1.
//
// Exemplo:
//   node Scripts/pth-execute.mjs \
//     Gworks.Templates.ConsultaSql.Apps.U_ConsultaSqlPostConsulta consulta 180 \
//     "SELECT TOP 3 A1_COD FROM SA1010 WHERE D_E_L_E_T_ = ' '"

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const PROG   = process.argv[2];
const NOME   = process.argv[3] ?? 'execucao';
const LIMITE = Number(process.argv[4] ?? 180) * 1000;
const ARGS   = process.argv.slice(5);

if (!PROG) {
  console.error('Informe a funcao. Ex.: Gworks.Templates.X.Apps.U_Minha');
  process.exit(2);
}

const SETTINGS = process.env.PTH_SETTINGS
  || join(dirname(fileURLToPath(import.meta.url)), 'pth-settings.json');

function falha(msg) {
  console.error(msg);
  process.exit(3);
}

const PAPEIS = ['default', 'rest', 'workflow', 'job'];

// Mesma regra do pth-compile.sh: o ambiente e um papel (default, rest,
// workflow, job -> env_default, env_rest, ...) ou um nome conhecido, isto e,
// listado em "environments" ou um dos env_* preenchidos. Erro de digitacao
// vira erro aqui, nao codigo velho rodando em outro RPO.
function resolverServidor() {
  const { PROTHEUS_URL: url, PROTHEUS_ENV: pedido } = process.env;

  if (url) {
    if (!pedido) falha('PROTHEUS_URL exige PROTHEUS_ENV junto (ambiente sem o servidor certo e o RPO errado).');
    return { base: url, env: pedido };
  }

  let cfg;
  try {
    // O BOM (﻿) vem de editores que gravam UTF-8 com assinatura, comum em
    // arquivo que passa pelo Drive. O jq do pth-compile.sh ignora; o JSON.parse nao.
    cfg = JSON.parse(readFileSync(SETTINGS, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    falha(`Nao consegui ler ${SETTINGS} como JSON: ${e.message}`);
  }

  // Formato. Valor errado vira erro na hora, com o arquivo apontado. ip e nomes
  // de ambiente nao tem espaco (mesma regra do pth-compile.sh).
  const texto = v => v == null || typeof v === 'string';
  const semEspaco = v => v == null || /^\S*$/.test(v);
  const formaOk = cfg && typeof cfg === 'object' && !Array.isArray(cfg)
    && typeof cfg.ip === 'string' && /^[0-9]+$/.test(String(cfg.port))
    && (cfg.environments == null
        || (Array.isArray(cfg.environments) && cfg.environments.every(a => typeof a === 'string')))
    && [cfg.user, cfg.password, cfg.env_default, cfg.env_rest, cfg.env_workflow, cfg.env_job].every(texto)
    && [cfg.ip, cfg.env_default, cfg.env_rest, cfg.env_workflow, cfg.env_job, ...(cfg.environments ?? [])].every(semEspaco);
  if (!formaOk) {
    falha(`${SETTINGS} invalido: esperado um objeto com ip (texto), port (numero), environments (lista de textos)\n`
        + 'e user, password, env_default, env_rest, env_workflow, env_job (texto). ip e nomes de ambiente nao podem ter espacos.\n'
        + 'Veja o topo do pth-compile.sh.');
  }

  const papel = {
    default:  cfg.env_default  || '',
    rest:     cfg.env_rest     || '',
    workflow: cfg.env_workflow || '',
    job:      cfg.env_job      || '',
  };

  // Execucao so precisa de servidor e ambiente; user/password ficam de fora.
  const faltando = [];
  if (!cfg.ip || cfg.ip === '0.0.0.0') faltando.push('ip');
  if (!(Number(cfg.port) >= 1)) faltando.push('port');
  if (!papel.default) faltando.push('env_default');
  if (faltando.length) falha(`Preencha em ${SETTINGS}: ${faltando.join(', ')}`);

  const environments = cfg.environments ?? [];
  const alvo = pedido || 'default';
  let ambiente;

  if (PAPEIS.includes(alvo)) {
    ambiente = papel[alvo];
    if (!ambiente) falha(`O papel "${alvo}" nao esta configurado: env_${alvo} esta vazio em ${SETTINGS}`);
  } else {
    const conhecidos = [...environments, ...Object.values(papel).filter(Boolean)];
    if (!conhecidos.includes(alvo)) {
      falha(`Ambiente desconhecido: ${alvo}\n`
          + PAPEIS.filter(p => papel[p]).map(p => `  ${p} -> ${papel[p]}\n`).join('')
          + `  environments: ${environments.join(', ') || '(vazio)'}`);
    }
    ambiente = alvo;
  }

  return { base: `http://${cfg.ip}:${cfg.port}`, env: ambiente };
}

const { base: BASE, env: ENV } = resolverServidor();

// Navegador baseado em Chromium (Chromium, Chrome ou Edge): so ele precisa
// falar CDP e aceitar --headless=new. PROTHEUS_BROWSER aponta um executavel
// especifico; sem ele, procura nos lugares de instalacao de cada sistema. O
// primeiro Linux e o que sempre foi usado aqui.
function acharNavegador() {
  const { PROTHEUS_BROWSER: informado } = process.env;
  if (informado) {
    if (!existsSync(informado)) falha(`PROTHEUS_BROWSER nao existe: ${informado}`);
    return informado;
  }

  const e = process.env;
  const candidatos = process.platform === 'win32' ? [
    e.PROGRAMFILES && join(e.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    e['PROGRAMFILES(X86)'] && join(e['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    e.LOCALAPPDATA && join(e.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    e['PROGRAMFILES(X86)'] && join(e['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    e.PROGRAMFILES && join(e.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ] : [
    '/snap/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
  ];

  const achado = candidatos.filter(Boolean).find(c => existsSync(c));
  if (!achado) {
    falha('Nenhum navegador Chromium/Chrome/Edge encontrado. Instale um ou aponte o executavel com PROTHEUS_BROWSER.\n'
        + `Procurei em:\n  ${candidatos.filter(Boolean).join('\n  ')}`);
  }
  return achado;
}

const NAVEGADOR = acharNavegador();
const SAIDA = process.env.PROTHEUS_OUT ?? mkdtempSync(join(tmpdir(), 'protheus-'));
const PORT = Number(process.env.PROTHEUS_CDP_PORT ?? 9253);

const URL = `${BASE}/webapp/?E=${encodeURIComponent(ENV)}&P=${encodeURIComponent(PROG)}`
          + ARGS.map(a => `&A=${encodeURIComponent(a)}`).join('') + '&M=1';

const chrome = spawn(NAVEGADOR, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu',
  '--disable-dev-shm-usage', '--window-size=1600,1000',
  '--ignore-certificate-errors', '--allow-insecure-localhost',
  `--user-data-dir=${join(SAIDA, 'chrome')}`, 'about:blank'
], { stdio: 'ignore' });

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(500);
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch {}
}
if (!wsUrl) { console.error('chromium nao subiu'); process.exit(1); }

const ws = new WebSocket(wsUrl);
let id = 1; const pend = new Map();
const send = (m, p = {}, sid) => new Promise((res, rej) => {
  const n = id++; pend.set(n, { res, rej });
  ws.send(JSON.stringify({ id: n, method: m, params: p, sessionId: sid }));
});
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    const { res, rej } = pend.get(m.id); pend.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
});
await new Promise(r => ws.addEventListener('open', r, { once: true }));

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: s } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, s);
await send('Runtime.enable', {}, s);

const tela = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' }, s)).data, 'base64');

async function textoDosFrames() {
  const { frameTree } = await send('Page.getFrameTree', {}, s);
  const frames = []; (function walk(n) { frames.push(n.frame); (n.childFrames ?? []).forEach(walk); })(frameTree);
  const out = [];
  for (const f of frames) {
    try {
      const { executionContextId } = await send('Page.createIsolatedWorld', { frameId: f.id, worldName: 'ler' + Math.random() }, s);
      const { result } = await send('Runtime.evaluate', {
        expression: 'document.body ? document.body.innerText.replace(/\\n{3,}/g,"\\n").trim() : ""',
        contextId: executionContextId, returnByValue: true
      }, s);
      if (result.value) out.push(result.value);
    } catch {}
  }
  return out;
}

console.log(`servidor : ${BASE}  (${ENV})`);
console.log(`programa : ${PROG}`);
ARGS.forEach((a, i) => console.log(`arg ${i + 1}    : ${a}`));
console.log(`saida    : ${SAIDA}`);

const t0 = Date.now();
await send('Page.navigate', { url: URL }, s);

let base = 0, buf = null, morreu = false;

// O WebAgent desenha avisos proprios ("Tentando se conectar", "Acesso nao
// autorizado") ANTES de qualquer coisa do AdvPL rodar, e eles saltam o tamanho
// do PNG igual a uma janela de resultado. Sem distinguir, o harness para no
// toast e reporta um teste que nunca aconteceu. Estes avisos, ao contrario das
// janelas AdvPL, chegam ao DOM como texto -- e e por ai que da para separa-los.
const AVISO_AGENTE = /WebAgent|handshake de conex|Tentando se conectar/i;

while (Date.now() - t0 < LIMITE) {
  await sleep(2000);
  let b;
  try {
    b = await tela();
  } catch {
    // "Not attached to an active page": o AppServer derrubou a sessao. NAO e
    // travamento -- e erro FATAL no AdvPL. Confundir os dois faz otimizar uma
    // consulta que nunca foi o problema.
    morreu = true;
    console.log(`\nSESSAO ENCERRADA pelo servidor apos ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log('(erro fatal no AdvPL -- SQL invalido e a causa tipica)');
    break;
  }
  // Tela em branco comprime para poucos KB; janela com conteudo salta varias
  // vezes isso. O salto e o sinal de "terminou".
  if (!base) { base = b.length; continue; }
  if (b.length > base * 1.4) {
    const texto = (await textoDosFrames()).join('\n');
    if (AVISO_AGENTE.test(texto)) {
      // Toast do agente: rebaseia e segue esperando o que interessa.
      base = b.length;
      continue;
    }
    buf = b;
    break;
  }
}

if (!morreu) {
  const arq = join(SAIDA, `${NOME}.png`);
  writeFileSync(arq, buf ?? await tela());
  console.log(buf
    ? `\njanela detectada em ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${arq}`
    : `\nnada detectado (base ${base} bytes) -> ${arq}`);

  const textos = await textoDosFrames();
  if (textos.length) console.log(`\ntexto legivel no DOM:\n${textos.join('\n').slice(0, 5000)}`);
}

// Browser.close ANTES do kill: sem isso a sessao do AppServer fica pendurada --
// ela so cai por inatividade, e a pagina reconecta sozinha quando o servico
// volta, consumindo licenca de novo.
try { await send('Browser.close'); } catch {}
await sleep(1500);
try { chrome.kill('SIGKILL'); } catch {}
await sleep(500);
process.exit(0);
