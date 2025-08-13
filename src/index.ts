import { RED, GREEN, BLUE, YELLOW, BASE_URL } from './constants'
import { parseCollectionCsv } from './utils/csvParser'
import { getExistingCollectionWithVersions } from './services/bggApi'
import { buildDriver, loginToBgg, addGameToCollection } from './services/seleniumService'
import { BoardGameCollectionItem, knownStatusKeys } from './types'

const getCredentials = async (flag: string) => {
  const idx = process.argv.indexOf(flag)
  if (idx === -1) {
    console.log(RED, `Missing ${flag} argument`)
    process.exit(1)
  }
  return process.argv[idx + 1]
}

const isSameVersion = (
  apiItem: BoardGameCollectionItem,
  csvItem: BoardGameCollectionItem,
): boolean => {
  //process.env['DEBUG'] = 'true'

  if (process.env['DEBUG'])
    console.log(`Comparing API item ${apiItem.objectId} with CSV item ${csvItem.objectId}...`, {
      apiItem,
      csvItem,
    })

  if (apiItem.objectId !== csvItem.objectId) {
    if (process.env['DEBUG'])
      console.log(RED, `Object IDs do not match: ${apiItem.objectId} vs ${csvItem.objectId}`)
    return false
  }
  if (apiItem.objectname !== csvItem.objectname) {
    if (process.env['DEBUG'])
      console.log(RED, `Object names do not match: ${apiItem.objectname} vs ${csvItem.objectname}`)
    return false
  }

  const apiStatus = apiItem.status ?? {}
  const csvStatus = csvItem.status ?? {}

  for (const key of knownStatusKeys) {
    if (apiStatus[key] !== csvStatus[key]) {
      if (process.env['DEBUG'])
        console.log(RED, `Status mismatch for key "${key}": ${apiStatus[key]} vs ${csvStatus[key]}`)
      return false
    }
  }

  return true
}

const main = async () => {
  try {
    const csvPath = process.argv[2]
    if (!csvPath) {
      console.log(
        RED,
        'Usage: node dist/index.js PATH/TO/file.csv -u user -p pass [--firefox] [show-browser] [debugging-mode]',
      )
      process.exit(1)
    }

    const userName = (await getCredentials('-u')) as string
    const password = (await getCredentials('-p')) as string

    console.log(BLUE, `Parsing CSV at ${csvPath}...`)
    const parsed = parseCollectionCsv(csvPath)

    if (parsed.length === 0) {
      console.log(YELLOW, 'No records parsed from CSV. Exiting.')
      process.exit(0)
    }

    console.log(GREEN, `Parsed ${parsed.length} records.`)

    // Get already-in-collection items with version details
    const existingItems = await getExistingCollectionWithVersions(userName)

    // Filter out already present items (exact match only) and de-duplicate
    const filtered: BoardGameCollectionItem[] = []
    for (const item of parsed) {
      const alreadyExists = existingItems.some((existing) => isSameVersion(existing, item))
      if (alreadyExists) {
        console.log(
          YELLOW,
          `Skipping ${item.objectId} (${item.objectname}) because this exact version is already in your collection.`,
        )
        continue
      }
      const duplicateInRun = filtered.some((f) => isSameVersion(item, f as BoardGameCollectionItem))
      if (duplicateInRun) {
        console.log(YELLOW, `Skipping duplicate in CSV for ${item.objectId}.`)
        continue
      }
      filtered.push(item)
    }

    if (filtered.length === 0) {
      console.log(YELLOW, 'No new items to add after filtering.')
      process.exit(0)
    }

    console.log(GREEN, `Adding ${filtered.length} new items to collection.`)

    const useFirefox = process.argv.includes('firefox')
    const driver = await buildDriver(useFirefox)
    driver.manage().window().maximize()

    try {
      await loginToBgg(driver, userName, password)

      let idx = 0
      for (const item of filtered) {
        idx++
        console.log(
          BLUE,
          `\n[${idx}/${filtered.length}] Processing ${item.objectId} - ${item.longVersionName ?? item.objectname}`,
        )
        try {
          await addGameToCollection(driver, item)
        } catch {
          console.log(RED, `Failed to add ${item.objectId}`)
        }
        // small delay to be polite
        await driver.sleep(100)
      }
    } finally {
      if (!process.argv.includes('show-browser')) {
        await driver.quit()
      } else {
        // If debugging and show-browser, keep it open (your prior code sometimes quits only if not debugging)
        console.log(YELLOW, 'Browser left open due to show-browser flag.')
      }
    }

    console.log(GREEN, 'Finished run.')
    await driver.get(`${BASE_URL}/collection/user/${userName}`) // Redirect to user's collection page
  } catch (err) {
    const error = err as Error
    console.error(RED, '[Fatal error]', error?.message ?? err)
    if (process.env['DEBUG']) console.error(err)
    process.exit(1)
  }
}

main()
