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
//
// WEBAGENT. Antes de E=/P= valerem, a pagina precisa falar com um WebAgent em
// 127.0.0.1 (os arquivos com "l:" passam por ele). Sem isso ela mostra
// "TOTVS WebAgent ... INSTALAR" ou "Falha ao conectar com o WebAgent!", cai no
// "Programa Inicial" e nada executa. Ha dois modos, escolhidos pelo campo
// launch_by_webagent do arquivo de settings:
//
//   launch_by_webagent = true -- roda `<webagent> launch "<url>" --browser
//     <embrulho>`. O launch sobe um agente so para essa pagina, numa porta
//     aleatoria que ele passa na URL (agent-started=launch&agent-port=<porta>).
//     O embrulho e um script gerado aqui que grava os argumentos do launch e
//     abre o "browser" headless em about:blank, com perfil descartavel e CDP
//     -- com o navegador direto, o WebAgent abriria a URL na sessao ja aberta
//     do usuario (aba na tela dele). Nao ha deteccao
//     por tela: o fim e o arquivo de PROTHEUS_WAIT_FILE aparecer (o pth-query
//     informa o de retorno); sem ela, espera o limite inteiro. No fim fecha o
//     navegador (CDP) e o agente do launch.
//
//   launch_by_webagent = false -- dirige o "browser" headless por CDP e a
//     pagina usa o WebAgent do usuario, na porta webagent_port (default
//     21021). O fim e detectado por screenshot (abaixo).
//
// Nos dois modos, antes de abrir o programa, liga o "Agente Local" da WebApp
// no perfil descartavel (chave desktopagentport do localStorage -- ver
// ligarAgenteLocal): sem ela os caminhos "l:" vao para o disco do SERVIDOR.
//
// POR QUE POR SCREENSHOT (modo direto). As janelas do Protheus sao desenhadas
// em PIXEL, nao em DOM: varrer os frames por innerText devolve vazio enquanto
// o dialogo esta ali, visivel. So a pagina de erro fatal do runtime chega como
// texto (outro caminho de renderizacao) -- e ela e justamente a que carrega a
// pilha AdvPL.
//
// Uso:
//   node Scripts/pth-execute.mjs <namespace.U_Funcao> [rotulo] [segundos] [arg...]
//
// A configuracao sai de PTH_SETTINGS ou, sem ela, de Scripts/pth-settings.json
// -- o mesmo arquivo do pth-compile.sh, cujos campos estao no topo dele (o
// pth-query escolhe Scripts/pth-settings.<sufixo>.json por PTH_SETTINGS). user
// e password nao sao usados aqui. Campos deste script:
//   https     true/false (default false): o WebApp daquele servidor atende em
//             https. Servidor so-https responde vazio (ERR_EMPTY_RESPONSE) a http.
//   webagent  caminho do executavel do WebAgent daquele cliente (a versao muda
//             conforme o cliente). Obrigatorio com launch_by_webagent.
//   browser   caminho do navegador (Chromium/Chrome/Edge).
//   webagent_port  porta do WebAgent do usuario no modo direto (default 21021).
//   launch_by_webagent  true/false (default false): o modo, acima.
//   production_database  true/false (default false): o banco daquela
//             configuracao e de producao. So informativo -- nao muda o
//             comportamento; o -h do pth-compile mostra.
//
// Variaveis de ambiente:
//   PROTHEUS_ENV   ambiente onde executar: um papel (default, rest, workflow,
//                  job, que valem env_default, env_rest, env_workflow e
//                  env_job) ou o nome de um ambiente de "environments".
//                  Default: env_default
//   PTH_SETTINGS   caminho do arquivo de settings (um arquivo = um servidor)
//   PROTHEUS_URL   URL do WebApp, sem consultar o arquivo -- exige
//                  PROTHEUS_ENV (nome do ambiente, nao papel) junto, porque
//                  ambiente sem o servidor certo e o RPO errado. O WebApp
//                  usa a porta do AppServer: http(s)://<ip>:<port>
//   PROTHEUS_BROWSER  navegador; vale mais que o "browser" do arquivo. Sem
//                  nenhum dos dois, procura nos lugares de instalacao de
//                  Linux, Windows e macOS.
//   PROTHEUS_WAIT_FILE  arquivo cujo aparecimento encerra a espera no modo
//                  launch_by_webagent.
//   PROTHEUS_OUT   pasta de saida (screenshot, perfil, embrulho).
//   PROTHEUS_CDP_PORT  porta CDP do navegador (default 9253).
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
    return { base: url, env: pedido, agentPort: 21021 };
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
    && (cfg.https == null || typeof cfg.https === 'boolean')
    && texto(cfg.webagent) && texto(cfg.browser)
    && [cfg.launch_by_webagent, cfg.production_database].every(v => v == null || typeof v === 'boolean')
    && (cfg.webagent_port == null || /^[0-9]+$/.test(String(cfg.webagent_port)))
    && [cfg.ip, cfg.env_default, cfg.env_rest, cfg.env_workflow, cfg.env_job, ...(cfg.environments ?? [])].every(semEspaco);
  if (!formaOk) {
    falha(`${SETTINGS} invalido: esperado um objeto com ip (texto), port (numero), environments (lista de textos)\n`
        + 'e user, password, env_default, env_rest, env_workflow, env_job (texto). ip e nomes de ambiente nao podem ter espacos.\n'
        + 'https, launch_by_webagent e production_database, se houver, sao true ou false; webagent e browser, se houver, sao texto (caminho do executavel).\n'
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

  return {
    base: `${cfg.https ? 'https' : 'http'}://${cfg.ip}:${cfg.port}`, env: ambiente,
    browser: cfg.browser || '', webagent: cfg.webagent || '', launch: cfg.launch_by_webagent === true,
    agentPort: Number(cfg.webagent_port) || 21021,
  };
}

const {
  base: BASE, env: ENV, browser: BROWSER_CFG, webagent: WEBAGENT, launch: LAUNCH, agentPort: AGENT_PORT,
} = resolverServidor();

// Navegador baseado em Chromium (Chromium, Chrome ou Edge): so ele precisa
// falar CDP e aceitar --headless=new. Ordem: PROTHEUS_BROWSER, depois o campo
// "browser" do arquivo de settings, depois os lugares de instalacao de cada
// sistema.
function acharNavegador() {
  const { PROTHEUS_BROWSER: informado } = process.env;
  if (informado) {
    if (!existsSync(informado)) falha(`PROTHEUS_BROWSER nao existe: ${informado}`);
    return informado;
  }
  if (BROWSER_CFG) {
    if (!existsSync(BROWSER_CFG)) falha(`browser do arquivo de settings nao existe: ${BROWSER_CFG}`);
    return BROWSER_CFG;
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

// "AGENTE LOCAL" DA WEBAPP. A opcao da engrenagem (Agente Local) fica no
// localStorage da origem, na chave "desktopagentport": com ela, os caminhos
// "l:" vao para o WebAgent; SEM ela -- todo perfil novo --, vao para o disco do
// SERVIDOR, mesmo com o agente conectado (ExistDir("l:/tmp") da .T. porque o
// servidor tambem tem /tmp; File/MemoRead de um arquivo da estacao dao .F./"").
// Por isso, antes de abrir o programa, carrega a tela inicial (mesma origem,
// sem P=) e grava a chave com a porta do agente.
async function ligarAgenteLocal(navegar, avaliar, porta) {
  await navegar(`${BASE}/webapp/`);
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try { if (await avaliar('document.readyState === "complete" && localStorage.length > 0')) break; } catch {}
  }
  await avaliar(`localStorage.setItem('desktopagentport', '${porta}'); true`);
}

// Pagina aberta num navegador com CDP: devolve navegar/avaliar da primeira aba.
// Tenta 127.0.0.1 e [::1] -- o navegador escuta num ou noutro, conforme a versao.
async function abrirAba(porta, tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    for (const host of ['127.0.0.1', '[::1]']) {
      try {
        const alvo = (await (await fetch(`http://${host}:${porta}/json/list`)).json()).find(t => t.type === 'page');
        if (!alvo) continue;
        const sock = new WebSocket(alvo.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, `ws://${host}:${porta}`));
        await new Promise((ok, erro) => { sock.onopen = ok; sock.onerror = erro; });
        let n = 0; const pend = new Map();
        sock.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
        const cmd = (method, params = {}) => new Promise(r => { const k = ++n; pend.set(k, r); sock.send(JSON.stringify({ id: k, method, params })); });
        return {
          navegar: url => cmd('Page.navigate', { url }),
          avaliar: async expr => (await cmd('Runtime.evaluate', { expression: expr, returnByValue: true }))?.result?.value,
          fechar: () => sock.close(),
        };
      } catch {}
    }
    await sleep(500);
  }
  return null;
}

if (LAUNCH) {
  if (!WEBAGENT) falha(`launch_by_webagent exige o campo webagent em ${SETTINGS}`);
  if (!existsSync(WEBAGENT)) falha(`webagent nao existe: ${WEBAGENT}`);

  const espera = process.env.PROTHEUS_WAIT_FILE;
  console.log(`servidor : ${BASE}  (${ENV})`);
  console.log(`programa : ${PROG}`);
  ARGS.forEach((a, i) => console.log(`arg ${i + 1}    : ${a}`));
  console.log(`modo     : launch_by_webagent (${WEBAGENT})`);
  console.log(`saida    : ${SAIDA}`);

  // O --browser do launch recebe um EMBRULHO, nao o navegador direto: com o
  // navegador direto o WebAgent abre a URL na sessao ja aberta do usuario (aba
  // na tela dele). O embrulho sobe um navegador proprio, headless, perfil
  // descartavel e CDP (para fechar no fim). O launch acrescenta a URL
  // agent-started=launch&agent-port=<porta> e sobe um agente so para essa
  // pagina; a pagina e https publica e o agente e 127.0.0.1, entao o Chromium
  // novo barra a conexao (ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS) --
  // headless nao tem quem aceite o pedido de permissao. Dai o
  // LocalNetworkAccessChecks desligado.
  const flags = [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu',
    '--disable-dev-shm-usage', '--window-size=1600,1000',
    '--ignore-certificate-errors', '--allow-insecure-localhost',
    '--disable-features=LocalNetworkAccessChecks',
    `--user-data-dir=${join(SAIDA, 'chrome')}`,
  ];
  // O embrulho NAO repassa a URL ao navegador: grava os argumentos do launch
  // num arquivo e abre about:blank. Daqui se le a URL (com agent-port), liga o
  // "Agente Local" nessa porta (ligarAgenteLocal) e so entao se abre o programa.
  const argsArq = join(SAIDA, 'launch-args.txt');
  let embrulho;
  if (process.platform === 'win32') {
    embrulho = join(SAIDA, 'navegador.cmd');
    writeFileSync(embrulho, `@echo off\r\necho %* > "${argsArq}"\r\n"${NAVEGADOR}" ${flags.map(f => `"${f}"`).join(' ')} about:blank\r\n`);
  } else {
    const q = s => `'${s.replace(/'/g, `'\\''`)}'`;
    embrulho = join(SAIDA, 'navegador.sh');
    writeFileSync(embrulho,
      `#!/bin/sh\nprintf '%s\\n' "$@" > ${q(argsArq)}\nexec ${q(NAVEGADOR)} ${flags.map(q).join(' ')} about:blank\n`, { mode: 0o755 });
  }

  const agente = spawn(WEBAGENT, ['launch', URL, '--browser', embrulho], { stdio: 'ignore', detached: true });
  agente.unref();

  let urlLaunch = '';
  for (let i = 0; i < 60 && !urlLaunch; i++) {
    await sleep(500);
    try { urlLaunch = (readFileSync(argsArq, 'utf8').match(/https?:\/\/[^\s"]+/) ?? [''])[0]; } catch {}
  }
  const portaLaunch = urlLaunch ? Number(new globalThis.URL(urlLaunch).searchParams.get('agent-port')) : 0;
  const aba = urlLaunch && portaLaunch ? await abrirAba(PORT) : null;
  if (aba) {
    await ligarAgenteLocal(aba.navegar, aba.avaliar, portaLaunch);
    await aba.navegar(urlLaunch);
    aba.fechar();
    console.log(`agente   : porta ${portaLaunch} (Agente Local ligado)`);
  } else {
    console.log('agente   : nao foi possivel ligar o Agente Local (URL do launch ou CDP indisponivel)');
  }

  // Fecha o navegador pelo CDP (Browser.close; matar o processo deixa a sessao
  // do AppServer viva) e o agente que o launch subiu, que senao fica rodando.
  // O navegador escuta o CDP em 127.0.0.1 ou em [::1], conforme a versao:
  // tenta os dois, senao o fechamento falha calado e o navegador fica vivo.
  const encerrar = async codigo => {
    for (const host of ['127.0.0.1', '[::1]']) {
      try {
        const v = await (await fetch(`http://${host}:${PORT}/json/version`)).json();
        const s = new WebSocket(v.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, `ws://${host}:${PORT}`));
        await new Promise((ok, erro) => { s.onopen = ok; s.onerror = erro; });
        s.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
        await sleep(1500);
        break;
      } catch {}
    }
    try { process.kill(agente.pid); } catch {}
    process.exit(codigo);
  };

  if (!espera) {
    console.log('\nsem PROTHEUS_WAIT_FILE: espera o limite inteiro e encerra');
    await sleep(LIMITE);
    await encerrar(0);
  }
  const t0 = Date.now();
  while (Date.now() - t0 < LIMITE) {
    if (existsSync(espera)) {
      console.log(`\nretorno  : ${espera} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      await encerrar(0);
    }
    await sleep(1000);
  }
  console.log(`\nnada em ${espera} apos ${LIMITE / 1000}s`);
  await encerrar(2);
}

const chrome = spawn(NAVEGADOR, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu',
  '--disable-dev-shm-usage', '--window-size=1600,1000',
  '--ignore-certificate-errors', '--allow-insecure-localhost',
  '--disable-features=LocalNetworkAccessChecks',
  `--user-data-dir=${join(SAIDA, 'chrome')}`, 'about:blank'
], { stdio: 'ignore' });

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(500);
  for (const host of ['127.0.0.1', '[::1]']) {
    try {
      wsUrl = (await (await fetch(`http://${host}:${PORT}/json/version`)).json()).webSocketDebuggerUrl
        .replace(/^ws:\/\/[^/]+/, `ws://${host}:${PORT}`);
      break;
    } catch {}
  }
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
console.log(`agente   : porta ${AGENT_PORT} (Agente Local ligado; webagent_port no arquivo de settings)`);

await ligarAgenteLocal(
  url => send('Page.navigate', { url }, s),
  async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true }, s)).result.value,
  AGENT_PORT);

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
