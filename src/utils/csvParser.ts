import fs from 'fs'
import { parse } from 'csv-parse/sync'
import { BoardGameCollectionItem } from '../types'

/**
 * Parse CSV and return BoardGameCollectionItem[].
 * Accepts flexible header names (case-insensitive).
 */
export const parseCollectionCsv = (filePath: string): BoardGameCollectionItem[] => {
  const raw = fs.readFileSync(filePath, 'utf8')
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[]

  if (!Array.isArray(records) || records.length === 0) return []

  const normalizeKey = (k: string) => (k || '').toLowerCase().replace(/\s+/g, '')

  const rec = records
    .map((row: Record<string, string>) => {
      const map: Record<string, string> = {}
      for (const key of Object.keys(row)) {
        map[normalizeKey(key)] = row[key] ?? ''
      }

      const get = (keys: string[]) => {
        for (const k of keys) {
          const val = map[normalizeKey(k)]
          if (val !== undefined && val !== '') return val
        }
        return undefined
      }

      const objectIdRaw = get(['objectid', 'objectId', 'id', 'object id'])
      const objectId = objectIdRaw ? Number(objectIdRaw) : NaN
      if (!objectId || isNaN(objectId)) return null

      const toBool = (v?: string) => v === '1' || v?.toLowerCase() === 'true'

      const objectname = get(['objectname']) ?? ''
      const version_nickname = get(['version_nickname', 'version nickname', 'version']) ?? undefined
      const longVersionName = version_nickname ? `${objectname} ‐ ${version_nickname}` : undefined

      // Status object for API comparison
      const status: Record<string, unknown> = {
        own: toBool(get(['own'])),
        fortrade: toBool(get(['fortrade', 'for_trade'])),
        want: toBool(get(['want'])),
        wanttobuy: toBool(get(['wanttobuy', 'want_to_buy'])),
        prevowned: toBool(get(['prevowned', 'prevowned', 'previouslyowned'])),
        wishlist: toBool(get(['wishlist'])),
        wishlistpriority: Number(get(['wishlistpriority', 'wishlist priority'])) || undefined,
        comment: get(['comment', 'textfield.comment']) ?? undefined,
        wishlistcomment:
          get(['wishlistcomment', 'wishlist comment', 'textfield.wishlistcomment']) ?? undefined,
        conditiontext:
          get(['conditiontext', 'condition text', 'textfield.conditiontext']) ?? undefined,
        preordered: toBool(get(['preordered', 'pre_ordered'])) ?? undefined,
        wanttoplay: toBool(get(['wanttoplay', 'want_to_play'])) ?? undefined,
      }

      return {
        objectId,
        objectname,
        longVersionName,
        versionYear: get(['version_yearpublished', 'version year published', 'year']) ?? undefined,
        rating: get(['rating']) ? Number(get(['rating'])) : undefined,
        numplays: get(['numplays', 'num_plays'])
          ? Number(get(['numplays', 'num_plays']))
          : undefined,
        versionLanguages: get(['version_languages', 'version languages']) ?? undefined,
        status,
      } as BoardGameCollectionItem
    })
    .filter(Boolean) as BoardGameCollectionItem[]

  console.log(`Parsed ${rec.length} records from CSV.`)
  return rec
}
