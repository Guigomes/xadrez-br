import { describe, expect, it } from 'vitest';
import {
  alertMessage, cbxTimeControl, dedupeAcrossSources, matchesRule, ufFromLocation, ufFromOrganizer, type AlertItem,
} from '../alerts/match';
import { parseCalendarPage, totalOf } from '../alerts/cbx-calendar';

const item = (over: Partial<AlertItem> = {}): AlertItem => ({
  source: 'cbx', refId: '1/26', name: 'Aberto de Teste', startDate: '2026-11-07', uf: 'SP', timeControl: 'std', ...over,
});

describe('regra de alerta', () => {
  it('lista vazia não filtra', () => {
    expect(matchesRule({ ufs: [], timeControls: [], includeCbx: true }, item())).toBe(true);
  });

  it('filtra por estado e por ritmo', () => {
    const rule = { ufs: ['SP', 'PR'], timeControls: ['rpd'], includeCbx: true };
    expect(matchesRule(rule, item({ uf: 'SP', timeControl: 'rpd' }))).toBe(true);
    expect(matchesRule(rule, item({ uf: 'RJ', timeControl: 'rpd' }))).toBe(false);
    expect(matchesRule(rule, item({ uf: 'SP', timeControl: 'std' }))).toBe(false);
  });

  it('torneio sem UF ou ritmo conhecido só casa com regra que não filtra aquele eixo', () => {
    expect(matchesRule({ ufs: ['SP'], timeControls: [], includeCbx: true }, item({ uf: null }))).toBe(false);
    expect(matchesRule({ ufs: [], timeControls: [], includeCbx: true }, item({ uf: null }))).toBe(true);
    expect(matchesRule({ ufs: [], timeControls: ['blz'], includeCbx: true }, item({ timeControl: null }))).toBe(false);
  });

  it('respeita a opção de incluir o calendário da CBX', () => {
    const rule = { ufs: [], timeControls: [], includeCbx: false };
    expect(matchesRule(rule, item({ source: 'cbx' }))).toBe(false);
    expect(matchesRule(rule, item({ source: 'site' }))).toBe(true);
  });

  it('não avisa duas vezes o mesmo torneio presente no site e na CBX', () => {
    const out = dedupeAcrossSources([
      item({ source: 'site', refId: 'uuid', name: 'Aberto do Brasil – Etapa SP' }),
      item({ source: 'cbx', refId: '9/26', name: 'ABERTO DO BRASIL ETAPA SP' }),
      item({ source: 'cbx', refId: '10/26', name: 'Outro torneio' }),
    ]);
    expect(out.map((i) => i.refId)).toEqual(['uuid', '10/26']);
  });
});

describe('mensagem', () => {
  it('um torneio: nome, data e UF', () => {
    expect(alertMessage([item()])).toEqual({ title: 'Novo torneio no seu alerta', body: 'Aberto de Teste — 07/11, SP' });
  });

  it('vários: conta, lista os dois primeiros por data e resume o resto', () => {
    const msg = alertMessage([
      item({ name: 'C', startDate: '2026-11-20' }), item({ name: 'A', startDate: '2026-11-01' }), item({ name: 'B', startDate: '2026-11-10' }),
    ]);
    expect(msg.title).toBe('3 torneios novos no seu alerta');
    expect(msg.body).toBe('A (01/11); B (10/11) e mais 1');
  });
});

describe('dados da CBX', () => {
  it('ritmo', () => {
    expect(cbxTimeControl('Clássico')).toBe('std');
    expect(cbxTimeControl('Rápido')).toBe('rpd');
    expect(cbxTimeControl('Blitz')).toBe('blz');
    expect(cbxTimeControl('')).toBeNull();
  });

  it('UF pelo local, pela capital ou pela federação', () => {
    expect(ufFromLocation('Campina Grande PB')).toBe('PB');
    expect(ufFromLocation('Brasilia')).toBe('DF');
    expect(ufFromLocation('Manaus - Biblioteca do IFAM CMC')).toBe('AM');
    expect(ufFromLocation('Sao Carlos')).toBeNull();
    expect(ufFromOrganizer('Federacao Paraibana de Xadrez')).toBe('PB');
    expect(ufFromOrganizer('Federação Sul-Mato-Grossense de Xadrez')).toBe('MS');
    expect(ufFromOrganizer('Federacao Matogrossense de Xadrez')).toBe('MT');
    expect(ufFromOrganizer('Clube de Xadrez Rio Corrente')).toBeNull();
  });

  it('lê uma página do calendário', () => {
    const html = `<caption> Total de Torneios: 110 </caption>
      <span id="ContentPlaceHolder1_gdvMain_lblNomeTorneio_0" class="nome-torneio">II Classico CXCG 2026</span>
      <span id="ContentPlaceHolder1_gdvMain_lblIDTorneio_0">ID do Torneio: 10813/26</span>
      <span id="ContentPlaceHolder1_gdvMain_lblStatus_0">Situação: <b>Pré-oficializado</b></span>
      <span id="ContentPlaceHolder1_gdvMain_lblRitmo_0">Ritmo: <b>Clássico</b></span>
      <span id="ContentPlaceHolder1_gdvMain_lblRating_0">Rating: <b>CBX e FIDE</b></span>
      <span id="ContentPlaceHolder1_gdvMain_lblOrganizador_0">Organizador: <b>Federacao Paraibana de Xadrez</b></span>
      <span id="ContentPlaceHolder1_gdvMain_lblLocal_0">Local: <b>Campina Grande PB</b></span>
      <span id="ContentPlaceHolder1_gdvMain_lblPeriodo_0">Período: <b>17/09/2026 a 29/10/2026</b></span>`;
    expect(totalOf(html)).toBe(110);
    expect(parseCalendarPage(html)).toEqual([{
      cbxId: '10813/26', name: 'II Classico CXCG 2026', startDate: '2026-09-17', endDate: '2026-10-29',
      location: 'Campina Grande PB', uf: 'PB', timeControl: 'std', rating: 'CBX e FIDE',
      organizer: 'Federacao Paraibana de Xadrez', status: 'Pré-oficializado',
    }]);
  });
});
