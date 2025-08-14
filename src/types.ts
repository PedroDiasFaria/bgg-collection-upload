export type BoardGameCollectionItem = {
  //BGG object id as number
  objectId: number
  rating?: number | null
  numplays?: number | null

  // Status info from CSV or API
  status?: {
    own?: boolean
    fortrade?: boolean
    want?: boolean
    wanttobuy?: boolean
    prevowned?: boolean
    wishlist?: boolean
    wishlistpriority?: number
    comment?: string
    wishlistcomment?: string
    conditiontext?: string
    preordered?: boolean
    wanttoplay?: boolean
  }

  longVersionName?: string
  versionLanguages?: string
  objectname: string
  versionYear?: string
}

type StatusKeys = Exclude<keyof NonNullable<BoardGameCollectionItem['status']>, undefined>

export const knownStatusKeys: StatusKeys[] = [
  'own',
  'fortrade',
  'want',
  'wanttobuy',
  'prevowned',
  'wishlist',
  'preordered',
  'comment',
  'wishlistcomment',
  'wanttoplay',
]
