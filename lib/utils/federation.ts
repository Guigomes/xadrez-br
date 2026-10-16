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
  ALB: 'Albânia', ANG: 'Angola', DOM: 'República Dominicana', GEQ: 'Guiné Equatorial', HKG: 'Hong Kong', JAM: 'Jamaica', KEN: 'Quênia', LUX: 'Luxemburgo', MAD: 'Madagascar', MLT: 'Malta', MNC: 'Mônaco', PAK: 'Paquistão', SRI: 'Sri Lanka', SYR: 'Síria', TAN: 'Tanzânia', TJK: 'Tajiquistão', ZAM: 'Zâmbia', RUS: 'Rússia', THA: 'Tailândia', TPE: 'Taiwan', QAT: 'Catar', KSA: 'Arábia Saudita', JOR: 'Jordânia', HON: 'Honduras', NCA: 'Nicarágua', TTO: 'Trinidad e Tobago', ZIM: 'Zimbábue', UGA: 'Uganda', ETH: 'Etiópia', GHA: 'Gana', SEN: 'Senegal', CIV: 'Costa do Marfim', KOS: 'Kosovo', AND: 'Andorra', LIE: 'Liechtenstein', SMR: 'San Marino', BAH: 'Bahamas', BAR: 'Barbados', HAI: 'Haiti', NEP: 'Nepal', MYA: 'Mianmar', CAM: 'Camboja', MAC: 'Macau', MDV: 'Maldivas', IRQ: 'Iraque', KUW: 'Kuwait', OMA: 'Omã', YEM: 'Iêmen', PLE: 'Palestina', AFG: 'Afeganistão',
};

export function federationName(code: string): string {
  return FEDERATION_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

/**
 * Código FIDE (3 letras, nem sempre o ISO: GER, NED, SUI…) → código ISO 3166 de 2 letras
 * da bandeira em /public/flags (pacote flag-icons, MIT). Inglaterra, Escócia e País de
 * Gales têm bandeira própria (gb-eng, gb-sct, gb-wls). FID (atletas sob bandeira da FIDE)
 * e códigos desconhecidos ficam sem bandeira.
 */
const FIDE_TO_ISO2: Record<string, string> = {
  AFG: 'af', ALB: 'al', ALG: 'dz', AND: 'ad', ANG: 'ao', ANT: 'ag', ARG: 'ar', ARM: 'am', ARU: 'aw',
  AUS: 'au', AUT: 'at', AZE: 'az', BAH: 'bs', BAN: 'bd', BAR: 'bb', BDI: 'bi', BEL: 'be', BER: 'bm',
  BHU: 'bt', BIH: 'ba', BIZ: 'bz', BLR: 'by', BOL: 'bo', BOT: 'bw', BRA: 'br', BRN: 'bh', BRU: 'bn',
  BUL: 'bg', BUR: 'bf', CAF: 'cf', CAM: 'kh', CAN: 'ca', CAY: 'ky', CHA: 'td', CHI: 'cl', CHN: 'cn',
  CIV: 'ci', CMR: 'cm', COD: 'cd', CPV: 'cv', CRC: 'cr', CRO: 'hr', CUB: 'cu', CYP: 'cy', CZE: 'cz',
  DEN: 'dk', DJI: 'dj', DMA: 'dm', DOM: 'do', ECU: 'ec', EGY: 'eg', ENG: 'gb-eng', ERI: 'er', ESA: 'sv',
  ESP: 'es', EST: 'ee', ETH: 'et', FAI: 'fo', FIJ: 'fj', FIN: 'fi', FRA: 'fr', GAB: 'ga', GAM: 'gm',
  GCI: 'gg', GEO: 'ge', GEQ: 'gq', GER: 'de', GHA: 'gh', GRE: 'gr', GRN: 'gd', GUA: 'gt', GUM: 'gu',
  GUY: 'gy', HAI: 'ht', HKG: 'hk', HON: 'hn', HUN: 'hu', INA: 'id', IND: 'in', IRI: 'ir', IRL: 'ie',
  IRQ: 'iq', ISL: 'is', ISR: 'il', ISV: 'vi', ITA: 'it', IVB: 'vg', JAM: 'jm', JCI: 'je', JOR: 'jo',
  JPN: 'jp', KAZ: 'kz', KEN: 'ke', KGZ: 'kg', KOR: 'kr', KOS: 'xk', KSA: 'sa', KUW: 'kw', LAO: 'la',
  LAT: 'lv', LBA: 'ly', LBN: 'lb', LBR: 'lr', LCA: 'lc', LES: 'ls', LIE: 'li', LTU: 'lt', LUX: 'lu',
  MAC: 'mo', MAD: 'mg', MAR: 'ma', MAS: 'my', MAW: 'mw', MDA: 'md', MDV: 'mv', MEX: 'mx', MGL: 'mn',
  MKD: 'mk', MLI: 'ml', MLT: 'mt', MNC: 'mc', MNE: 'me', MOZ: 'mz', MRI: 'mu', MTN: 'mr', MYA: 'mm',
  NAM: 'na', NCA: 'ni', NED: 'nl', NEP: 'np', NGR: 'ng', NIG: 'ne', NOR: 'no', NRU: 'nr', NZL: 'nz',
  OMA: 'om', PAK: 'pk', PAN: 'pa', PAR: 'py', PER: 'pe', PHI: 'ph', PLE: 'ps', PLW: 'pw', PNG: 'pg',
  POL: 'pl', POR: 'pt', PUR: 'pr', QAT: 'qa', ROU: 'ro', RSA: 'za', RUS: 'ru', RWA: 'rw', SCO: 'gb-sct',
  SEN: 'sn', SEY: 'sc', SGP: 'sg', SKN: 'kn', SLE: 'sl', SLO: 'si', SMR: 'sm', SOL: 'sb', SOM: 'so',
  SRB: 'rs', SRI: 'lk', SSD: 'ss', STP: 'st', SUD: 'sd', SUI: 'ch', SUR: 'sr', SVK: 'sk', SWE: 'se',
  SWZ: 'sz', SYR: 'sy', TAN: 'tz', THA: 'th', TJK: 'tj', TKM: 'tm', TLS: 'tl', TOG: 'tg', TPE: 'tw',
  TTO: 'tt', TUN: 'tn', TUR: 'tr', UAE: 'ae', UGA: 'ug', UKR: 'ua', URU: 'uy', USA: 'us', UZB: 'uz',
  VAN: 'vu', VEN: 've', VIE: 'vn', VIN: 'vc', WLS: 'gb-wls', YEM: 'ye', ZAM: 'zm', ZIM: 'zw',
};

/** Caminho da bandeira do país (SVG em /public/flags) ou null quando não há. */
export function federationFlagUrl(code: string | null | undefined): string | null {
  const iso = code ? FIDE_TO_ISO2[code.toUpperCase()] : undefined;
  return iso ? `/flags/${iso}.svg` : null;
}

