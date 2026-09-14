import { canonicalThemeIds, type CanonicalThemeId } from './taxonomy'

export interface ExternalThemeMappingEntry {
  theme_id: CanonicalThemeId
  external_axis_id: string
  external_axis_label: string
}

export interface ExternalThemeMapping {
  mapping_id: string
  framework: string
  framework_version: string
  scope: string
  source_urls: string[]
  mappings: ExternalThemeMappingEntry[]
}

export interface ExternalThemeMappingValidationResult {
  valid: boolean
  errors: string[]
}

export const externalThemeMappings: ExternalThemeMapping[] = []

export function validateExternalThemeMapping(mapping: ExternalThemeMapping): ExternalThemeMappingValidationResult {
  const errors: string[] = []
  if (!mapping.mapping_id.trim()) errors.push('missing-mapping-id')
  if (!mapping.framework.trim()) errors.push('missing-framework')
  if (!mapping.framework_version.trim()) errors.push('missing-framework-version')
  if (!mapping.scope.trim()) errors.push('missing-scope')
  if (mapping.source_urls.length === 0) errors.push('missing-source')

  const pairs = new Set<string>()
  for (const item of mapping.mappings) {
    if (!canonicalThemeIds.has(item.theme_id)) errors.push(`unknown-theme:${item.theme_id}`)
    if (!item.external_axis_id.trim()) errors.push(`missing-external-axis-id:${item.theme_id}`)
    if (!item.external_axis_label.trim()) errors.push(`missing-external-axis-label:${item.theme_id}`)

    const pair = `${item.theme_id}:${item.external_axis_id}`
    if (pairs.has(pair)) errors.push(`duplicate-mapping:${pair}`)
    pairs.add(pair)
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}
