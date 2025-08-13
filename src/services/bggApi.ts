import axios, { AxiosError } from 'axios'
import { Parser } from 'xml2js'
import { BLUE, GREEN, RED, YELLOW, BASE_URL } from '../constants'
import { BoardGameCollectionItem } from '../types'

export interface BggCollectionApiItem {
  $: {
    objectid: string
    objecttype?: string
    subtype?: string
    collid?: string
  }
  name?: Array<{ _: string; $?: { sortindex?: string } }>
  yearpublished?: string[]
  status?: Array<Record<string, string>>
  comment?: string[]
  wishlistcomment?: string[]
}

export interface ExistingCollectionItem {
  objectId: number
  objectname: string
  versionYear: string | undefined
  status?: Record<string, string>
}

export const getExistingCollectionWithVersions = async (
  userName: string,
): Promise<BoardGameCollectionItem[]> => {
  const parameters = { username: userName }
  const urlParameters = new URLSearchParams(parameters).toString()
  const url = `${BASE_URL}/xmlapi2/collection?${urlParameters}`

  console.log(BLUE, `[Status update] Fetching collection for user ${userName}...`, { url })

  try {
    const res = await axios.get(url)
    if (res.status === 202) {
      console.log(
        YELLOW,
        '[Pending] BGG needs some time to get your collection. Automatic retry in 5 seconds.',
      )
      await new Promise((r) => setTimeout(r, 5000))
      return getExistingCollectionWithVersions(userName)
    }

    const parser = new Parser()
    const json = await parser.parseStringPromise(res.data)

    if (json.errors) {
      console.log(RED, '[Error] Access to your existing BGG collection failed.')
      if (Array.isArray(json.errors?.error) && json.errors.error[0]?.message) {
        console.log(RED, json.errors.error[0].message[0])
      }
      process.exit(1)
    }

    const total = Number(json.items?.$?.totalitems ?? 0)
    console.log(GREEN, `[Success] Access to collection successful. Found ${total} items.`)

    if (total === 0) return []

    const items: BoardGameCollectionItem[] = (json.items.item as BggCollectionApiItem[]).map(
      (it) => {
        const objectId = Number(it.$.objectid)
        const objectname = typeof it.name?.[0] === 'string' ? it.name[0] : (it.name?.[0]?._ ?? '')
        const versionYear = it.yearpublished?.[0] ?? ''

        // Extract status attributes
        let rawAttrs: Record<string, string> = {}
        if (Array.isArray(it.status) && it.status[0] && typeof it.status[0] === 'object') {
          rawAttrs = (it.status[0] as unknown as { $: Record<string, string> }).$ ?? {}
        } else if (it.status && typeof it.status === 'object' && '$' in it.status) {
          rawAttrs = (it.status as unknown as { $: Record<string, string> }).$ ?? {}
        }

        const status: BoardGameCollectionItem['status'] = {}

        // assign each key individually
        if ('own' in rawAttrs) status.own = rawAttrs['own'] === '1'
        if ('fortrade' in rawAttrs) status.fortrade = rawAttrs['fortrade'] === '1'
        if ('want' in rawAttrs) status.want = rawAttrs['want'] === '1'
        if ('wanttobuy' in rawAttrs) status.wanttobuy = rawAttrs['wanttobuy'] === '1'
        if ('prevowned' in rawAttrs) status.prevowned = rawAttrs['prevowned'] === '1'
        if ('wishlist' in rawAttrs) status.wishlist = rawAttrs['wishlist'] === '1'
        if ('wishlistpriority' in rawAttrs)
          status.wishlistpriority = Number(rawAttrs['wishlistpriority'])
        if ('preordered' in rawAttrs) status.preordered = rawAttrs['preordered'] === '1'
        if ('wanttoplay' in rawAttrs) status.wanttoplay = rawAttrs['wanttoplay'] === '1'
        if (it.comment?.[0]) status.comment = it.comment[0]
        if (it.wishlistcomment?.[0]) status.wishlistcomment = it.wishlistcomment[0]

        return { objectId, objectname, versionYear, status }
      },
    )

    return items
  } catch (err) {
    const error = err as AxiosError
    if (error.response && error.response.status === 502) {
      console.log(RED, '[Error] BGG server seems to be down (502).')
      process.exit(1)
    }
    console.log(RED, '[Error] Could not fetch collection:', error.message ?? err)
    if (process.env['DEBUG']) console.error(err)
    process.exit(1)
  }
}
