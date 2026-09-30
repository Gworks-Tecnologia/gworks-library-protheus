#!/usr/bin/env node
// Compila fontes AdvPL/TLPP no RPO pela linha de comando, sem VS Code e SEM
// SENHA EM ARQUIVO.
//
// Usa o advpls da extensao TDS no mesmo modo em que a extensao o usa
// (language server) e o mesmo caminho de login dela: quando o usuario conecta
// num servidor/ambiente pelo VS Code, a extensao guarda um token de conexao no
// servers.json; aqui o advpls reconecta com esse token ($totvsserver/reconnect)
// e compila ($totvsserver/compilation). Nenhuma senha passa por este script.
//
// Configuracao: pth-config.mjs (settings do projeto + servers.json da extensao).
// Chamado pelo pth-compile.sh (Linux/macOS) e pelo pth-compile.ps1 (Windows).
//
// Uso: pth-compile [sufixo] [-r] [-e <alvo>]... [-a] [-h] <caminho>...
//      pth-compile -l      (servidores do servers.json, sem token)
//      pth-compile -w      (WebAgents instalados, para o campo webagent)
//
// Saida: 0 compilou em todos os ambientes; 1 erro de compilacao (ou o servidor
// recusou a compilacao); 2 uso; 3 configuracao/instalacao; 4 sem token ou
// token recusado (conectar de novo no VS Code). Varios ambientes: roda todos,
// e o codigo e o do PRIMEIRO que falhou.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ErroConfig, PAPEIS, caminhoSettings, extensoesPermitidas, lerServidor, lerSettings, listarServidores, listarWebAgents, papelEfetivo,
  resolverAmbiente, resumo,
} from './pth-config.mjs';

// ---- Argumentos ---------------------------------------------------------------
const argv = process.argv.slice(2);
const SUFIXO_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function falhar(msg, codigo) {
  console.error(msg);
  process.exit(codigo);
}

// Primeiro argumento opcional: um sufixo escolhe Scripts/pth-settings.<sufixo>.json.
// Nome simples que nao seja um caminho existente e sufixo; sem o arquivo
// correspondente e erro, nao queda silenciosa no padrao.
let sufixo = '';
if (argv.length && SUFIXO_RE.test(argv[0]) && !existsSync(argv[0])) {
  sufixo = argv.shift();
  if (!existsSync(caminhoSettings(sufixo))) falhar(`Arquivo de configuracao nao encontrado: ${caminhoSettings(sufixo)}`, 3);
}
const SETTINGS = caminhoSettings(sufixo);

function uso() {
  return `Uso: pth-compile [sufixo] [opcoes] <caminho>...

  sufixo      Usa Scripts/pth-settings.<sufixo>.json. Sem ele: PTH_SETTINGS ou
              Scripts/pth-settings.json. Tem que ser o PRIMEIRO argumento.
  caminho     Arquivo ou pasta (pasta e varrida recursivamente; uma pasta com
              .tdscompileignore fica de fora, como na extensao).

Opcoes:
  -r          Recompila (regrava no RPO mesmo sem alteracao detectada)
  -e <alvo>   Ambiente: um papel -- default, rest, workflow ou job, que valem
              env_default, env_rest, env_workflow e env_job -- ou o nome de um
              ambiente do servidor. Pode repetir. Sem -e nem -a: default
              (env_default ou, vazio, o primeiro ambiente do servidor)
  -a          Todos os ambientes configurados (env_*), sem repetir os iguais.
              Roda todos mesmo se um falhar. Nao combina com -e
  -l          Lista os servidores do servers.json (id, endereco, ambientes e em
              quais ha login salvo) -- sem token; base para criar um settings
  -w          Lista os WebAgents instalados (campo webagent do settings)
  -h          Esta ajuda

Login: token que a extensao TDS salvou ao conectar no VS Code (servidor +
ambiente). Sem ele, conecte uma vez pelo VS Code e rode de novo.

${resumo(SETTINGS)}`;
}

let recompilar = false, todos = false;
const pedidos = [], caminhos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (caminhos.length || !a.startsWith('-') || a === '-') { caminhos.push(a); continue; }
  if (a === '--') { caminhos.push(...argv.slice(i + 1)); break; }
  for (let k = 1; k < a.length; k++) {
    const f = a[k];
    if (f === 'r') recompilar = true;
    else if (f === 'a') todos = true;
    else if (f === 'h') { console.log(uso()); process.exit(0); }
    else if (f === 'l') { console.log(listarServidores()); process.exit(0); }
    else if (f === 'w') { console.log(listarWebAgents()); process.exit(0); }
    else if (f === 'e') {
      // Valor vazio e erro, nao "use o padrao": um -e "$AMB" com a variavel
      // vazia por engano nao pode cair em silencio no ambiente padrao.
      const v = k + 1 < a.length ? a.slice(k + 1) : argv[++i];
      if (!v) falhar('Opcao -e exige valor', 2);
      pedidos.push(v);
      break;
    } else {
      console.error(`Opcao invalida: -${f}`);
      falhar(uso(), 2);
    }
  }
}
if (todos && pedidos.length) falhar('-a e -e nao combinam: -a ja compila em todos os ambientes configurados.', 2);
if (!caminhos.length) falhar('Informe o que compilar: arquivo(s) ou pasta(s). -h para ajuda.', 2);

// ---- Configuracao ---------------------------------------------------------------
let settings, servidor;
try {
  settings = lerSettings(SETTINGS);
  servidor = lerServidor(settings);
} catch (e) {
  if (e instanceof ErroConfig) falhar(e.message, 3);
  throw e;
}

const ambientes = [];
const juntar = a => { if (!ambientes.includes(a)) ambientes.push(a); };
try {
  if (todos) PAPEIS.forEach(p => { const a = papelEfetivo(settings, servidor, p); if (a) juntar(a); });
  else (pedidos.length ? pedidos : ['default']).forEach(p => juntar(resolverAmbiente(settings, servidor, p)));
} catch (e) {
  if (e instanceof ErroConfig) falhar(e.message, 2);
  throw e;
}

if (!servidor.includes.length) {
  falhar(`Nenhuma pasta de include existente nesta maquina para ${servidor.nome} em ${servidor.serversJson.arquivo}`
    + (servidor.includesIgnorados.length ? `\n  nao encontradas: ${servidor.includesIgnorados.join(', ')}` : '')
    + '\nCadastre-as no assistente Include da extensao TDS.', 3);
}

// ---- Arquivos ----------------------------------------------------------------------
// Mesma regra do plugin: totvsLanguageServer.folder.enableExtensionsFilter e
// .extensionsAllowed, lidos do projeto e do perfil do VS Code (pth-config.mjs).
// O .app de um app web (PO UI) so compila se estiver nessa lista -- no VS Code
// e aqui.
const EXT = extensoesPermitidas();
const permitido = f => !EXT.filtro || EXT.lista.includes(extname(f).toUpperCase());
const FONTES_ADVPL = ['.th', '.ch', '.prw', '.prg', '.prx', '.ppx', '.ppp', '.tlpp', '.aph', '.ahu', '.apl', '.apw'];

function varrer(p, saida, fora) {
  if (statSync(p).isDirectory()) {
    if (existsSync(join(p, '.tdscompileignore'))) return;
    for (const n of readdirSync(p)) varrer(join(p, n), saida, fora);
  } else if (permitido(p)) {
    saida.push(p);
  } else {
    fora.push(p);
  }
}

const arquivos = [], foraDaLista = [];
for (const c of caminhos) {
  const abs = resolve(c);
  if (!existsSync(abs)) falhar(`Caminho nao encontrado: ${c}`, 2);
  const fora = [];
  varrer(abs, arquivos, fora);
  // Arquivo pedido pelo nome e barrado pelo filtro: avisa (e o caso do .app
  // sem .APP na lista). Dentro de pasta, so conta por extensao.
  if (!statSync(abs).isDirectory()) fora.forEach(f => console.log(`ignorado: ${basename(f)} -- ${extname(f).toUpperCase() || '(sem extensao)'} fora de totvsLanguageServer.folder.extensionsAllowed (${EXT.origem})`));
  else foraDaLista.push(...fora);
}
if (foraDaLista.length) {
  const porExt = {};
  foraDaLista.forEach(f => { const e = extname(f).toUpperCase() || '(sem extensao)'; porExt[e] = (porExt[e] || 0) + 1; });
  console.log(`fora da lista de extensoes (nao enviados): ${Object.entries(porExt).map(([e, n]) => `${e} ${n}`).join(', ')}`);
}
if (!arquivos.length) falhar('Nenhum fonte ou recurso compilavel nos caminhos informados.', 2);
const temFonteAdvpl = arquivos.some(f => FONTES_ADVPL.includes(extname(f).toLowerCase()));

// ---- advpls -------------------------------------------------------------------------
function acharAdvpls() {
  const fixo = process.env.ADVPLS || process.env.PTH_ADVPLS;
  if (fixo) return fixo;
  const base = join(homedir(), '.vscode', 'extensions');
  const bin = process.platform === 'win32' ? join('windows', 'advpls.exe')
    : process.platform === 'darwin' ? join('mac', 'advpls') : join('linux', 'advpls');
  let exts = [];
  try { exts = readdirSync(base).filter(d => d.toLowerCase().startsWith('totvs.tds-vscode-')); } catch { /* sem extensoes */ }
  exts.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const d of exts.reverse()) {
    const p = join(base, d, 'node_modules', '@totvs', 'tds-ls', 'bin', bin);
    if (existsSync(p)) return p;
  }
  return '';
}
const ADVPLS = acharAdvpls();
if (!ADVPLS || !existsSync(ADVPLS)) {
  falhar(`advpls nao encontrado${ADVPLS ? ` em ${ADVPLS}` : ' na extensao TDS (~/.vscode/extensions/totvs.tds-vscode-*)'}.\n`
    + 'Instale/atualize a extensao TOTVS.tds-vscode, ou aponte ADVPLS=<caminho do advpls>.', 3);
}

// ---- Cliente do language server (JSON-RPC sobre stdio) -----------------------------
class Lsp {
  constructor(bin) {
    this.proc = spawn(bin, ['language-server'], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.buf = Buffer.alloc(0);
    this.seq = 0;
    this.pendentes = new Map();
    this.stderr = '';
    this.aoLog = null;
    this.proc.stdout.on('data', d => this.receber(d));
    this.proc.stderr.on('data', d => { this.stderr = (this.stderr + d).slice(-8000); });
    this.proc.on('exit', code => {
      for (const { rej } of this.pendentes.values()) rej(new Error(`advpls terminou (codigo ${code})`));
      this.pendentes.clear();
    });
  }

  enviar(msg) {
    const corpo = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...msg }), 'utf8');
    this.proc.stdin.write(`Content-Length: ${corpo.length}\r\n\r\n`);
    this.proc.stdin.write(corpo);
  }

  pedir(method, params, ms = 0) {
    return new Promise((res, rej) => {
      const id = ++this.seq;
      let t = null;
      if (ms) t = setTimeout(() => { this.pendentes.delete(id); rej(new Error(`${method}: sem resposta em ${ms / 1000}s`)); }, ms);
      this.pendentes.set(id, {
        res: v => { if (t) clearTimeout(t); res(v); },
        rej: e => { if (t) clearTimeout(t); rej(e); },
      });
      this.enviar({ id, method, params });
    });
  }

  receber(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      const fim = this.buf.indexOf('\r\n\r\n');
      if (fim < 0) return;
      const m = /Content-Length:\s*(\d+)/i.exec(this.buf.subarray(0, fim).toString('ascii'));
      if (!m) { this.buf = this.buf.subarray(fim + 4); continue; }
      const n = Number(m[1]);
      if (this.buf.length < fim + 4 + n) return;
      const msg = JSON.parse(this.buf.subarray(fim + 4, fim + 4 + n).toString('utf8'));
      this.buf = this.buf.subarray(fim + 4 + n);
      this.tratar(msg);
    }
  }

  tratar(msg) {
    if (msg.id != null && !msg.method) {
      const p = this.pendentes.get(msg.id);
      if (!p) return;
      this.pendentes.delete(msg.id);
      if (msg.error) {
        const e = new Error(msg.error.message || 'erro do advpls');
        e.code = msg.error.code;
        p.rej(e);
      } else {
        p.res(msg.result);
      }
    } else if (msg.method && msg.id != null) {
      // Pedido do servidor ao cliente (configuracao, progresso, registro de
      // capacidade): responde vazio para nao travar o advpls.
      this.enviar({ id: msg.id, result: null });
    } else if (msg.method === 'window/logMessage' || msg.method === 'window/showMessage') {
      if (this.aoLog && msg.params) this.aoLog(msg.params.type, String(msg.params.message ?? ''));
    }
  }

  async iniciar() {
    await this.pedir('initialize', {
      processId: process.pid, rootUri: null, capabilities: {}, initializationOptions: { settings: [] },
    }, 60000);
    this.enviar({ method: 'initialized', params: {} });
  }

  async encerrar() {
    try {
      await this.pedir('shutdown', null, 10000);
      this.enviar({ method: 'exit' });
    } catch { /* ja caiu */ }
    setTimeout(() => this.proc.kill(), 2000).unref();
  }
}

// ---- Compilacao ------------------------------------------------------------------------
// RETENTATIVA EM "Failed to open repository": depois que uma sessao do
// Protheus cai (SmartClient, WebApp, debug), o RPO fica preso por um tempo e a
// compilacao seguinte falha com COMPILEERROR-300. Nao e erro do fonte nem do
// login: ~30s resolve.
// PTH_ESPERA_RPO encurta a espera nos testes.
const ESPERA_RPO = Number(process.env.PTH_ESPERA_RPO) || 30, TENTATIVAS = 3;
const RPO_PRESO = /COMPILEERROR-300|Failed to open repository/i;
const dormir = s => new Promise(r => setTimeout(r, s * 1000));

const OPCOES = {
  recompile: recompilar, syntaxOnly: false, debugAphInfo: true, gradualSending: true,
  generatePpoFile: false, showPreCompiler: false, priorVelocity: true, returnPpo: false,
  commitWithErrorOrWarning: false,
};
const includeUris = servidor.includes.map(p => pathToFileURL(p).href);
const fileUris = arquivos.map(p => pathToFileURL(p).href);

const lsp = new Lsp(ADVPLS);
let logDaRodada = '', ultimaLinha = '';
lsp.aoLog = (tipo, texto) => {
  logDaRodada += texto + '\n';
  // 1 erro, 2 aviso, 3 info, 4 log (detalhe interno do advpls). A mesma
  // mensagem costuma vir duas vezes (log e aviso): imprime uma.
  if ((tipo <= 3 || process.env.PTH_DEBUG) && texto !== ultimaLinha) console.log(texto);
  ultimaLinha = texto;
};

async function compilarEm(amb) {
  console.log(`servidor : ${servidor.nome} ${servidor.endereco}:${servidor.porta} (${amb})`);
  console.log(`modo     : ${recompilar ? 'recompilar' : 'compilar'} -- ${arquivos.length} arquivo(s)`);
  console.log(`alvo     : ${caminhos.map(c => resolve(c)).join('\n           ')}`);
  console.log('');

  const salvo = servidor.token(amb);
  if (!salvo) {
    console.log(`Sem token salvo para ${servidor.nome} no ambiente ${amb}.`);
    console.log('Conecte uma vez pelo VS Code (TOTVS > Servers > servidor > ambiente) e rode de novo.');
    return 4;
  }

  let conexao;
  try {
    const r = await lsp.pedir('$totvsserver/reconnect', {
      reconnectInfo: { connectionToken: salvo, serverName: servidor.nome, connType: 3 },
    }, 120000);
    conexao = r && r.connectionToken;
  } catch (e) {
    console.log(`Falha ao reconectar: ${e.message}`);
  }
  if (!conexao) {
    console.log(`O token salvo de ${servidor.nome}/${amb} nao foi aceito (invalido, expirado ou senha trocada).`);
    console.log('Conecte de novo pelo VS Code nesse ambiente e rode de novo.');
    return 4;
  }

  for (let n = 1; n <= TENTATIVAS; n++) {
    logDaRodada = '';
    let res, erro;
    try {
      res = await lsp.pedir('$totvsserver/compilation', {
        compilationInfo: {
          connectionToken: conexao, authorizationToken: servidor.tokenDeRpo(), environment: amb,
          includeUris, fileUris, compileOptions: OPCOES, extensionsAllowed: EXT.filtro ? EXT.lista : undefined,
          includeUrisRequired: temFonteAdvpl, syntaxOnly: false,
        },
      });
    } catch (e) {
      erro = e;
    }

    const infos = (res && Array.isArray(res.compileInfos)) ? res.compileInfos : [];
    const textoTodo = [erro ? erro.message : '', logDaRodada,
      ...infos.map(i => `${i.message || ''} ${i.detail || ''}`)].join('\n');

    if (RPO_PRESO.test(textoTodo) && n < TENTATIVAS) {
      console.log(`\n>>> RPO ocupado (sessao recem-encerrada). Aguardando ${ESPERA_RPO}s e tentando de novo (${n}/${TENTATIVAS - 1})...\n`);
      await dormir(ESPERA_RPO);
      continue;
    }

    if (erro) {
      console.log(`Compilacao recusada: ${erro.message}`);
      return 1;
    }

    const cont = {};
    for (const i of infos) cont[i.status] = (cont[i.status] || 0) + 1;
    for (const i of infos.filter(x => ['FATAL', 'ERROR', 'WARN'].includes(x.status))) {
      console.log(`${i.status.padEnd(5)} ${i.filePath ? basename(i.filePath) : ''}`);
      if (i.message) console.log(`      ${i.message}`);
      if (i.detail && i.detail !== i.message) console.log(`      ${String(i.detail).split('\n').join('\n      ')}`);
    }
    if (res && res.returnCode === 40840) console.log('Token de RPO expirado: renove-o na extensao TDS (RPO Token).');
    console.log(`\nresultado: ${Object.entries(cont).map(([k, v]) => `${k} ${v}`).join(', ') || '(sem retorno por arquivo)'}`);
    return (cont.FATAL || cont.ERROR) ? 1 : 0;
  }
  return 1;
}

let primeiroErro = 0;
const resumoFinal = [];
try {
  await lsp.iniciar();
  for (const [i, amb] of ambientes.entries()) {
    if (ambientes.length > 1) {
      if (i) console.log('');
      console.log(`=== ambiente ${i + 1}/${ambientes.length}: ${amb} ===`);
    }
    const codigo = await compilarEm(amb);
    resumoFinal.push(`  ${amb}: ${codigo ? `FALHOU (exit ${codigo})` : 'OK'}`);
    if (codigo && !primeiroErro) primeiroErro = codigo;
  }
} catch (e) {
  console.error(`Falha no advpls: ${e.message}`);
  if (process.env.PTH_DEBUG && lsp.stderr) console.error(lsp.stderr);
  primeiroErro = primeiroErro || 3;
} finally {
  await lsp.encerrar();
}

if (ambientes.length > 1) console.log(`\n=== resumo ===\n${resumoFinal.join('\n')}`);
process.exit(primeiroErro);
