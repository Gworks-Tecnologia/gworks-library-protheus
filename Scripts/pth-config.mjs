// Configuracao comum dos scripts pth-*: o arquivo de settings do projeto e o
// servidor que ele aponta no servers.json da extensao TDS.
//
// SETTINGS (Scripts/pth-settings.json ou Scripts/pth-settings.<sufixo>.json)
// guarda so o que NAO esta no servers.json -- nada de ip, porta, usuario,
// senha ou includes:
//
//   server              id (ou nome) da configuracao no servers.json      obrigatorio
//   env_default         Ambiente (RPO) de compilacao e do WebApp            opcional
//                       (vazio: o primeiro ambiente do servidor no servers.json)
//   env_rest            Ambiente que o REST Server atende                   opcional
//   env_workflow        Ambiente do workflow                                opcional
//   env_job             Ambiente de job/schedule                            opcional
//
// Os env_* sao PAPEIS: marcam para que serve cada ambiente, para quem roda os
// scripts (inclusive um agente de IA) escolher o RPO certo com -e rest,
// PROTHEUS_ENV=job etc. Rest, workflow e job so existem se o usuario os
// informou; nao sao deduzidos do nome do ambiente.
//   https               WebApp do servidor responde em https (true/false)   opcional
//   webagent            Executavel do WebAgent daquele ambiente             opcional
//   browser             Chromium/Chrome/Edge das execucoes pelo WebApp      opcional
//   webagent_port       Porta do WebAgent do usuario (modo direto)          opcional
//   launch_by_webagent  Execucao por "<webagent> launch" (true/false)      opcional
//   production_database Banco de producao (true/false): so informativo    opcional
//
// SERVERS.JSON e o registro da propria extensao TDS, e mora onde a extensao o
// procura: a opcao totvsLanguageServer.workspaceServerConfig (o icone de casa
// ou de globo na barra de status do VS Code) decide. Ligada (casa):
// <projeto>/.vscode/servers.json. Desligada (globo, o padrao):
// ~/.totvsls/servers.json. A opcao e lida como o VS Code le: settings do
// projeto, depois os do PERFIL do VS Code associado a esta pasta (ou os do
// usuario, sem perfil), depois o padrao. PTH_SERVERS_JSON fixa outro arquivo.
// A lista de extensoes compilaveis (totvsLanguageServer.folder.*) sai do mesmo
// lugar -- e la que se inclui o .APP dos apps web (PO UI).
//
// Do servers.json saem endereco, porta, usuario, ambientes, includes e o
// TOKEN DE CONEXAO que a extensao salva quando o usuario conecta no VS Code:
// com ele os scripts reconectam sem senha, como a propria extensao faz.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PAPEIS = ['default', 'rest', 'workflow', 'job'];

export class ErroConfig extends Error {}

// ---- JSON com comentarios (settings do VS Code) ------------------------------
// O settings.json do VS Code aceita // e /* */ e virgula sobrando antes de } ou
// ]. Tira os dois fora de strings e entrega ao JSON.parse.
export function parseJsonc(texto) {
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
export function caminhoSettings(sufixo) {
  if (sufixo) return join(REPO, 'Scripts', `pth-settings.${sufixo}.json`);
  return process.env.PTH_SETTINGS || join(REPO, 'Scripts', 'pth-settings.json');
}

export function lerSettings(arquivo) {
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

export function settingsDoPerfil() {
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
export function configVsCode(chave, valido) {
  const doProjeto = join(REPO, '.vscode', 'settings.json');
  const perfil = settingsDoPerfil();
  for (const [arquivo, origem] of [[doProjeto, doProjeto], [perfil.arquivo, `${perfil.arquivo} (perfil ${perfil.perfil})`]]) {
    const v = lerChave(arquivo, chave);
    if (v !== undefined && valido(v)) return { valor: v, origem };
  }
  return { valor: undefined, origem: 'padrao da extensao' };
}

// ---- Onde esta o servers.json (casa ou globo) ------------------------------------
export function localizarServersJson() {
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
export const EXTENSOES_PADRAO = ['.PRW', '.PRX', '.PRG', '.PPX', '.PPP', '.TLPP', '.APW', '.APH', '.APL', '.AHU',
  '.TRES', '.PNG', '.BMP', '.RES', '.4GL', '.PER', '.JS', '.RPTDESIGN'];

export function extensoesPermitidas() {
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

export function lerServidor(settings) {
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
export function papelEfetivo(settings, servidor, papel) {
  return settings.papel[papel] || (papel === 'default' ? (servidor.ambientes[0] || '') : '');
}

export function resolverAmbiente(settings, servidor, alvo) {
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
export function listarServidores() {
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
export function lerVersaoWebApp(base, ms = 15000) {
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
export const serieWebAgent = versaoWebApp => (cmpVersao(versaoWebApp, '10.2.0') >= 0 ? '1.1' : '1.0');
export const versaoPeloCaminho = p => ((p || '').match(/(\d+\.\d+\.\d+)/) || [])[1] || '';

// ok: true/false quando a versao do WebAgent e conhecida pelo caminho; null
// quando nao da para saber (a da raiz da instalacao, "ultima versao").
export function conferirWebAgent(versaoWebApp, caminho) {
  const serie = serieWebAgent(versaoWebApp);
  const va = versaoPeloCaminho(caminho);
  return { serie, versaoAgente: va, ok: va ? va.startsWith(`${serie}.`) : null };
}

export function listarWebAgents(ctx = null) {
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

// ---- Resumo para o -h (sem token) ----------------------------------------------------
export function resumo(settingsArquivo) {
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
