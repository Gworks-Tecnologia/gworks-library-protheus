#!/usr/bin/env node
// pth -- Protheus pela linha de comando, sem VS Code, sem ninguem clicando e
// SEM SENHA EM ARQUIVO. Um arquivo so, o mesmo no Linux, macOS e Windows:
//
//   node .claude/scripts/pth.mjs compile   [sufixo] [-r] [-e <alvo>]... [-a] <caminho>...
//   node .claude/scripts/pth.mjs query     [sufixo] [-e <alvo>] "<SQL>" | -f arquivo.sql  [rotulo] [segundos]
//   node .claude/scripts/pth.mjs exec      [sufixo] [-e <alvo>] <namespace.U_Funcao> [rotulo] [segundos] [arg...]
//   node .claude/scripts/pth.mjs servers                   servidores do servers.json (sem token)
//   node .claude/scripts/pth.mjs webagents [sufixo]        WebAgents instalados e qual serve
//   node .claude/scripts/pth.mjs info      [sufixo]        configuracao resolvida (sem token)
//
// Requer Node.js 22 ou mais novo (WebSocket nativo).
//
// sufixo: .claude/config/pth-settings.<sufixo>.json (um arquivo por servidor); sem ele
// vale PTH_SETTINGS ou .claude/config/pth-settings.json. <alvo>: um papel -- default,
// rest, workflow, job -- ou o nome de um ambiente do servidor.
//
// COMPILE. Usa o advpls da extensao TDS no mesmo modo em que a extensao o usa
// (language server) e o mesmo login dela: quando o usuario conecta num
// servidor/ambiente pelo VS Code, a extensao guarda um token no servers.json;
// aqui o advpls reconecta com esse token ($totvsserver/reconnect) e compila
// ($totvsserver/compilation). Saida: 0 ok; 1 erro de compilacao; 2 uso;
// 3 configuracao/instalacao; 4 sem token ou token recusado (conectar de novo
// no VS Code). Varios ambientes: roda todos; o codigo e o do PRIMEIRO que falhou.
//
// EXEC. Roda uma User Function pelo SmartClient WebApp, que executa a funcao
// indicada na propria URL:  <host>/webapp/?E=<ambiente>&P=<funcao>&A=<arg>&M=1
// (cada &A= e UM argumento). A pagina precisa de um WebAgent em 127.0.0.1 (os
// caminhos "l:" passam por ele):
//   launch_by_webagent true -- `<webagent> launch "<url>" --browser <embrulho>`:
//     um agente so para a pagina, numa porta aleatoria; o embrulho abre o
//     "browser" headless com perfil descartavel (sem ele, o WebAgent abriria a
//     URL na sessao do usuario). Fim: o arquivo esperado aparecer (o query
//     informa o de retorno); sem ele, espera o limite.
//   launch_by_webagent false -- o "browser" headless por CDP usa o WebAgent do
//     usuario (webagent_port, padrao 21021); fim detectado por screenshot (as
//     janelas do Protheus sao pixel, nao DOM).
// Nos dois, liga o "Agente Local" do WebApp no perfil descartavel (chave
// desktopagentport) e confere antes a versao do WebApp x WebAgent.
//
// QUERY. SELECT/WITH somente leitura pelo template ConsultaSql: grava o SQL em
// <temp do cliente>/consultasql.sql, apaga o retorno antigo, roda
// Gworks.Templates.ConsultaSql.Apps.U_ConsultaSqlPostConsulta RUNQUERY e espera
// <temp>/consultasql-retorno.json. Temp: /tmp no Linux/macOS; a pasta temp do
// usuario no Windows (a mesma do GetTempPath() do AdvPL).
//
// WINDOWS. As versoes anteriores (pth-query.ps1 e pth-compile.ps1) foram
// validadas no Windows pelo usuario: o fluxo da consulta (WebApp, WebAgent, o
// navegador.cmd gerado aqui, a pasta %TEMP%) e a compilacao pelo advpls cli.
// ESTE arquivo ainda nao rodou la. Suposicoes, se algo falhar: advpls.exe em
// ...\@totvs\tds-ls\bin\windows\advpls.exe (tirado do codigo da extensao);
// settings do VS Code em %APPDATA%\Code\User (perfis em profiles\<id>\,
// associacao pasta->perfil em globalStorage\storage.json, chave
// "file:///c%3A/..."); servers.json global em %USERPROFILE%\.totvsls; WebAgent
// em %LOCALAPPDATA%\Programs\web-agent (web-agent.exe ou webagent.exe).
// >>> PARA O CLAUDE: nao afirme que este arquivo funciona no Windows antes de o
// usuario rodar la: node .claude\scripts\pth.mjs info / webagents / compile <fonte
// pequeno, ambiente de teste> / query "SELECT ..." -- depois troque este
// paragrafo por "Validado em Windows em <data>".
//
// Variaveis de ambiente: PTH_SETTINGS, PTH_SERVERS_JSON (fixa um servers.json),
// ADVPLS/PTH_ADVPLS (fixa o advpls), PTH_DEBUG, PTH_ESPERA_RPO (testes),
// PROTHEUS_ENV (alvo do exec/query), PROTHEUS_URL (WebApp sem o settings; exige
// PROTHEUS_ENV), PROTHEUS_BROWSER, PROTHEUS_WAIT_FILE, PROTHEUS_OUT,
// PROTHEUS_CDP_PORT (padrao 9253), PROTHEUS_SQL_PATH.
//
// ---------------------------------------------------------------------------
// SETTINGS (.claude/config/pth-settings.json ou .claude/config/pth-settings.<sufixo>.json)
// guarda so o que NAO esta no servers.json -- nada de ip, porta, usuario,
// senha ou includes:
//
//   server              id (ou nome) da configuracao no servers.json      obrigatorio
//   env_default         Ambiente (RPO) de compilacao e do WebApp            opcional
//                       (vazio: o primeiro ambiente do servidor no servers.json)
//   env_rest            Ambiente que o REST Server atende                   opcional
//   env_workflow        Ambiente do workflow                                opcional
//   env_job             Ambiente de job/schedule                            opcional
//   https               WebApp do servidor responde em https (true/false)   opcional
//   webagent            Executavel do WebAgent daquele ambiente             opcional
//   browser             Chromium/Chrome/Edge das execucoes pelo WebApp      opcional
//   webagent_port       Porta do WebAgent do usuario (modo direto)          opcional
//   launch_by_webagent  Execucao por "<webagent> launch" (true/false)      opcional
//   production_database Banco de producao (true/false): so informativo    opcional
//
// Os env_* sao PAPEIS: marcam para que serve cada ambiente, para quem roda os
// scripts (inclusive um agente de IA) escolher o RPO certo. Rest, workflow e
// job so existem se o usuario os informou; nao sao deduzidos do nome.
//
// SERVERS.JSON e o registro da propria extensao TDS, e mora onde a extensao o
// procura: a opcao totvsLanguageServer.workspaceServerConfig (o icone de casa
// ou de globo na barra de status do VS Code) decide. Ligada (casa):
// <projeto>/.vscode/servers.json. Desligada (globo, o padrao):
// ~/.totvsls/servers.json. A opcao e lida como o VS Code le: settings do
// projeto, depois os do PERFIL do VS Code associado a esta pasta (ou os do
// usuario, sem perfil), depois o padrao. A lista de extensoes compilaveis
// (totvsLanguageServer.folder.*) sai do mesmo lugar -- e la que se inclui o
// .APP dos apps web (PO UI). Do servers.json saem endereco, porta, usuario,
// ambientes, includes e o token de conexao.
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import {
  existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error(`pth.mjs requer Node.js 22 ou mais novo (este e ${process.versions.node}).`);
  process.exit(3);
}

class ErroUso extends Error {}

function falhar(msg, codigo) {
  console.error(msg);
  process.exit(codigo);
}

// =============================================================================
// CONFIGURACAO: settings + servers.json + VS Code
// =============================================================================

// Este arquivo mora em <projeto>/.claude/scripts/; os settings, em
// <projeto>/.claude/config/. REPO e a raiz do projeto (a pasta aberta no VS
// Code): e dela que saem .vscode/, os includes relativos e o perfil.
const AQUI = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(AQUI, '..', '..');
const CONFIG = resolve(AQUI, '..', 'config');
const PAPEIS = ['default', 'rest', 'workflow', 'job'];

class ErroConfig extends Error {}

// ---- JSON com comentarios (settings do VS Code) ------------------------------
// O settings.json do VS Code aceita // e /* */ e virgula sobrando antes de } ou
// ]. Tira os dois fora de strings e entrega ao JSON.parse.
function parseJsonc(texto) {
  let out = '';
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i], d = texto[i + 1];
    if (c === '"') {
      let j = i + 1;
      while (j < texto.length && texto[j] !== '"') j += texto[j] === '\\' ? 2 : 1;
      out += texto.slice(i, j + 1);
      i = j;
    } else if (c === '/' && d === '/') {
      while (i < texto.length && texto[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && d === '*') {
      i = texto.indexOf('*/', i + 2);
      if (i < 0) break;
      i++;
    } else {
      out += c;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

function lerJson(arquivo, { jsonc = false } = {}) {
  // BOM: editores que gravam UTF-8 com assinatura, comum em arquivo que passa
  // pelo Drive.
  const texto = readFileSync(arquivo, 'utf8').replace(/^﻿/, '');
  return jsonc ? parseJsonc(texto) : JSON.parse(texto);
}

// ---- Settings ------------------------------------------------------------------
function caminhoSettings(sufixo) {
  if (sufixo) return join(CONFIG, `pth-settings.${sufixo}.json`);
  return process.env.PTH_SETTINGS || join(CONFIG, 'pth-settings.json');
}

function lerSettings(arquivo) {
  if (!existsSync(arquivo)) {
    throw new ErroConfig(`Arquivo de configuracao nao encontrado: ${arquivo}\n`
      + 'Crie-o pela skill advpl-tlpp-compile (referencia pth-cli-reference.md, "Settings").');
  }
  let cfg;
  try {
    cfg = lerJson(arquivo);
  } catch (e) {
    throw new ErroConfig(`Nao consegui ler ${arquivo} como JSON: ${e.message}`);
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    throw new ErroConfig(`${arquivo} invalido: esperado um objeto JSON.`);
  }

  // Formato antigo: servidor e credencial no proprio arquivo. Erro com o
  // caminho da migracao, nunca leitura silenciosa -- a senha nao pode continuar
  // parada ali achando que ainda e usada.
  const antigos = ['ip', 'port', 'user', 'password', 'environments', 'includes'].filter(k => k in cfg);
  if (antigos.length) {
    throw new ErroConfig(`${arquivo} esta no formato antigo (${antigos.join(', ')}).\n`
      + 'Servidor, usuario, ambientes e includes agora vem do servers.json da extensao TDS, e a senha\n'
      + 'nao fica em arquivo nenhum. Troque esses campos por "server": "<id ou nome no servers.json>"\n'
      + '(e apague a senha). Veja pth-cli-reference.md, "Settings".');
  }

  const texto = v => v == null || typeof v === 'string';
  const logico = v => v == null || typeof v === 'boolean';
  const semEspaco = v => v == null || /^\S*$/.test(v);
  const envs = [cfg.env_default, cfg.env_rest, cfg.env_workflow, cfg.env_job];
  const ok = typeof cfg.server === 'string'
    && envs.every(texto) && envs.every(semEspaco)
    && [cfg.webagent, cfg.browser].every(texto)
    && [cfg.https, cfg.launch_by_webagent, cfg.production_database].every(logico)
    && (cfg.webagent_port == null || /^[0-9]+$/.test(String(cfg.webagent_port)));
  if (!ok) {
    throw new ErroConfig(`${arquivo} invalido: server e env_* sao texto (env_* sem espacos),\n`
      + 'https, launch_by_webagent e production_database sao true ou false, webagent e browser sao texto\n'
      + 'e webagent_port e numero.');
  }
  if (!cfg.server) throw new ErroConfig(`Preencha em ${arquivo}: server`);

  return {
    arquivo,
    server: cfg.server,
    papel: {
      default: cfg.env_default || '',
      rest: cfg.env_rest || '',
      workflow: cfg.env_workflow || '',
      job: cfg.env_job || '',
    },
    https: cfg.https === true,
    webagent: cfg.webagent || '',
    browser: cfg.browser || '',
    webagentPort: Number(cfg.webagent_port) || 21021,
    launch: cfg.launch_by_webagent === true,
    producao: cfg.production_database === true,
  };
}

// ---- Configuracao do VS Code (projeto > perfil/usuario > padrao) ---------------------
function pastaUsuarioVsCode() {
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Code', 'User');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Code', 'User');
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Code', 'User');
}

// O VS Code guarda em globalStorage/storage.json qual perfil cada pasta usa
// (profileAssociations.workspaces: "file:///<pasta>" -> location). Perfil com
// useDefaultFlags.settings usa o settings.json padrao; pasta sem associacao
// tambem.
function normalizarUri(u) {
  let x = decodeURIComponent(u).replace(/\/+$/, '');
  if (process.platform === 'win32') x = x.toLowerCase();
  return x;
}

function settingsDoPerfil() {
  const pasta = pastaUsuarioVsCode();
  const padrao = { arquivo: join(pasta, 'settings.json'), perfil: 'Default' };
  let storage;
  try { storage = lerJson(join(pasta, 'globalStorage', 'storage.json')); } catch { return padrao; }
  const assoc = (storage.profileAssociations && storage.profileAssociations.workspaces) || {};
  const candidatos = new Set([REPO, (() => { try { return realpathSync(REPO); } catch { return REPO; } })()]
    .map(p => normalizarUri(pathToFileURL(p).href)));
  const chave = Object.keys(assoc).find(k => candidatos.has(normalizarUri(k)));
  if (!chave) return padrao;
  const loc = assoc[chave];
  const perfil = (storage.userDataProfiles || []).find(x => x.location === loc) || {};
  if (perfil.useDefaultFlags && perfil.useDefaultFlags.settings) return { ...padrao, perfil: `${perfil.name || loc} (usa o settings padrao)` };
  return { arquivo: join(pasta, 'profiles', loc, 'settings.json'), perfil: perfil.name || loc };
}

function lerChave(arquivo, chave) {
  if (!existsSync(arquivo)) return undefined;
  try { return lerJson(arquivo, { jsonc: true })[chave]; } catch { return undefined; }
}

// Valor de uma configuracao como o VS Code a enxerga nesta pasta, e de onde veio.
function configVsCode(chave, valido) {
  const doProjeto = join(REPO, '.vscode', 'settings.json');
  const perfil = settingsDoPerfil();
  for (const [arquivo, origem] of [[doProjeto, doProjeto], [perfil.arquivo, `${perfil.arquivo} (perfil ${perfil.perfil})`]]) {
    const v = lerChave(arquivo, chave);
    if (v !== undefined && valido(v)) return { valor: v, origem };
  }
  return { valor: undefined, origem: 'padrao da extensao' };
}

// ---- Onde esta o servers.json (casa ou globo) ------------------------------------
function localizarServersJson() {
  if (process.env.PTH_SERVERS_JSON) {
    return { arquivo: resolve(process.env.PTH_SERVERS_JSON), modo: 'PTH_SERVERS_JSON', origem: 'variavel de ambiente' };
  }
  const c = configVsCode('totvsLanguageServer.workspaceServerConfig', v => typeof v === 'boolean');
  return c.valor === true
    ? { arquivo: join(REPO, '.vscode', 'servers.json'), modo: 'workspace (casa)', origem: c.origem }
    : { arquivo: join(homedir(), '.totvsls', 'servers.json'), modo: 'global (globo)', origem: c.origem };
}

// ---- Extensoes compilaveis (a mesma regra do plugin) -----------------------------------
// Padrao da extensao (totvsLanguageServer.folder.extensionsAllowed). O .APP
// (app web empacotado, aberto por FWCallApp) NAO esta nele: quem compila .app
// o inclui na configuracao do plugin, e este script passa a aceitar tambem.
const EXTENSOES_PADRAO = ['.PRW', '.PRX', '.PRG', '.PPX', '.PPP', '.TLPP', '.APW', '.APH', '.APL', '.AHU',
  '.TRES', '.PNG', '.BMP', '.RES', '.4GL', '.PER', '.JS', '.RPTDESIGN'];

function extensoesPermitidas() {
  const filtro = configVsCode('totvsLanguageServer.folder.enableExtensionsFilter', v => typeof v === 'boolean');
  if (filtro.valor === false) return { filtro: false, lista: null, origem: filtro.origem };
  const lista = configVsCode('totvsLanguageServer.folder.extensionsAllowed',
    v => Array.isArray(v) && v.every(x => typeof x === 'string'));
  return {
    filtro: true,
    lista: (lista.valor || EXTENSOES_PADRAO).map(x => x.toUpperCase()),
    origem: lista.origem,
  };
}

// ---- Servidor ---------------------------------------------------------------------
// Includes como a extensao: os da configuracao do servidor; sem eles, os do
// topo do arquivo. "${workspaceFolder}" e caminho relativo resolvem a partir
// do projeto, e so ficam pastas que existem NESTA maquina -- quem le os
// includes e o advpls local.
function processarIncludes(lista) {
  const validos = [], ignorados = [];
  for (const bruto of lista) {
    if (typeof bruto !== 'string' || !bruto.trim()) continue;
    let p = bruto.replace('${workspaceFolder}', REPO);
    p = isAbsolute(p) ? resolve(p) : resolve(REPO, p);
    let pasta = false;
    try { pasta = statSync(p).isDirectory(); } catch { /* nao existe */ }
    (pasta ? validos : ignorados).push(p);
  }
  return { validos: [...new Set(validos)], ignorados };
}

function tokensSalvos(servers) {
  // savedTokens: lista de pares [ "<id>:<ambiente>", { id, token } ] (a
  // extensao tambem ja gravou como objeto em versoes antigas).
  const st = servers.savedTokens;
  const pares = Array.isArray(st) ? st : (st && typeof st === 'object' ? Object.entries(st) : []);
  const mapa = new Map();
  for (const par of pares) {
    if (Array.isArray(par) && typeof par[0] === 'string' && par[1] && typeof par[1].token === 'string') {
      mapa.set(par[0], par[1].token);
    }
  }
  return mapa;
}

function tokenDeRpo(servers, build) {
  // Mesma regra da extensao: do build 7.00.191205P em diante vale o RPO token
  // (quando habilitado); antes, a chave de compilacao em "permissions".
  const p20 = typeof build === 'string' && build.localeCompare('7.00.191205P') > 0;
  if (p20) {
    const rt = servers.rpoToken;
    return rt && rt.enabled !== false && typeof rt.token === 'string' ? rt.token : '';
  }
  return (servers.permissions && servers.permissions.authorizationToken) || '';
}

function lerServidor(settings) {
  const local = localizarServersJson();
  if (!existsSync(local.arquivo)) {
    throw new ErroConfig(`Nao encontrei ${local.arquivo} (${local.modo}, decidido por: ${local.origem}).\n`
      + 'Cadastre o servidor na extensao TDS (TOTVS > Servers > +) ou aponte PTH_SERVERS_JSON.');
  }
  let servers;
  try {
    servers = lerJson(local.arquivo);
  } catch (e) {
    throw new ErroConfig(`Nao consegui ler ${local.arquivo} como JSON: ${e.message}`);
  }
  const confs = Array.isArray(servers.configurations) ? servers.configurations : [];
  let c = confs.find(x => x.id === settings.server);
  if (!c) {
    const porNome = confs.filter(x => x.name === settings.server);
    if (porNome.length > 1) {
      throw new ErroConfig(`Ha ${porNome.length} servidores chamados "${settings.server}" em ${local.arquivo}: use o id em "server".`);
    }
    c = porNome[0];
  }
  if (!c) {
    throw new ErroConfig(`Servidor "${settings.server}" (de ${settings.arquivo}) nao existe em ${local.arquivo}.\n`
      + 'Cadastrados: ' + (confs.map(x => `${x.name} [${x.id}]`).join(', ') || '(nenhum)'));
  }

  const listaIncludes = Array.isArray(c.includes) && c.includes.some(s => typeof s === 'string' && s.trim())
    ? c.includes : (Array.isArray(servers.includes) ? servers.includes : []);
  const includes = processarIncludes(listaIncludes);
  const tokens = tokensSalvos(servers);

  return {
    serversJson: local,
    id: c.id,
    nome: c.name || c.id,
    endereco: c.address,
    porta: Number(c.port),
    secure: !!c.secure,
    build: c.buildVersion || '',
    usuario: c.username || '',
    ambientes: Array.isArray(c.environments) ? c.environments.filter(a => typeof a === 'string') : [],
    includes: includes.validos,
    includesIgnorados: includes.ignorados,
    // So o script usa o token: nunca imprimir, logar ou copiar.
    token: amb => tokens.get(`${c.id}:${amb}`) || '',
    temToken: amb => tokens.has(`${c.id}:${amb}`),
    tokenDeRpo: () => tokenDeRpo(servers, c.buildVersion),
  };
}

// ---- Ambiente: papel ou nome -------------------------------------------------------
// O AMBIENTE ESCOLHE O RPO, e um AppServer serve varios, cada um com o SEU
// binario: compilar em um nao publica no outro. Por isso -e/PROTHEUS_ENV so
// aceitam papel configurado ou nome conhecido: erro de digitacao vira erro na
// hora, nao codigo velho rodando em outro RPO.
//
// O papel default vazio vale o primeiro ambiente do servidor no servers.json;
// os outros papeis so existem se estiverem preenchidos.
function papelEfetivo(settings, servidor, papel) {
  return settings.papel[papel] || (papel === 'default' ? (servidor.ambientes[0] || '') : '');
}

function resolverAmbiente(settings, servidor, alvo) {
  if (PAPEIS.includes(alvo)) {
    const amb = papelEfetivo(settings, servidor, alvo);
    if (!amb && alvo === 'default') {
      throw new ErroConfig(`Sem ambiente padrao: env_default vazio em ${settings.arquivo} e ${servidor.nome} nao tem ambientes no servers.json\n`
        + '(conecte num ambiente pelo VS Code, ou preencha env_default).');
    }
    if (!amb) throw new ErroConfig(`O papel "${alvo}" nao esta configurado: env_${alvo} esta vazio em ${settings.arquivo}`);
    return amb;
  }
  const papeis = PAPEIS.map(p => [p, papelEfetivo(settings, servidor, p)]).filter(([, a]) => a);
  const conhecidos = [...servidor.ambientes, ...papeis.map(([, a]) => a)];
  if (!conhecidos.includes(alvo)) {
    throw new ErroConfig(`Ambiente desconhecido: ${alvo}\n`
      + papeis.map(([p, a]) => `  ${p} -> ${a}\n`).join('')
      + `  ambientes do servidor: ${servidor.ambientes.join(', ') || '(nenhum)'}`);
  }
  return alvo;
}

// ---- Lista dos servidores (sem token): base para criar um settings -----------------
function listarServidores() {
  const local = localizarServersJson();
  const linhas = [`servers.json: ${local.arquivo}`, `  modo: ${local.modo} -- decidido por: ${local.origem}`];
  if (!existsSync(local.arquivo)) return linhas.concat('  (arquivo nao existe: cadastre o servidor na extensao TDS)').join('\n');
  let servers;
  try {
    servers = lerJson(local.arquivo);
  } catch (e) {
    return linhas.concat(`  (nao consegui ler como JSON: ${e.message})`).join('\n');
  }
  const tokens = tokensSalvos(servers);
  const confs = Array.isArray(servers.configurations) ? servers.configurations : [];
  if (!confs.length) linhas.push('  (nenhum servidor cadastrado)');
  for (const c of confs) {
    const ambs = Array.isArray(c.environments) ? c.environments : [];
    const con = ambs.filter(a => tokens.has(`${c.id}:${a}`));
    linhas.push('', `  ${c.name}`, `    id         : ${c.id}`, `    endereco   : ${c.address}:${c.port}`,
      `    usuario    : ${c.username || '-'}`, `    ambientes  : ${ambs.join(', ') || '-'}`,
      `    conectados : ${con.join(', ') || '-'} (token salvo pela extensao)`);
  }
  return linhas.join('\n');
}

// ---- WebAgents instalados: base para o campo "webagent" ------------------------------
// O servers.json nao sabe nada do WebAgent, e a execucao pelo WebApp precisa
// dele (e da versao certa: WebApp 10.2.0+ -> WebAgent 1.1.x; abaixo -> 1.0.x).
// Procura nos lugares de instalacao padrao, sem executar nada; a versao sai do
// nome da pasta quando ele a traz.
const PASTAS_WEBAGENT = {
  linux: ['/opt/web-agent'],
  win32: [join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Programs', 'web-agent')],
  darwin: ['/Applications', join(homedir(), 'Applications')],
};
const NOMES_WEBAGENT = /^(web-?agent)(\.exe)?$/i;

// Versao do WebApp de um servidor: a pagina inicial carrega
// "webapp-<versao>-frontend.min.js", entao um GET sem login basta. Devolve ''
// se nao der para ler (servidor fora, certificado, formato novo).
function lerVersaoWebApp(base, ms = 15000) {
  return new Promise(res => {
    let url;
    try { url = new URL('/webapp/', base); } catch { res(''); return; }
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(url, { rejectUnauthorized: false, timeout: ms }, r => {
      let corpo = '';
      r.setEncoding('utf8');
      r.on('data', d => { corpo += d; if (corpo.length > 2e6) r.destroy(); });
      r.on('end', () => res((corpo.match(/webapp-(\d+(?:\.\d+)+)/) || [])[1] || ''));
      r.on('error', () => res(''));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => res(''));
  });
}

// WebApp 10.2.0 ou mais novo fala com WebAgent 1.1.x (handshake JWT); abaixo,
// 1.0.x. Com a serie errada a pagina nao conversa com o agente e a execucao
// simplesmente nao acontece.
const cmpVersao = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const serieWebAgent = versaoWebApp => (cmpVersao(versaoWebApp, '10.2.0') >= 0 ? '1.1' : '1.0');
const versaoPeloCaminho = p => ((p || '').match(/(\d+\.\d+\.\d+)/) || [])[1] || '';

// ok: true/false quando a versao do WebAgent e conhecida pelo caminho; null
// quando nao da para saber (a da raiz da instalacao, "ultima versao").
function conferirWebAgent(versaoWebApp, caminho) {
  const serie = serieWebAgent(versaoWebApp);
  const va = versaoPeloCaminho(caminho);
  return { serie, versaoAgente: va, ok: va ? va.startsWith(`${serie}.`) : null };
}

function listarWebAgents(ctx = null) {
  const achados = [];
  const varrer = (dir, nivel) => {
    if (nivel > 6) return;
    let itens = [];
    try { itens = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const it of itens) {
      const p = join(dir, it.name);
      if (it.isDirectory()) varrer(p, nivel + 1);
      else if (it.isFile() && NOMES_WEBAGENT.test(it.name)) achados.push(p);
    }
  };
  const pastas = PASTAS_WEBAGENT[process.platform] || [];
  pastas.forEach(d => varrer(d, 0));
  const linhas = [`WebAgents em: ${pastas.join(', ') || '(sem pasta padrao para este sistema)'}`];
  const serie = ctx && ctx.versaoWebApp ? serieWebAgent(ctx.versaoWebApp) : '';
  if (ctx) {
    linhas.unshift(serie
      ? `WebApp de ${ctx.servidor}: ${ctx.versaoWebApp} -> precisa de WebAgent ${serie}.x`
      : `WebApp de ${ctx.servidor}: versao nao lida (servidor inacessivel?)`);
  }
  if (!achados.length) linhas.push('  (nenhum encontrado: pergunte o caminho ao usuario)');
  // Na raiz da pasta padrao fica a ultima versao que o usuario instalou (o
  // caminho nao traz o numero, e nem precisa); as anteriores ficam em pastas
  // com a versao no nome.
  for (const p of achados.sort()) {
    const v = (p.match(/(\d+\.\d+\.\d+)/) || [])[1];
    const naRaiz = pastas.some(d => resolve(dirname(p)) === resolve(d));
    let marca = '';
    if (serie) marca = v ? (v.startsWith(`${serie}.`) ? '  <- serve' : '  (nao serve)') : `  (serve se for ${serie}.x)`;
    if (ctx && ctx.atual && resolve(ctx.atual) === resolve(p)) marca += '  [no settings]';
    linhas.push(`  ${p}  ${v ? `(versao ${v}, pelo nome da pasta)` : naRaiz ? '(ultima versao instalada)' : '(versao nao identificada pelo caminho)'}${marca}`);
  }
  linhas.push('Regra: WebApp 10.2.0 ou mais novo -> WebAgent 1.1.x; abaixo -> 1.0.x.');
  return linhas.join('\n');
}

// ---- Resumo da configuracao (subcomando info; sem token) ----------------------------------------------------
function resumo(settingsArquivo) {
  const linhas = [`Configuracao: ${settingsArquivo}`];
  let settings;
  try {
    settings = lerSettings(settingsArquivo);
  } catch (e) {
    return linhas.concat(`  (${e.message.split('\n')[0]})`).join('\n');
  }
  const v = x => (x === '' || x == null ? '-' : x);
  linhas.push(
    `  server       : ${settings.server}`,
    `  env_default  : ${v(settings.papel.default)}`,
    `  env_rest     : ${v(settings.papel.rest)}`,
    `  env_workflow : ${v(settings.papel.workflow)}`,
    `  env_job      : ${v(settings.papel.job)}`,
    `  https        : ${settings.https} (webapp)`,
    `  webagent     : ${v(settings.webagent)}`,
    `  browser      : ${v(settings.browser)}`,
    `  webagent_port: ${settings.webagentPort}`,
    `  launch_by_webagent  : ${settings.launch}`,
    `  production_database : ${settings.producao}`,
  );
  try {
    const s = lerServidor(settings);
    const comToken = s.ambientes.filter(a => s.temToken(a));
    const semToken = PAPEIS.map(p => papelEfetivo(settings, s, p)).filter(a => a && !s.temToken(a));
    linhas.push(
      `servers.json: ${s.serversJson.arquivo}`,
      `  modo         : ${s.serversJson.modo} -- decidido por: ${s.serversJson.origem}`,
      `  servidor     : ${s.nome} [${s.id}] ${s.endereco}:${s.porta}${s.secure ? ' (secure)' : ''}`,
      ...(settings.papel.default ? [] : [`  default      : ${papelEfetivo(settings, s, 'default') || '(servidor sem ambientes)'} (env_default vazio: primeiro ambiente do servidor)`]),
      `  build        : ${v(s.build)}`,
      `  usuario      : ${v(s.usuario)}`,
      `  ambientes    : ${s.ambientes.join(', ') || '-'}`,
      `  conectados   : ${comToken.join(', ') || '-'} (token salvo pela extensao)`,
      ...(semToken.length ? [`  SEM TOKEN    : ${[...new Set(semToken)].join(', ')} -- conecte no VS Code nesse ambiente`] : []),
      `  includes     : ${s.includes.join(', ') || '-'}`,
      ...(s.includesIgnorados.length ? [`  includes nao encontrados nesta maquina: ${s.includesIgnorados.join(', ')}`] : []),
    );
    const ext = extensoesPermitidas();
    linhas.push(ext.filtro
      ? `  extensoes    : ${ext.lista.join(' ')} -- de: ${ext.origem}`
      : `  extensoes    : sem filtro (enableExtensionsFilter false) -- de: ${ext.origem}`);
  } catch (e) {
    linhas.push(`servers.json: (${e.message.split('\n')[0]})`);
  }
  return linhas.join('\n');
}

// =============================================================================
// COMPILE
// =============================================================================

const SUFIXO_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

// Sufixo opcional como primeiro argumento do subcomando: nome simples ->
// .claude/config/pth-settings.<sufixo>.json; sem o arquivo, erro (nao queda silenciosa
// no padrao). "ehSufixo" decide o caso ambiguo de cada subcomando.
function tirarSufixo(args, ehSufixo) {
  if (args.length && SUFIXO_RE.test(args[0]) && ehSufixo(args[0])) {
    const sufixo = args.shift();
    const arquivo = caminhoSettings(sufixo);
    if (!existsSync(arquivo)) falhar(`Arquivo de configuracao nao encontrado: ${arquivo}`, 3);
    return arquivo;
  }
  return caminhoSettings('');
}

function usoCompile(settingsArquivo) {
  return `Uso: node .claude/scripts/pth.mjs compile [sufixo] [opcoes] <caminho>...

  sufixo      .claude/config/pth-settings.<sufixo>.json. Sem ele: PTH_SETTINGS ou
              .claude/config/pth-settings.json. Tem que vir logo depois de "compile".
  caminho     Arquivo ou pasta (pasta e varrida recursivamente; uma pasta com
              .tdscompileignore fica de fora, como na extensao).

Opcoes:
  -r          Recompila (regrava no RPO mesmo sem alteracao detectada)
  -e <alvo>   Ambiente: um papel -- default, rest, workflow ou job, que valem
              env_default, env_rest, env_workflow e env_job -- ou o nome de um
              ambiente do servidor. Pode repetir. Sem -e nem -a: default
              (env_default ou, vazio, o primeiro ambiente do servidor)
  -a          O ambiente padrao e todos os env_* preenchidos, sem repetir os
              iguais. Roda todos mesmo se um falhar. Nao combina com -e
  -h          Esta ajuda

Login: token que a extensao TDS salvou ao conectar no VS Code (servidor +
ambiente). Sem ele, conecte uma vez pelo VS Code e rode de novo.

${resumo(settingsArquivo)}`;
}

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

// Cliente do language server (JSON-RPC com o enquadramento do LSP, sobre stdio).
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

// RETENTATIVA EM "Failed to open repository": depois que uma sessao do
// Protheus cai (SmartClient, WebApp, debug), o RPO fica preso por um tempo e a
// compilacao seguinte falha com COMPILEERROR-300. Nao e erro do fonte nem do
// login: ~30s resolve. PTH_ESPERA_RPO encurta a espera nos testes.
const TENTATIVAS = 3;
const RPO_PRESO = /COMPILEERROR-300|Failed to open repository/i;
const FONTES_ADVPL = ['.th', '.ch', '.prw', '.prg', '.prx', '.ppx', '.ppp', '.tlpp', '.aph', '.ahu', '.apl', '.apw'];

async function cmdCompile(args) {
  const SETTINGS = tirarSufixo(args, a => !existsSync(a));
  const ESPERA_RPO = Number(process.env.PTH_ESPERA_RPO) || 30;

  let recompilar = false, todos = false;
  const pedidos = [], caminhos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (caminhos.length || !a.startsWith('-') || a === '-') { caminhos.push(a); continue; }
    if (a === '--') { caminhos.push(...args.slice(i + 1)); break; }
    for (let k = 1; k < a.length; k++) {
      const f = a[k];
      if (f === 'r') recompilar = true;
      else if (f === 'a') todos = true;
      else if (f === 'h') { console.log(usoCompile(SETTINGS)); process.exit(0); }
      else if (f === 'e') {
        // Valor vazio e erro, nao "use o padrao": um -e "$AMB" com a variavel
        // vazia por engano nao pode cair em silencio no ambiente padrao.
        const v = k + 1 < a.length ? a.slice(k + 1) : args[++i];
        if (!v) falhar('Opcao -e exige valor', 2);
        pedidos.push(v);
        break;
      } else {
        console.error(`Opcao invalida: -${f}`);
        falhar(usoCompile(SETTINGS), 2);
      }
    }
  }
  if (todos && pedidos.length) falhar('-a e -e nao combinam: -a ja compila em todos os ambientes configurados.', 2);
  if (!caminhos.length) falhar('Informe o que compilar: arquivo(s) ou pasta(s). compile -h para ajuda.', 2);

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

  // Mesma regra do plugin: totvsLanguageServer.folder.enableExtensionsFilter e
  // .extensionsAllowed, do projeto e do perfil do VS Code. O .app de um app web
  // (PO UI) so compila se estiver nessa lista -- no VS Code e aqui.
  const EXT = extensoesPermitidas();
  const permitido = f => !EXT.filtro || EXT.lista.includes(extname(f).toUpperCase());
  const varrer = (p, saida, fora) => {
    if (statSync(p).isDirectory()) {
      if (existsSync(join(p, '.tdscompileignore'))) return;
      for (const n of readdirSync(p)) varrer(join(p, n), saida, fora);
    } else if (permitido(p)) {
      saida.push(p);
    } else {
      fora.push(p);
    }
  };

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
    foraDaLista.forEach(f => { const x = extname(f).toUpperCase() || '(sem extensao)'; porExt[x] = (porExt[x] || 0) + 1; });
    console.log(`fora da lista de extensoes (nao enviados): ${Object.entries(porExt).map(([x, n]) => `${x} ${n}`).join(', ')}`);
  }
  if (!arquivos.length) falhar('Nenhum fonte ou recurso compilavel nos caminhos informados.', 2);
  const temFonteAdvpl = arquivos.some(f => FONTES_ADVPL.includes(extname(f).toLowerCase()));

  const ADVPLS = acharAdvpls();
  if (!ADVPLS || !existsSync(ADVPLS)) {
    falhar(`advpls nao encontrado${ADVPLS ? ` em ${ADVPLS}` : ' na extensao TDS (~/.vscode/extensions/totvs.tds-vscode-*)'}.\n`
      + 'Instale/atualize a extensao TOTVS.tds-vscode, ou aponte ADVPLS=<caminho do advpls>.', 3);
  }

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

  const compilarEm = async amb => {
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
        await sleep(ESPERA_RPO * 1000);
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
  };

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
}

// =============================================================================
// EXEC: User Function pelo WebApp, headless
// =============================================================================

// o: { settings (arquivo), alvo, prog, nome, limite (s), args, espera (arquivo) }
async function cmdExec(o) {
  const PROG = o.prog;
  const NOME = o.nome || 'execucao';
  const LIMITE = Number(o.limite || 180) * 1000;
  const ARGS = o.args || [];
  const SETTINGS = o.settings;
  const falha = msg => falhar(msg, 3);

  // Servidor e ambiente: settings do projeto + servers.json da extensao TDS. O ambiente e um papel (default, rest, workflow, job) ou um
  // nome conhecido -- erro de digitacao vira erro aqui, nao codigo velho rodando
  // em outro RPO.
  function resolverServidor() {
    const url = process.env.PROTHEUS_URL;
    const pedido = o.alvo || process.env.PROTHEUS_ENV;

    if (url) {
      if (!pedido) falha('PROTHEUS_URL exige PROTHEUS_ENV junto (ambiente sem o servidor certo e o RPO errado).');
      return { base: url, env: pedido, agentPort: 21021 };
    }

    try {
      const cfg = lerSettings(SETTINGS);
      const srv = lerServidor(cfg);
      const ambiente = resolverAmbiente(cfg, srv, pedido || 'default');
      return {
        base: `${cfg.https ? 'https' : 'http'}://${srv.endereco}:${srv.porta}`, env: ambiente,
        browser: cfg.browser, webagent: cfg.webagent, launch: cfg.launch, agentPort: cfg.webagentPort,
      };
    } catch (e) {
      if (e instanceof ErroConfig) falha(e.message);
      throw e;
    }
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

    const espera = o.espera || process.env.PROTHEUS_WAIT_FILE;
    console.log(`servidor : ${BASE}  (${ENV})`);
    console.log(`programa : ${PROG}`);
    ARGS.forEach((a, i) => console.log(`arg ${i + 1}    : ${a}`));
    console.log(`modo     : launch_by_webagent (${WEBAGENT})`);

    // Versao do WebApp x WebAgent, ANTES de abrir navegador: com a serie errada
    // a pagina nao fala com o agente e a espera terminaria em "nada em ...".
    const versaoWeb = await lerVersaoWebApp(BASE);
    if (versaoWeb) {
      const c = conferirWebAgent(versaoWeb, WEBAGENT);
      console.log(`webapp   : ${versaoWeb} -> WebAgent ${c.serie}.x (${c.versaoAgente ? `configurado: ${c.versaoAgente}` : 'configurado: ultima versao instalada, sem numero no caminho'})`);
      if (c.ok === false) {
        falha(`WebAgent ${c.versaoAgente} nao serve para o WebApp ${versaoWeb}: precisa de ${c.serie}.x.\n`
          + `Troque o campo webagent em ${SETTINGS} (node .claude/scripts/pth.mjs webagents mostra qual serve).`);
      }
    } else {
      console.log('webapp   : versao nao lida -- segue sem conferir o WebAgent');
    }
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
  {
    // Modo direto: o WebAgent e o do usuario (versao desconhecida aqui); so informa.
    const versaoWeb = await lerVersaoWebApp(BASE);
    if (versaoWeb) console.log(`webapp   : ${versaoWeb} -> o WebAgent aberto na porta ${AGENT_PORT} precisa ser ${conferirWebAgent(versaoWeb, '').serie}.x`);
  }

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
}

// Opcoes comuns do exec e do query: -e <alvo> (e -f para o query), antes dos
// posicionais.
function lerOpcoesExec(args, aceitaF) {
  let alvo = '', arquivoSql = '';
  while (args.length && args[0].startsWith('-') && args[0].length > 1) {
    const a = args.shift();
    if (a === '-e') { alvo = args.shift(); if (!alvo) falhar('Opcao -e exige valor', 2); }
    else if (aceitaF && a === '-f') { arquivoSql = args.shift(); if (!arquivoSql) falhar('Opcao -f exige o arquivo .sql', 2); }
    else if (a === '-h') throw new ErroUso('');
    else throw new ErroUso(`Opcao invalida: ${a}`);
  }
  return { alvo, arquivoSql };
}

const USO_EXEC = `Uso: node .claude/scripts/pth.mjs exec [sufixo] [-e <alvo>] <namespace.U_Funcao> [rotulo] [segundos] [arg...]
  Roda a funcao pelo WebApp headless. rotulo nomeia o screenshot (modo direto);
  segundos e o limite (padrao 180). Cada arg vira um &A= da URL.
  sufixo so e reconhecido se .claude/config/pth-settings.<sufixo>.json existir (uma
  funcao sem namespace, como U_TESTE, tambem e um nome simples).`;

async function cmdExecCli(args) {
  const settings = tirarSufixo(args, a => existsSync(caminhoSettings(a)));
  let op;
  try { op = lerOpcoesExec(args, false); } catch (e) { falhar(`${e.message ? `${e.message}\n` : ''}${USO_EXEC}`, e.message ? 2 : 0); }
  const [prog, nome, limite, ...resto] = args;
  if (!prog) falhar(`Informe a funcao. Ex.: Gworks.Templates.X.Apps.U_Minha\n${USO_EXEC}`, 2);
  await cmdExec({ settings, alvo: op.alvo, prog, nome, limite, args: resto });
}

// =============================================================================
// QUERY: SELECT/WITH pelo template ConsultaSql
// =============================================================================

const FUNCAO_CONSULTA = 'Gworks.Templates.ConsultaSql.Apps.U_ConsultaSqlPostConsulta';
// Pasta temp do CLIENTE, a mesma que a U_ConsultaSqlTempFile usa: /tmp fixo em
// Unix; no Windows, a temp do usuario (GetTempPath() do AdvPL = os.tmpdir()).
const TEMP_CLIENTE = process.platform === 'win32' ? tmpdir() : '/tmp';

const USO_QUERY = `Uso: node .claude/scripts/pth.mjs query [sufixo] [-e <alvo>] "<SQL>" [rotulo] [segundos]
     node .claude/scripts/pth.mjs query [sufixo] [-e <alvo>] -f arquivo.sql [rotulo] [segundos]
  Somente SELECT/WITH (seguido de espaco). Resultado em ${join(TEMP_CLIENTE, 'consultasql-retorno.json')}.`;

async function cmdQuery(args) {
  const settings = tirarSufixo(args, () => true);
  let op;
  try { op = lerOpcoesExec(args, true); } catch (e) { falhar(`${e.message ? `${e.message}\n` : ''}${USO_QUERY}`, e.message ? 2 : 0); }
  let sql;
  if (op.arquivoSql) {
    if (!existsSync(op.arquivoSql)) falhar(`Arquivo nao encontrado: ${op.arquivoSql}`, 2);
    sql = readFileSync(op.arquivoSql, 'utf8').replace(/^﻿/, '').replace(/\s+$/, '');
  } else {
    sql = args.shift();
    if (!sql) falhar(USO_QUERY, 2);
  }
  const [rotulo = 'consulta', limite = '180'] = args;

  const sqlPath = process.env.PROTHEUS_SQL_PATH || join(TEMP_CLIENTE, 'consultasql.sql');
  const retorno = join(TEMP_CLIENTE, 'consultasql-retorno.json');
  // Sem quebra de linha no fim; UTF-8 sem BOM.
  writeFileSync(sqlPath, sql, 'utf8');
  // Retorno velho fora: um run que falha nao pode deixar o anterior passar por
  // novo, e no modo launch_by_webagent o aparecimento dele e o sinal de fim.
  try { unlinkSync(retorno); } catch { /* nao havia */ }

  console.log(`sql      : ${sqlPath} (${Buffer.byteLength(sql, 'utf8')} bytes)`);
  console.log(`config   : ${settings}`);
  await cmdExec({ settings, alvo: op.alvo, prog: FUNCAO_CONSULTA, nome: rotulo, limite, args: ['RUNQUERY'], espera: retorno });
}

// =============================================================================
// SERVERS, WEBAGENTS, INFO
// =============================================================================

async function cmdWebAgents(args) {
  const SETTINGS = tirarSufixo(args, () => true);
  // Com um settings legivel, a lista vem marcada pela versao do WebApp.
  let ctx = null;
  try {
    const st = lerSettings(SETTINGS);
    const sv = lerServidor(st);
    const base = `${st.https ? 'https' : 'http'}://${sv.endereco}:${sv.porta}`;
    ctx = { servidor: `${sv.nome} (${base})`, versaoWebApp: await lerVersaoWebApp(base), atual: st.webagent };
  } catch { /* sem settings: so a lista */ }
  console.log(listarWebAgents(ctx));
}

const AJUDA = `pth -- Protheus pela linha de comando (Node.js 22+). Uso: node .claude/scripts/pth.mjs <subcomando> ...

  compile   [sufixo] [-r] [-e <alvo>]... [-a] <caminho>...     compila (login pelo token do VS Code)
  query     [sufixo] [-e <alvo>] "<SQL>" | -f arquivo.sql       SELECT/WITH pelo template ConsultaSql
  exec      [sufixo] [-e <alvo>] <namespace.U_Funcao> [...]     roda uma User Function pelo WebApp
  servers                                                       servidores do servers.json (sem token)
  webagents [sufixo]                                            WebAgents instalados e qual serve
  info      [sufixo]                                            configuracao resolvida (sem token)

  <subcomando> -h mostra os detalhes. sufixo: .claude/config/pth-settings.<sufixo>.json.`;

// =============================================================================
// MAIN
// =============================================================================

const [SUB, ...ARGV] = process.argv.slice(2);
switch (SUB) {
  case 'compile': await cmdCompile(ARGV); break;
  case 'query': await cmdQuery(ARGV); break;
  case 'exec': await cmdExecCli(ARGV); break;
  case 'servers': console.log(listarServidores()); break;
  case 'webagents': await cmdWebAgents(ARGV); break;
  case 'info': console.log(resumo(tirarSufixo(ARGV, () => true))); break;
  case undefined: case 'help': case '-h': case '--help': console.log(AJUDA); break;
  default: falhar(`Subcomando desconhecido: ${SUB}\n\n${AJUDA}`, 2);
}
