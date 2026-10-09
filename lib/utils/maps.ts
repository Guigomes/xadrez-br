/**
 * Link do Google Maps que abre a ROTA até o local (no celular abre o app e já
 * inicia a navegação a partir de onde a pessoa está). O destino é o texto que o
 * organizador digitou no campo "local" + cidade/UF, então endereço completo no
 * campo gera pino exato; só o nome do local ainda acha pela busca do Maps.
 */
export function mapsDirectionsUrl(venue: string, city?: string | null, state?: string | null): string {
  const destination = [venue, city, state, 'Brasil'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
