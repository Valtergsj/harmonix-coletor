/**
 * Recebe os eventos do robô e acrescenta na aba "eventos" da planilha, SEM aprovação (coluna "aprovado" vazia).
 * Como instalar: veja o LEIA-ME.md (Extensões > Apps Script, colar este código, criar a propriedade TOKEN e implantar como app da Web).
 */
function norm_(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() { return out_({ ok: true, mensagem: 'Harmonix coletor ativo. Use POST.' }); }

function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, erro: 'JSON inválido' }); }
  const token = props.getProperty('TOKEN');
  if (!token || body.token !== token) return out_({ ok: false, erro: 'token incorreto' });
  if (!Array.isArray(body.rows) || body.rows.length > 200) return out_({ ok: false, erro: 'rows inválido' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(props.getProperty('ABA') || 'eventos');
    if (!sh) return out_({ ok: false, erro: 'aba não encontrada (nome esperado: eventos)' });
    const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    let heads = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(norm_);
    ['fonte', 'coletado_em'].forEach(function (extra) {          // cria as colunas de rastreio se faltarem
      if (heads.indexOf(norm_(extra)) < 0) { sh.getRange(1, heads.length + 1).setValue(extra); heads.push(norm_(extra)); }
    });
    const idx = function (k) { return heads.indexOf(norm_(k)); };
    const dia = function (v) { return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v).trim(); };
    const chave = function (casa, data, titulo) { return norm_(casa) + '|' + dia(data) + '|' + norm_(titulo); };

    const last = sh.getLastRow();
    const existentes = {};
    if (last > 1) {
      sh.getRange(2, 1, last - 1, heads.length).getValues().forEach(function (r) {
        existentes[chave(r[idx('casa')], r[idx('data')], r[idx('titulo')])] = true;
      });
    }
    const novas = [];
    body.rows.forEach(function (row) {
      const k = chave(row.casa, row.data, row.titulo);
      if (existentes[k]) return;
      existentes[k] = true;
      const byNorm = {};
      Object.keys(row).forEach(function (c) { byNorm[norm_(c)] = row[c]; });
      byNorm.aprovado = '';                                     // sempre pendente: quem aprova é você
      novas.push(heads.map(function (h) { return byNorm[h] === undefined ? '' : byNorm[h]; }));
    });
    if (novas.length) sh.getRange(sh.getLastRow() + 1, 1, novas.length, heads.length).setValues(novas);
    return out_({ ok: true, recebidas: body.rows.length, acrescentadas: novas.length });
  } finally {
    lock.releaseLock();
  }
}
