import { BR_STATES } from '@/lib/utils/chess';

const BR_UFS = new Set(BR_STATES.map((s) => s.uf));

/**
 * Torneio fora do Brasil: o campo `state` do torneio não é uma UF (ex.: "ESP" no
 * Mundial FIDE de Roquetas de Mar). Nesses torneios o que identifica o jogador é o
 * país (federação FIDE), não o estado.
 */
export function isInternationalTournament(tournamentState: string | null | undefined): boolean {
  return !!tournamentState && !BR_UFS.has(tournamentState.toUpperCase());
}

/** Nomes em português das federações FIDE mais comuns; código desconhecido aparece cru. */
const FEDERATION_NAMES: Record<string, string> = {
  ALG: 'Argélia', ARG: 'Argentina', ARM: 'Armênia', AUS: 'Austrália', AUT: 'Áustria', AZE: 'Azerbaijão',
  BAN: 'Bangladesh', BEL: 'Bélgica', BIH: 'Bósnia e Herzegovina', BLR: 'Bielorrússia', BOL: 'Bolívia',
  BRA: 'Brasil', BUL: 'Bulgária', CAN: 'Canadá', CHI: 'Chile', CHN: 'China', COL: 'Colômbia',
  CRC: 'Costa Rica', CRO: 'Croácia', CUB: 'Cuba', CYP: 'Chipre', CZE: 'Tchéquia', DEN: 'Dinamarca',
  ECU: 'Equador', EGY: 'Egito', ENG: 'Inglaterra', ESA: 'El Salvador', ESP: 'Espanha', EST: 'Estônia',
  FID: 'FIDE (bandeira neutra)', FIN: 'Finlândia', FRA: 'França', GEO: 'Geórgia', GER: 'Alemanha',
  GRE: 'Grécia', GUA: 'Guatemala', HUN: 'Hungria', IND: 'Índia', INA: 'Indonésia', IRI: 'Irã', IRL: 'Irlanda',
  ISL: 'Islândia', ISR: 'Israel', ITA: 'Itália', JPN: 'Japão', KAZ: 'Cazaquistão', KGZ: 'Quirguistão',
  KOR: 'Coreia do Sul', LAT: 'Letônia', LBN: 'Líbano', LTU: 'Lituânia', MAR: 'Marrocos', MAS: 'Malásia',
  MDA: 'Moldávia', MEX: 'México', MGL: 'Mongólia', MKD: 'Macedônia do Norte', MNE: 'Montenegro',
  NED: 'Países Baixos', NGR: 'Nigéria', NOR: 'Noruega', NZL: 'Nova Zelândia', PAN: 'Panamá', PAR: 'Paraguai',
  PER: 'Peru', PHI: 'Filipinas', POL: 'Polônia', POR: 'Portugal', PUR: 'Porto Rico', ROU: 'Romênia',
  RSA: 'África do Sul', SCO: 'Escócia', SGP: 'Singapura', SLO: 'Eslovênia', SRB: 'Sérvia', SUI: 'Suíça',
  SVK: 'Eslováquia', SWE: 'Suécia', TKM: 'Turcomenistão', TUN: 'Tunísia', TUR: 'Turquia', UAE: 'Emirados Árabes Unidos',
  UKR: 'Ucrânia', URU: 'Uruguai', USA: 'Estados Unidos', UZB: 'Uzbequistão', VEN: 'Venezuela', VIE: 'Vietnã',
  WLS: 'País de Gales',
};

export function federationName(code: string): string {
  return FEDERATION_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}
