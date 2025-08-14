import { Builder, By, until, WebDriver, WebElement } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome'
import firefox from 'selenium-webdriver/firefox'
import { RED, GREEN, YELLOW, BLUE, BASE_URL, languageId } from '../constants'
import { BoardGameCollectionItem } from '../types'

//Build a driver for the chosen browser. Keeps same interface as original script.
export const buildDriver = (useFirefox: boolean): Promise<WebDriver> => {
  if (useFirefox) {
    const opts = new firefox.Options()
    // headless unless show-browser
    if (!process.argv.includes('show-browser')) {
      opts.addArguments('-headless', '--width=1366', '--height=900')
    }
    return new Builder().forBrowser('firefox').setFirefoxOptions(opts).build()
  } else {
    const opts = new chrome.Options()
    if (!process.argv.includes('show-browser')) {
      opts.addArguments('--headless=new', '--window-size=1366,900')
    }
    return new Builder().forBrowser('chrome').setChromeOptions(opts).build()
  }
}

// Page Settling Helper
// Waits for the page to be fully loaded and AngularJS to be idle (if applicable)
// Also waits for a specific element to be ready, which is useful for BGG pages
const waitForPageSettled = async (
  driver: WebDriver,
  {
    readySelector = '#mainbody', // safe: exists on all game pages
    timeout = 5000,
  }: { readySelector?: string; timeout?: number } = {},
) => {
  // 1) DOM ready
  if (process.env['DEBUG']) {
    console.log(BLUE, '[Status update] Waiting for page to settle...')
  }
  await driver.wait(async () => {
    const state = (await driver.executeScript('return document.readyState')) as string
    return state === 'complete'
  }, timeout)

  // 2) AngularJS pending requests = 0 (best effort; ignore if not available)
  if (process.env['DEBUG']) {
    console.log(BLUE, '[Status update] Checking for AngularJS pending requests...')
  }
  try {
    await driver.wait(async () => {
      const idle = await driver.executeScript(`
        try {
          if (!window.angular) return true;
          var inj = angular.element(document.body).injector && angular.element(document.body).injector();
          if (!inj) return true;
          var $http = inj.get('$http');
          return $http.pendingRequests.length === 0;
        } catch (e) { return true; }
      `)
      if (process.env['DEBUG']) {
        console.log(GREEN, '[Success] AngularJS is idle.')
      }
      return !!idle
    }, 5000)
  } catch {
    if (process.env['DEBUG']) {
      console.log(YELLOW, '[Warning] AngularJS check failed. Continuing without it.')
    }
  }

  // 3) Wait for a key element that proves the boardgame page is rendered
  if (readySelector) {
    if (process.env['DEBUG']) {
      console.log(BLUE, `[Status update] Waiting for element ${readySelector} to be ready...`)
    }
    const el = await driver.wait(until.elementLocated(By.css(readySelector)), timeout)
    await driver.wait(until.elementIsVisible(el), timeout)
  }
}

/**
 * Login flow:
 * - go to /login
 * - accept cookie consent if present
 * - fill username & password
 * - submit
 * - wait fixed 2s then verify title
 */
export const loginToBgg = async (driver: WebDriver, userName: string, password: string) => {
  console.log(BLUE, '[Status update] Logging in.')
  await driver.get(`${BASE_URL}/login`)

  // Accept cookie consent if visible
  try {
    const consent = await driver.wait(
      until.elementLocated(
        By.css('button.fc-cta-consent, button.fc-button.fc-cta-consent.fc-primary-button'),
      ),
      5000,
    )
    try {
      await driver.executeScript('arguments[0].click();', consent)
      console.log(GREEN, '[Info] Cookie consent accepted.')
    } catch {
      await consent.click()
      console.log(GREEN, '[Info] Cookie consent accepted.')
    }
  } catch {
    console.log(YELLOW, '[Info] Cookie consent not found — continuing.')
  }

  // Fill credentials
  // Note: BGG uses different ids in variants; keep both fallbacks
  const userFieldSelectors = ['input#inputUsername', 'input#username']
  const passFieldSelectors = ['input#inputPassword', 'input#password']

  let userElem
  for (const sel of userFieldSelectors) {
    try {
      userElem = await driver.findElement(By.css(sel))
      break
    } catch (err) {
      // Ignore errors, try next selector
      if (process.env['DEBUG']) {
        console.error(`[Debug] Selector ${sel} not found:`, err)
      }
    }
  }
  if (!userElem) {
    console.log(RED, '[Error] Username field not found on login page.')
    process.exit(1)
  }

  let passElem
  for (const sel of passFieldSelectors) {
    try {
      passElem = await driver.findElement(By.css(sel))
      break
    } catch (err) {
      // Ignore errors, try next selector
      if (process.env['DEBUG']) console.error(`[Debug] Selector ${sel} not found:`, err)
    }
  }
  if (!passElem) {
    console.log(RED, '[Error] Password field not found on login page.')
    process.exit(1)
  }

  await userElem.clear()
  await userElem.sendKeys(userName)
  await passElem.clear()
  await passElem.sendKeys(password)

  // Submit - prefer primary login button
  const submitSelectors = ["button[type='submit']", 'button.login-submit', 'button.btn-primary']
  let submitElem
  for (const sel of submitSelectors) {
    try {
      submitElem = await driver.findElement(By.css(sel))
      break
    } catch (err) {
      // Ignore errors, try next selector
      if (process.env['DEBUG']) console.error(`[Debug] Selector ${sel} not found:`, err)
    }
  }
  if (!submitElem) {
    console.log(RED, '[Error] Login submit button not found.')
    process.exit(1)
  }

  await submitElem.click()

  // Give the front page some time to load before checking if login was successful
  await driver.sleep(2000)
  const pageTitle = await driver.getTitle()
  if (pageTitle !== 'BoardGameGeek | Gaming Unplugged Since 2000') {
    console.log(RED, '[Error] Login failed. Please check username and password')
    process.exit(1)
  }
  console.log(GREEN, '[Success] Login succeeded.')
}

/**
 * Add a single game to the collection, using the same DOM interactions
 * This will:
 *  - open the "Add To Collection" modal
 *  - click checkboxes conditionally: own, fortrade, want, wanttobuy, prevowned
 *  - check wishlist and set wishlistpriority (1..5)
 *  - fill comment and wishlistcomment textareas
 *  - save
 */
export const addGameToCollection = async (driver: WebDriver, item: BoardGameCollectionItem) => {
  const id = item.objectId
  console.log(BLUE, `[Status update] Opening page for ID ${id}`)
  await driver.get(`${BASE_URL}/boardgame/${id}`)

  // ensure the page is really ready before we proceed
  await waitForPageSettled(driver)

  // --- Helper functions ---
  const waitAndClick = async (selector: string, label: string, index?: number) => {
    try {
      let el: WebElement

      if (index == null) {
        // Single element case
        el = await driver.wait(until.elementLocated(By.css(selector)), 5000)
      } else {
        // Nth element: wait until there are enough matches
        await driver.wait(
          async () => {
            const found = await driver.findElements(By.css(selector))
            return found.length > index
          },
          5000,
          `Timed out waiting for ${label} index ${index}`,
        )
        const found = await driver.findElements(By.css(selector))
        el = found[index]!
      }

      // Now ensure visible & enabled
      await driver.wait(until.elementIsVisible(el), 5000)
      await driver.wait(until.elementIsEnabled(el), 5000)

      // Scroll into view (important in headless)
      await driver.executeScript('arguments[0].scrollIntoView({block: "center"});', el)

      // Click with JS fallback for headless flakiness
      try {
        await el.click()
      } catch (err) {
        if (process.env['DEBUG']) {
          console.log(
            YELLOW,
            `⚠️ Click failed, trying JS fallback for ${label}:`,
            (err as Error).message,
          )
        }
        await driver.executeScript('arguments[0].click();', el)
      }

      console.log(YELLOW, `✅ Clicked ${label}`)
    } catch (err) {
      console.log(YELLOW, `⚠️ Could not click ${label}: ${String(err)}`)
    }
  }

  const waitAndSetCheckbox = async (selector: string, shouldCheck: boolean, label: string) => {
    try {
      // Wait for checkbox to exist in DOM
      const el = await driver.wait(until.elementLocated(By.css(selector)), 5000)

      // Scroll it into view (important for headless mode)
      await driver.executeScript('arguments[0].scrollIntoView({block: "center"});', el)

      // Wait until it's visible
      await driver.wait(until.elementIsVisible(el), 5000)

      // Check current state
      const isChecked = await el.isSelected()

      // Click only if necessary
      if (isChecked !== shouldCheck) {
        try {
          await el.click()
        } catch {
          // Fallback for headless mode clicks
          await driver.executeScript('arguments[0].click();', el)
        }
        if (process.env['DEBUG'])
          console.log(`${GREEN}Set ${label} to ${shouldCheck ? 'checked' : 'unchecked'}`)
      } else {
        if (process.env['DEBUG'])
          console.log(`${YELLOW}${label} already ${shouldCheck ? 'checked' : 'unchecked'}`)
      }
    } catch (err) {
      console.log(`${RED}Could not set ${label}: ${(err as Error).message}`)
      if (process.env['DEBUG']) console.error(err)
    }
  }

  const waitAndSetTextarea = async (id: string, text: string, label: string) => {
    try {
      const ta = await driver.wait(until.elementLocated(By.id(id)), 5000)
      await driver.wait(until.elementIsVisible(ta), 5000)
      await driver.executeScript(`
        const ta = document.getElementById("${id}");
        if(ta) {
          ta.value = ${JSON.stringify(text)};
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          ta.dispatchEvent(new Event('blur', { bubbles: true }));
        }
      `)
      if (process.env['DEBUG']) console.log(YELLOW, `✅ Added ${label}`)
    } catch (err) {
      console.log(YELLOW, `⚠️ Could not set ${label}: ${String(err)}`)
    }
  }

  const resetAllCheckboxes = async () => {
    const checkboxSelectors = [
      "[ng-model='item.status.own']",
      "[ng-model='item.status.fortrade']",
      "[ng-model='item.status.want']",
      "[ng-model='item.status.wanttobuy']",
      "[ng-model='item.status.prevowned']",
      "[ng-model='item.status.wishlist']",
      "[ng-model='item.status.preordered']",
    ]
    for (const selector of checkboxSelectors) {
      try {
        const el = await driver.findElement(By.css(selector))
        const isChecked = await el.getAttribute('checked')
        if (isChecked) await el.click()
      } catch (err) {
        console.log(YELLOW, `⚠️ Could not reset checkbox for ${selector}: ${String(err)}`)
      }
    }
    if (process.env['DEBUG']) console.log(YELLOW, '✅ Reset all checkboxes')
  }

  const setFields = async () => {
    if (!item.status) item.status = {}

    await resetAllCheckboxes()

    await waitAndSetCheckbox("[ng-model='item.status.own']", !!item.status.own, 'OWN')
    await waitAndSetCheckbox(
      "[ng-model='item.status.fortrade']",
      !!item.status.fortrade,
      'FOR TRADE',
    )
    await waitAndSetCheckbox("[ng-model='item.status.want']", !!item.status.want, 'WANT')
    await waitAndSetCheckbox(
      "[ng-model='item.status.wanttobuy']",
      !!item.status.wanttobuy,
      'WANT TO BUY',
    )
    await waitAndSetCheckbox(
      "[ng-model='item.status.prevowned']",
      !!item.status.prevowned,
      'PREVIOUSLY OWNED',
    )

    if (item.status.wishlist) {
      await waitAndSetCheckbox("[ng-model='item.status.wishlist']", true, 'WISHLIST')
      if (item.status.wishlistpriority != null) {
        await driver.executeScript(`
          const sel = document.querySelector("select[ng-model='item.wishlistpriority']");
          if (sel) {
            const scope = angular.element(sel).scope();
            scope.$apply(() => {
              scope.item.wishlistpriority = ${item.status.wishlistpriority ?? 3};
            });
          }
        `)
        if (item.status.wishlistcomment) {
          await waitAndSetTextarea(
            'wishlistcomment',
            item.status.wishlistcomment,
            'Wishlist Comment',
          )
        }
      }
    }

    if (item.status.comment) {
      await waitAndSetTextarea('comment', item.status.comment, 'Comment')
    }
  }

  // --- Unified add + set fields + save function ---
  const addAndSetFields = async (isVersion = false) => {
    if (!isVersion) {
      await driver.wait(
        until.elementIsEnabled(
          driver.findElement(By.xpath("//button[@ng-disabled='colltoolbarctrl.loading']")),
        ),
        5000,
      )
      await driver.executeScript(
        `document.querySelector("[ng-disabled='colltoolbarctrl.loading']").click();`,
      )
    }

    // Wait for modal in both headless & normal mode
    await driver.wait(until.elementLocated(By.css('.modal-dialog')), 5000)
    const modal = await driver.findElement(By.css('.modal-dialog'))

    // Ensure modal is visible, by forcing a screenshot to trigger rendering
    // This is a workaround for headless mode where modals might not render properly
    if (!(await modal.isDisplayed())) {
      await modal.takeScreenshot()
    }
    await driver.wait(until.elementIsVisible(modal), 500)

    await setFields()
    await waitAndClick("button[type='submit'].btn-primary:not([disabled])", 'Save')
    await driver.wait(
      until.elementLocated(By.css('div.cg-notify-message-template span.ng-scope')),
      5000,
    )
  }

  // --- Function to handle language-specific versions ---
  const tryAddVersion = async (): Promise<{
    skipped?: boolean
    added?: boolean
    title?: string
    index?: number
  }> => {
    if (!item.longVersionName || !item.versionLanguages) return { added: false }

    const firstLanguage = item.versionLanguages.split(';')[0]?.trim() || 'English'
    const langCode = languageId[firstLanguage]
    if (!langCode) return { added: false }

    const urlOverviewTab = await driver.getCurrentUrl()
    const urlVersions = `${urlOverviewTab}/versions?pageid=1&language=${langCode}`
    await driver.get(urlVersions)
    await driver.sleep(500)

    try {
      const matchInfo = await driver.executeScript<{
        skipped?: boolean
        added?: boolean
        title?: string
        index?: number
      }>(`
      const longVersionName = ${JSON.stringify(item.longVersionName)};
      const versionYear = ${JSON.stringify(item.versionYear)};
      const withYear = versionYear ? longVersionName + ' (' + versionYear + ')' : longVersionName;
      const acceptableMatches = [longVersionName, withYear].map(s => s.replace(/\\s+/g,' ').trim());

      function getVisibleText(el) {
        function recurse(node) {
          if (node.nodeType === 3) return node.textContent || '';
          if (node.nodeType !== 1) return '';
          const style = window.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') return '';
          if (node.classList.contains('ng-hide')) return '';
          return Array.from(node.childNodes).map(recurse).join(' ');
        }
        return recurse(el).replace(/\\s+/g,' ').trim();
      }

      const normalizeText = (s) => s.replace(/\\s+/g,' ').trim().replace(/[\\u2010-\\u2014]/g,'-');
      const headers = Array.from(document.querySelectorAll('h3.summary-item-title'));

      for (let i = 0; i < headers.length; i++) {
        const h3 = headers[i];
        const visible = getVisibleText(h3);
        const container = h3.closest('li.summary-item');
        const statusList = container?.querySelector('collection-button-status-list');

        if (statusList && statusList.querySelectorAll('span.ng-binding').length > 0) {
          return { skipped: true, title: normalizeText(visible), index: i };
        }

        const text = normalizeText(visible);
        if (acceptableMatches.some(m => normalizeText(m) === text)) {
          return { added: true, title: text, index: i };
        }
      }

      throw new Error('Version matching "' + acceptableMatches + '" not found');
    `)

      return matchInfo || { added: false }
    } catch (err) {
      console.log(YELLOW, `[Warning] Could not find version. ${(err as Error).message}`)
      return { added: false }
    }
  }

  // --- Main flow ---
  const versionAdded = await tryAddVersion()

  if (versionAdded.skipped) {
    console.log(YELLOW, `⚠️ Version already in collection/wishlist: ${versionAdded.title}`)
  } else if (versionAdded.added && versionAdded.index != null) {
    await waitAndClick(
      'li.summary-item button[add-to-collection-button]',
      'Add to Collection (version)',
      versionAdded.index,
    )
    await driver.sleep(500)
    await addAndSetFields(true)
    console.log(GREEN, `✅ Added version: ${versionAdded.title}`)
  } else if (!versionAdded.added) {
    await driver.get(`${BASE_URL}/boardgame/${id}`)
    await driver.sleep(500)
    await addAndSetFields()
  }

  const pageTitle = await driver.getTitle()
  console.log(GREEN, `✅ Saved: ${pageTitle.replace(/\s*\|.*$/, '')}`)
}
