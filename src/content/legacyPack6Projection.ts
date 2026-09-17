import type { CanonicalThemeId } from './taxonomy'

/**
 * Frozen compatibility data for the historical unsigned PACK-6B runtime.
 * New catalogues must use the signed runtime-projection.json path instead.
 */
export const legacyPack6School6eAssignments: ReadonlyArray<{ entry_id: string; theme: CanonicalThemeId }> = [
  { entry_id: 'd99ce5ca-6c21-573e-adfa-b5645fe9e7a1', theme: 'famille-relations' },
  { entry_id: '4f9d2815-6450-581c-8243-f1e4e6614767', theme: 'famille-relations' },
  { entry_id: '1c784a4f-fb09-573b-a3aa-5a21c5bab8ac', theme: 'famille-relations' },
  { entry_id: '0fe1892f-6c12-5e49-a7f4-869b087c2f5f', theme: 'description' },
  { entry_id: '04a4107e-e9bd-5ab4-9c7c-3142bfcdbc11', theme: 'description' },
  { entry_id: '26a04c4f-d6b9-563e-a58f-c98211b37507', theme: 'description' },
  { entry_id: '028d1d90-02b5-5379-9844-e48e634bcab4', theme: 'description' },
  { entry_id: '2f63de83-9ba8-54c8-b5ed-eb90fde64bb0', theme: 'ecole-etudes' },
  { entry_id: 'beb23a33-b6d4-527d-b43c-cfe8298b1f4e', theme: 'ecole-etudes' },
  { entry_id: 'e2fb7261-9bb9-5c64-81b6-0c54019d8fb7', theme: 'ecole-etudes' },
  { entry_id: 'acd64004-1e77-5d46-97ab-ffb890a5c716', theme: 'nature-environnement' },
  { entry_id: '40a225c7-86ab-5220-968d-9aee82d4a189', theme: 'nature-environnement' },
  { entry_id: '333820c1-60c2-58b5-a9f7-beb68fe50d9f', theme: 'nature-environnement' },
  { entry_id: '7c024e4d-350c-5a40-95e6-2d977d14c1a9', theme: 'ecole-etudes' },
  { entry_id: '8477ff78-c572-52e3-8788-00f207b451a6', theme: 'loisirs' },
  { entry_id: '7ccd66db-2565-51f1-ae67-e4eeb4a9656d', theme: 'maison' },
  { entry_id: '48e9e577-1c21-55ed-b849-c8e7a83aac4a', theme: 'maison' },
  { entry_id: 'fe984172-dd41-546e-ac2e-18f679281f6b', theme: 'maison' },
  { entry_id: 'ce6dbab4-4e97-53d7-b245-554840db0a1b', theme: 'loisirs' },
  { entry_id: 'e34538ad-78cc-51a3-99ca-81bec718ddcb', theme: 'loisirs' },
  { entry_id: 'b7b897ba-e46e-597a-a30f-fc4feb698c6f', theme: 'loisirs' },
  { entry_id: '3a7313a4-042a-5faf-b4f2-9f877f4299df', theme: 'description' },
  { entry_id: '0c6a66c8-0f6a-5255-95e0-6bbf7cb6b2d1', theme: 'description' },
  { entry_id: '6eaf1598-5e0c-5377-a8c6-e5dd07695b60', theme: 'description' },
  { entry_id: '4fa70eb3-8cff-57c8-abdc-3c9c397833dc', theme: 'espace-orientation' }
]

export const legacyPack6VoyageA1EntryIds = [
  'fe984172-dd41-546e-ac2e-18f679281f6b',
  '633c5a80-dc55-59e0-92f5-12209e3d9f5d',
  '4fa70eb3-8cff-57c8-abdc-3c9c397833dc',
  'da4eb86b-c9e6-591a-b7ed-de2f7248fb7a'
] as const
