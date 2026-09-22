import uk_alimentation from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/01-alimentation.svg?url'
import uk_communication from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/02-communication.svg?url'
import uk_corps_sante from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/03-corps-sante.svg?url'
import uk_culture_fetes from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/04-culture-fetes.svg?url'
import uk_description from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/05-description.svg?url'
import uk_ecole_etudes from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/06-ecole-etudes.svg?url'
import uk_espace_orientation from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/07-espace-orientation.svg?url'
import uk_famille_relations from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/08-famille-relations.svg?url'
import uk_identite from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/09-identite.svg?url'
import uk_loisirs from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/10-loisirs.svg?url'
import uk_maison from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/11-maison.svg?url'
import uk_meteo from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/12-meteo.svg?url'
import uk_nature_environnement from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/13-nature-environnement.svg?url'
import uk_numerique from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/14-numerique.svg?url'
import uk_sports from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/15-sports.svg?url'
import uk_temps from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/16-temps.svg?url'
import uk_travail_metiers from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/17-travail-metiers.svg?url'
import uk_vetements from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/18-vetements.svg?url'
import uk_ville_services from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/19-ville-services.svg?url'
import uk_voyage from '../../documentation/design/assets/v2.0-theme-backgrounds-fr-en-uk-r1/20-voyage.svg?url'

import type { CanonicalThemeId } from '../content/taxonomy'

export const frEsThemeBackgrounds: Record<CanonicalThemeId, string> = {
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

export const themeBackgrounds = frEsThemeBackgrounds

export const frEnUkThemeBackgrounds: Record<CanonicalThemeId, string> = {
  'alimentation': uk_alimentation,
  'communication': uk_communication,
  'corps-sante': uk_corps_sante,
  'culture-fetes': uk_culture_fetes,
  'description': uk_description,
  'ecole-etudes': uk_ecole_etudes,
  'espace-orientation': uk_espace_orientation,
  'famille-relations': uk_famille_relations,
  'identite': uk_identite,
  'loisirs': uk_loisirs,
  'maison': uk_maison,
  'meteo': uk_meteo,
  'nature-environnement': uk_nature_environnement,
  'numerique': uk_numerique,
  'sports': uk_sports,
  'temps': uk_temps,
  'travail-metiers': uk_travail_metiers,
  'vetements': uk_vetements,
  'ville-services': uk_ville_services,
  'voyage': uk_voyage
}

const backgroundsByPair: Record<string, Record<CanonicalThemeId, string>> = {
  'fr-es': frEsThemeBackgrounds,
  'fr-en': frEnUkThemeBackgrounds
}

export function themeBackgroundFor(theme: string | undefined, pairId = 'fr-es'): string | null {
  const pairBackgrounds = backgroundsByPair[pairId]
  if (!pairBackgrounds || !theme || !Object.prototype.hasOwnProperty.call(pairBackgrounds, theme)) return null
  return pairBackgrounds[theme as CanonicalThemeId]
}
