// Testes do coletor, sem internet: tudo simulado. Rode com: node coletor/teste.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, parseRobots, robotsAllows, validar, duplicado, chaveEvento, executar, parseCSV, norm } from './coletar.mjs';

const HOJE = '2026-11-06';

test('htmlToText tira scripts/tags e decodifica entidades', () => {
  const t = htmlToText('<html><head><style>.a{}</style></head><body><script>var x=1</script><h1>Noite &amp; Festa</h1><p>Sáb&nbsp;14/11 &#8211; 23h</p></body></html>');
  assert.match(t, /Noite & Festa/); assert.match(t, /Sáb 14\/11 – 23h/); assert.doesNotMatch(t, /var x|\.a\{/);
});

test('robots.txt: regras do bot, do * e a mais específica vence', () => {
  const g = parseRobots('User-agent: *\nDisallow: /privado\nAllow: /privado/publico\n\nUser-agent: HarmonixBot\nDisallow: /nada\n');
  assert.equal(robotsAllows(g, '/nada/x'), false);
  assert.equal(robotsAllows(g, '/privado/y'), true, 'regra do bot específico substitui a do *');
  const g2 = parseRobots('User-agent: *\nDisallow: /privado\nAllow: /privado/publico\n');
  assert.equal(robotsAllows(g2, '/privado/y'), false);
  assert.equal(robotsAllows(g2, '/privado/publico/a'), true);
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow:\n'), '/qualquer'), true);
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow: /\n'), '/x'), false);
  assert.equal(robotsAllows([], '/x'), true);
});

const TEXTO = 'Agenda\nFalamansa encerra Turnê Universos com show especial na Audio\n27 de novembro 2026\nFreya Skye chega ao Brasil pela primeira vez\n27 de janeiro 2027';
const base = { texto: TEXTO, hoje: HOJE, casaFixa: 'Audio', url: 'https://x.test/a' };
const bom = { titulo: 'Falamansa encerra Turnê Universos', data: '2026-11-27', trecho: 'Falamansa encerra Turnê Universos com show especial na Audio' };

test('validar aceita um evento real e monta a linha pendente', () => {
  const r = validar({ ...bom, inicio: '21:00', lineup: ['Falamansa'], generos: ['Forró'] }, base);
  assert.ok(r.linha); assert.equal(r.linha.casa, 'Audio'); assert.equal(r.linha.aprovado, ''); assert.equal(r.linha.fonte, base.url);
  assert.equal(r.linha.inicio, '21:00'); assert.equal(r.linha.fim, ''); assert.equal(r.linha.lineup, 'Falamansa');
});
test('validar rejeita alucinação, data ruim, passada e distante', () => {
  assert.match(validar({ ...bom, trecho: 'Show do Fulano com ingressos esgotados em dezembro' }, base).erro, /trecho/);
  assert.match(validar({ ...bom, titulo: 'Festa Totalmente Inventada Neon', trecho: bom.trecho }, base).erro, /título/);
  assert.match(validar({ ...bom, data: '2026-02-31' }, base).erro, /inválida/);
  assert.match(validar({ ...bom, data: '2026-11-01' }, base).erro, /passada/);
  assert.match(validar({ ...bom, data: '2027-03-01' }, base).erro, /além/);
  assert.match(validar({ ...bom, titulo: '' }, base).erro, /título/);
  assert.match(validar(bom, { ...base, casaFixa: null }).erro, /casa/);
});
test('validar zera horário inválido e corta descrição longa', () => {
  const r = validar({ ...bom, inicio: '25:99', descricao: 'x'.repeat(500) }, base);
  assert.equal(r.linha.inicio, ''); assert.equal(r.linha.descricao.length, 300);
});
test('duplicados: chave exata e título contido na mesma casa/data', () => {
  const l = { casa: 'Audio', data: '2026-11-27', titulo: 'Falamansa encerra Turnê Universos' };
  assert.ok(duplicado(l, [{ ...l, k: chaveEvento(l) }]));
  assert.ok(duplicado(l, [{ casa: 'AUDIO', data: '2026-11-27', titulo: 'Falamansa', k: 'x' }]));
  assert.ok(!duplicado(l, [{ casa: 'Audio', data: '2026-11-28', titulo: 'Falamansa', k: 'x' }]));
});
test('parseCSV lê aspas e ponto e vírgula', () => {
  assert.deepEqual(parseCSV('a;b\n"x;y";"z ""q"""\n'), [['a', 'b'], ['x;y', 'z "q"']]);
});

/* ---- integração com internet simulada ---- */
function simular({ paginas, robots, gemini, existente }) {
  const chamadas = { gemini: 0, webhook: [], paginas: [] };
  globalThis.fetch = async (url, opts = {}) => {
    url = String(url); const u = new URL(url);
    const res = (body, init = {}) => new Response(body, init);
    if (u.pathname === '/robots.txt') return robots[u.origin] === undefined ? res('', { status: 404 }) : res(robots[u.origin]);
    if (u.host === 'generativelanguage.googleapis.com') { chamadas.gemini++; return res(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(gemini(JSON.parse(opts.body).contents[0].parts[0].text)) }] } }] })); }
    if (u.host === 'script.test') { chamadas.webhook.push(JSON.parse(opts.body)); return res(JSON.stringify({ ok: true, acrescentadas: chamadas.webhook.at(-1).rows.length })); }
    if (u.host === 'planilha.test') return res(existente || 'casa,data,titulo\n');
    if (paginas[url] !== undefined) { chamadas.paginas.push(url); return res(paginas[url], { headers: { 'content-type': 'text/html' } }); }
    return res('nao achei', { status: 404 });
  };
  return chamadas;
}
const PAGINA = `<html><body>${'<p>Programação da casa.</p>'.repeat(10)}<ul><li>${TEXTO.split('\n').slice(1, 3).join('</li><li>')}</li></ul></body></html>`;
const quieto = () => {};

test('integração: só envia o válido, respeita robots, deduplica, nunca aprova sozinho', async () => {
  const c = simular({
    paginas: { 'https://ok.test/agenda': PAGINA, 'https://proibido.test/agenda': PAGINA },
    robots: { 'https://proibido.test': 'User-agent: *\nDisallow: /' },
    gemini: () => [bom, { ...bom, titulo: 'Show Fantasma Do Além', data: '2026-12-01', trecho: 'Show Fantasma Do Além em 01/12' }],
    existente: 'casa,data,titulo\nOutra Casa,2026-11-27,Qualquer\n'
  });
  const env = { GEMINI_API_KEY: 'k', SHEET_WEBHOOK_URL: 'https://script.test/exec', SHEET_WEBHOOK_TOKEN: 't', EVENTS_CSV_URL: 'https://planilha.test/csv' };
  const fontes = [{ nome: 'ok', url: 'https://ok.test/agenda', casa: 'Audio' }, { nome: 'proibido', url: 'https://proibido.test/agenda', casa: 'X' }, { nome: 'quebrada', url: 'https://ok.test/404', casa: 'Y' }];
  const r = await executar({ fontes, env, hoje: HOJE, log: quieto, pausaMs: 0 });
  assert.equal(c.gemini, 1, 'página proibida não chega à IA');
  assert.deepEqual(c.paginas, ['https://ok.test/agenda']);
  assert.match(r.fontes[1].resultado, /robots/); assert.match(r.fontes[2].resultado, /erro/);
  assert.equal(c.webhook.length, 1); assert.equal(c.webhook[0].rows.length, 1);
  assert.equal(c.webhook[0].rows[0].titulo, 'Falamansa encerra Turnê Universos'); assert.equal(c.webhook[0].rows[0].aprovado, '');
  assert.equal(c.webhook[0].token, 't'); assert.equal(r.rejeitados['o trecho citado não existe na página'], 1);
  // segunda rodada: a planilha já tem o evento -> nada novo, nada enviado
  const c2 = simular({ paginas: { 'https://ok.test/agenda': PAGINA }, robots: {}, gemini: () => [bom], existente: 'casa,data,titulo\nAudio,27/11/2026,Falamansa encerra Turnê Universos\n' });
  const r2 = await executar({ fontes: [fontes[0]], env, hoje: HOJE, log: quieto, pausaMs: 0 });
  assert.equal(r2.novas.length, 0); assert.equal(c2.webhook.length, 0);
});

test('modo teste não envia nada; sem chave ou sem webhook dá erro claro', async () => {
  const c = simular({ paginas: { 'https://ok.test/agenda': PAGINA }, robots: {}, gemini: () => [bom] });
  const r = await executar({ fontes: [{ nome: 'ok', url: 'https://ok.test/agenda', casa: 'Audio' }], env: { GEMINI_API_KEY: 'k', DRY_RUN: '1' }, hoje: HOJE, log: quieto, pausaMs: 0 });
  assert.equal(r.novas.length, 1); assert.equal(r.enviados, 0); assert.equal(c.webhook.length, 0);
  await assert.rejects(() => executar({ fontes: [], env: {}, hoje: HOJE, log: quieto }), /GEMINI_API_KEY/);
  await assert.rejects(() => executar({ fontes: [], env: { GEMINI_API_KEY: 'k' }, hoje: HOJE, log: quieto }), /SHEET_WEBHOOK/);
});

test('página sem texto (JavaScript) é pulada sem chamar a IA', async () => {
  const c = simular({ paginas: { 'https://js.test/a': '<html><body><div id="app"></div><script>x</script></body></html>' }, robots: {}, gemini: () => [bom] });
  const r = await executar({ fontes: [{ nome: 'js', url: 'https://js.test/a', casa: 'Z' }], env: { GEMINI_API_KEY: 'k', DRY_RUN: '1' }, hoje: HOJE, log: quieto, pausaMs: 0 });
  assert.equal(c.gemini, 0); assert.match(r.fontes[0].resultado, /JavaScript/);
});
