import type { CanonicalThemeId } from '../content/taxonomy'

export const themeBackgrounds: Record<CanonicalThemeId, string> = {
  'identite': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/identite.webp', import.meta.url).href,
  'famille-relations': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/famille-relations.webp', import.meta.url).href,
  'maison': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/maison.webp', import.meta.url).href,
  'ecole-etudes': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/ecole-etudes.webp', import.meta.url).href,
  'travail-metiers': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/travail-metiers.webp', import.meta.url).href,
  'alimentation': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/alimentation.webp', import.meta.url).href,
  'voyage': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/voyage.webp', import.meta.url).href,
  'ville-services': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/ville-services.webp', import.meta.url).href,
  'corps-sante': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/corps-sante.webp', import.meta.url).href,
  'vetements': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/vetements.webp', import.meta.url).href,
  'temps': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/temps.webp', import.meta.url).href,
  'meteo': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/meteo.webp', import.meta.url).href,
  'loisirs': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/loisirs.webp', import.meta.url).href,
  'sports': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/sports.webp', import.meta.url).href,
  'culture-fetes': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/culture-fetes.webp', import.meta.url).href,
  'communication': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/communication.webp', import.meta.url).href,
  'numerique': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/numerique.webp', import.meta.url).href,
  'nature-environnement': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/nature-environnement.webp', import.meta.url).href,
  'description': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/description.webp', import.meta.url).href,
  'espace-orientation': new URL('../../documentation/design/assets/v1.3-theme-backgrounds-fr-es-r1/espace-orientation.webp', import.meta.url).href
}

export function themeBackgroundFor(theme: string | undefined): string | null {
  if (!theme || !Object.prototype.hasOwnProperty.call(themeBackgrounds, theme)) return null
  return themeBackgrounds[theme as CanonicalThemeId]
}
