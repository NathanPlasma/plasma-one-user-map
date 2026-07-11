import { readFile } from 'node:fs/promises'

import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import {
  addInventoryItem,
  addSourceToIsland,
  buildInventories,
  continueTo,
  currentGeneration,
  dragSourceToCanvas,
  expectAllContainedWithin,
  expectInsideViewport,
  expectSaved,
  groupInventoryItems,
  islandHeaderCenter,
  islandMembership,
  islandNodeTransform,
  localCopy,
  lockInventories,
  minimumInventory,
  openBlankBoard,
  seedUser,
  sourceButton,
  switchInventory,
  userIsland,
} from './helpers/workshop'

test.describe('Chromium production regression', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium coverage')
  test.setTimeout(75_000)

  test('opens blank and keeps all four inventories isolated', async ({ page }) => {
    await openBlankBoard(page)

    await expect(page.getByRole('button', { name: 'Seed users' })).toBeDisabled()
    await addInventoryItem(page, 'problem', 'Slow transfers')

    const activeEdit = page.getByRole('article', {
      name: 'Slow transfers',
      exact: true,
    })
    await activeEdit.dblclick()
    await activeEdit
      .getByRole('textbox', { name: 'Title' })
      .fill('Slow transfers abroad')
    await page.getByRole('button', { name: 'Users', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Users', exact: true }),
    ).toBeVisible()

    await expect(page.getByRole('article', { name: 'Slow transfers' })).toHaveCount(0)
    await addInventoryItem(page, 'user', 'Globally paid operator')

    await switchInventory(page, 'region')
    await expect(
      page.getByRole('article', { name: 'Globally paid operator' }),
    ).toHaveCount(0)
    await addInventoryItem(page, 'region', 'Dubai')

    await switchInventory(page, 'monetization')
    await expect(page.getByRole('article', { name: 'Dubai' })).toHaveCount(0)
    await addInventoryItem(page, 'monetization', 'Interchange')

    await switchInventory(page, 'problem')
    await expect(
      page.getByRole('article', { name: 'Slow transfers abroad', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('article', { name: 'Interchange' })).toHaveCount(0)
  })

  test('creates and fills a category from the keyboard', async ({ page }) => {
    await openBlankBoard(page)
    await addInventoryItem(page, 'problem', 'Slow transfers')

    const createCategory = page.getByRole('button', { name: 'New category' })
    await createCategory.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('New category, category with 0 items')).toBeVisible()

    const card = page.getByRole('article', { name: 'Slow transfers', exact: true })
    await card.focus()
    await page.keyboard.press('Shift+F10')
    const menu = page.getByRole('menu', { name: 'Actions for Slow transfers' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Edit' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(
      menu.getByRole('menuitem', { name: 'Move to category…' }),
    ).toBeFocused()
    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog', { name: 'Move to category' })
    const destination = dialog.getByRole('button', { name: 'New category' })
    await destination.focus()
    await page.keyboard.press('Enter')

    await expect(page.getByLabel('New category, category with 1 item')).toBeVisible()
  })

  test('grows a category to contain cards assigned after grouping', async ({
    page,
  }) => {
    await openBlankBoard(page)
    const titles = [
      'Slow transfers',
      'Unreliable local banking',
      'No useful card access',
      'Expensive currency conversion',
    ]
    for (const [index, title] of titles.entries()) {
      await addInventoryItem(
        page,
        'problem',
        title,
        index === 0 ? 'Long facilitator context. '.repeat(40) : '',
      )
    }

    await groupInventoryItems(page, titles.slice(0, 2))
    const category = page.getByLabel('New category, category with 2 items')
    const initialBox = await category.boundingBox()
    expect(initialBox).not.toBeNull()

    for (const title of titles.slice(2)) {
      const card = page.getByRole('article', { name: title, exact: true })
      await card.getByRole('button', { name: `Actions for ${title}` }).click()
      await page.getByRole('menuitem', { name: 'Move to category…' }).click()
      await page
        .getByRole('dialog', { name: 'Move to category' })
        .getByRole('button', { name: 'New category' })
        .click()
    }

    const grownCategory = page.getByLabel('New category, category with 4 items')
    await expect(grownCategory).toBeVisible()
    await expect
      .poll(async () => {
        const categoryBox = await grownCategory.boundingBox()
        const cardBoxes = await Promise.all(
          titles.map((title) =>
            page.getByRole('article', { name: title, exact: true }).boundingBox(),
          ),
        )
        if (!categoryBox || cardBoxes.some((box) => !box)) return false
        const contained = cardBoxes.every(
          (box) =>
            box &&
            box.x >= categoryBox.x + 12 &&
            box.y >= categoryBox.y + 48 &&
            box.x + box.width <= categoryBox.x + categoryBox.width - 12 &&
            box.y + box.height <= categoryBox.y + categoryBox.height - 12,
        )
        const separated = cardBoxes.every((box, index) =>
          cardBoxes
            .slice(index + 1)
            .every(
              (other) =>
                box &&
                other &&
                (box.x + box.width <= other.x + 1 ||
                  other.x + other.width <= box.x + 1 ||
                  box.y + box.height <= other.y + 1 ||
                  other.y + other.height <= box.y + 1),
            ),
        )
        return contained && separated
      })
      .toBe(true)

    const grownBox = await grownCategory.boundingBox()
    expect(grownBox?.height ?? 0).toBeGreaterThan(initialBox?.height ?? 0)
  })

  test('keeps growing archetypes readable and displaces the row below', async ({
    page,
  }) => {
    const problems = [
      'A',
      'Hard to spend stablecoins day to day',
      'Local banks feel unreliable',
      'No useful card access',
      'Expensive currency conversion',
      'Slow international transfers',
      'Balances split across too many wallets',
      'Payments fail without warning',
    ]
    const users = ['Top left', 'Top middle', 'Top right', 'Bottom left']
    await openBlankBoard(page)
    await buildInventories(page, { ...minimumInventory, problems, users })
    await lockInventories(page)
    for (const user of users) await seedUser(page, user)
    await continueTo(page, 'problems')

    for (const problem of problems) {
      await addSourceToIsland(page, problem, 'Top left')
    }

    const shortCopy = localCopy(userIsland(page, 'Top left'), 'A', 'problem')
    await expect(shortCopy).toBeVisible()
    const shortCopyBox = await shortCopy.boundingBox()
    const shortCopyZoom = await page
      .locator('.react-flow__viewport')
      .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)
    expect((shortCopyBox?.width ?? 0) / shortCopyZoom).toBeGreaterThanOrEqual(159.5)

    const top = userIsland(page, 'Top left')
    const below = userIsland(page, 'Bottom left')
    await expect
      .poll(async () => {
        const topBox = await top.boundingBox()
        const belowBox = await below.boundingBox()
        if (!topBox || !belowBox) return -1
        const zoom = await page
          .locator('.react-flow__viewport')
          .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)
        return (belowBox.y - (topBox.y + topBox.height)) / zoom
      })
      .toBeGreaterThanOrEqual(31.5)

    await continueTo(page, 'regions')
    await addSourceToIsland(page, 'Dubai', 'Top left')
    const beforeNextLayer = await islandNodeTransform(below)
    await continueTo(page, 'monetization')
    await expect
      .poll(async () => {
        const topBox = await top.boundingBox()
        const belowBox = await below.boundingBox()
        if (!topBox || !belowBox) return -1
        const zoom = await page
          .locator('.react-flow__viewport')
          .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)
        return (belowBox.y - (topBox.y + topBox.height)) / zoom
      })
      .toBeGreaterThanOrEqual(31.5)
    expect(await islandNodeTransform(below)).not.toBe(beforeNextLayer)
    const workspace = page.locator('.workspace-main')
    await expect
      .poll(async () => {
        const workspaceBox = await workspace.boundingBox()
        const topBox = await top.boundingBox()
        const belowBox = await below.boundingBox()
        if (!workspaceBox || !topBox || !belowBox) return false
        return (
          topBox.y >= workspaceBox.y + 8 &&
          belowBox.y + belowBox.height <= workspaceBox.y + workspaceBox.height - 8
        )
      })
      .toBe(true)
  })

  test('exports the latest valid inline edit when Save copy is clicked immediately', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'chromium-compact',
      'Save copy is intentionally hidden in the compact top bar',
    )
    await openBlankBoard(page)
    await addInventoryItem(page, 'problem', 'Original transfer problem')

    const card = page.getByRole('article', {
      name: 'Original transfer problem',
      exact: true,
    })
    await card.dblclick()
    await card.getByRole('textbox', { name: 'Title' }).fill('Latest transfer problem')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save copy' }).click(),
    ])
    const downloadPath = await download.path()
    if (!downloadPath) throw new Error('Save copy did not create a local download')
    const payload = JSON.parse(await readFile(downloadPath, 'utf8')) as {
      formatVersion: number
      workspace: {
        drafts: {
          problem: { itemsById: Record<string, { title: string }> }
        }
      }
    }
    const exportedTitles = Object.values(
      payload.workspace.drafts.problem.itemsById,
    ).map((item) => item.title)

    expect(download.suggestedFilename()).toMatch(/\.json$/)
    expect(payload.formatVersion).toBe(1)
    expect(exportedTitles).toContain('Latest transfer problem')
    expect(exportedTitles).not.toContain('Original transfer problem')
    await expect(
      page.getByRole('article', { name: 'Latest transfer problem', exact: true }),
    ).toBeVisible()
  })

  test('locks deliberately, copies one source independently, and prevents duplicates', async ({
    page,
  }) => {
    await openBlankBoard(page)
    await buildInventories(page, {
      ...minimumInventory,
      problems: ['Shared problem'],
      users: ['Globally paid operator', 'Nomadic high earner'],
    })
    await lockInventories(page)

    await seedUser(page, 'Globally paid operator')
    await seedUser(page, 'Nomadic high earner')
    await sourceButton(page, 'Globally paid operator').click()

    await expect(
      page.getByText('This user already has an island', { exact: true }),
    ).toBeVisible()
    await expect(userIsland(page, 'Globally paid operator')).toHaveCount(1)

    await continueTo(page, 'problems')
    await addSourceToIsland(page, 'Shared problem', 'Globally paid operator')
    await addSourceToIsland(page, 'Shared problem', 'Nomadic high earner')

    const firstIsland = userIsland(page, 'Globally paid operator')
    const secondIsland = userIsland(page, 'Nomadic high earner')
    await expect(localCopy(firstIsland, 'Shared problem', 'problem')).toBeVisible()
    await expect(localCopy(secondIsland, 'Shared problem', 'problem')).toBeVisible()

    await localCopy(firstIsland, 'Shared problem', 'problem').dblclick()
    await firstIsland
      .getByRole('textbox', { name: 'Local copy title' })
      .fill('Shared problem for operator')
    await firstIsland.getByRole('button', { name: 'Save' }).click()

    await expect(
      localCopy(firstIsland, 'Shared problem for operator', 'problem'),
    ).toBeVisible()
    await expect(localCopy(secondIsland, 'Shared problem', 'problem')).toBeVisible()
    await expect(sourceButton(page, 'Shared problem')).toBeVisible()

    await secondIsland
      .getByRole('button', { name: 'Actions for Nomadic high earner' })
      .click()
    await page.getByRole('menuitem', { name: 'Delete archetype' }).click()
    await expect(secondIsland).toHaveCount(0)

    const removalToast = page
      .getByText('Archetype removed', { exact: true })
      .locator('xpath=ancestor::*[@data-sonner-toast][1]')
    await expect(removalToast).toBeVisible()
    await removalToast.getByRole('button', { name: 'Undo' }).click()
    await expect(userIsland(page, 'Nomadic high earner')).toBeVisible()
    await expect(
      localCopy(userIsland(page, 'Nomadic high earner'), 'Shared problem', 'problem'),
    ).toBeVisible()
  })

  test('real pointer drag of a locked User seeds one island at the drop point', async ({
    page,
  }) => {
    await openBlankBoard(page)
    await buildInventories(page, {
      ...minimumInventory,
      users: ['Dragged user'],
    })
    await lockInventories(page)

    const generation = await currentGeneration(page)
    const drop = await dragSourceToCanvas(page, 'Dragged user')
    const island = userIsland(page, 'Dragged user')
    await expect(island).toHaveCount(1)
    await expectSaved(page, generation)
    await expect(sourceButton(page, 'Dragged user')).toBeVisible()

    await expect
      .poll(async () => Math.abs((await islandHeaderCenter(island)).x - drop.x), {
        message: 'Expected the island header to settle near the horizontal drop point',
      })
      .toBeLessThan(40)
    await expect
      .poll(async () => Math.abs((await islandHeaderCenter(island)).y - drop.y), {
        message: 'Expected the island header to settle near the vertical drop point',
      })
      .toBeLessThan(40)
  })

  test('deleting the middle freeform island then click-seeding another uses a distinct transform', async ({
    page,
  }) => {
    const users = ['First user', 'Middle user', 'Third user', 'Fourth user']
    await openBlankBoard(page)
    await buildInventories(page, { ...minimumInventory, users })
    await lockInventories(page)
    for (const user of users.slice(0, 3)) await seedUser(page, user)

    await page.getByRole('button', { name: 'Fit board to view' }).click()
    const first = userIsland(page, 'First user')
    const middle = userIsland(page, 'Middle user')
    const third = userIsland(page, 'Third user')
    await expect(
      middle.getByRole('button', { name: 'Actions for Middle user' }),
    ).toBeInViewport()

    const generation = await currentGeneration(page)
    await middle.getByRole('button', { name: 'Actions for Middle user' }).click()
    await page.getByRole('menuitem', { name: 'Delete archetype' }).click()
    await expect(middle).toHaveCount(0)
    await expectSaved(page, generation)

    await seedUser(page, 'Fourth user')
    const transforms = await Promise.all(
      [first, third, userIsland(page, 'Fourth user')].map(islandNodeTransform),
    )
    for (const transform of transforms) expect(transform).not.toBe('')
    expect(new Set(transforms).size, transforms.join('\n')).toBe(3)
  })

  test('adds only missing category sources as one atomic Undo transaction and reloads it', async ({
    page,
  }) => {
    await openBlankBoard(page)
    await buildInventories(page, {
      ...minimumInventory,
      problems: ['Slow transfers', 'Punitive FX fees'],
    })
    await switchInventory(page, 'problem')
    await groupInventoryItems(page, ['Slow transfers', 'Punitive FX fees'])
    await lockInventories(page)
    await seedUser(page, 'Globally paid operator')
    await continueTo(page, 'problems')

    await addSourceToIsland(page, 'Slow transfers', 'Globally paid operator')

    const groupSection = page
      .getByLabel('Locked problems')
      .getByRole('heading', { name: 'New category' })
      .locator('xpath=ancestor::section[1]')
    await groupSection.getByRole('button', { name: 'Add group' }).click()

    const destination = page.getByRole('dialog')
    await expect(destination).toContainText('1 new · 1 already here')
    await destination
      .getByRole('button', { name: /Globally paid operator.*1 new.*1 already here/ })
      .click()

    const island = userIsland(page, 'Globally paid operator')
    await expect(localCopy(island, 'Slow transfers', 'problem')).toBeVisible()
    await expect(localCopy(island, 'Punitive FX fees', 'problem')).toBeVisible()

    const generationBeforeUndo = await currentGeneration(page)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(localCopy(island, 'Slow transfers', 'problem')).toBeVisible()
    await expect(localCopy(island, 'Punitive FX fees', 'problem')).toHaveCount(0)
    await expectSaved(page, generationBeforeUndo)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Add problems' })).toBeVisible()
    await expect(
      localCopy(
        userIsland(page, 'Globally paid operator'),
        'Slow transfers',
        'problem',
      ),
    ).toBeVisible()
    await expect(
      localCopy(
        userIsland(page, 'Globally paid operator'),
        'Punitive FX fees',
        'problem',
      ),
    ).toHaveCount(0)
  })

  test('stops Phase 2 Undo at the locked empty assembly', async ({ page }) => {
    await openBlankBoard(page)
    await buildInventories(page)
    await lockInventories(page)
    await seedUser(page, 'Globally paid operator')

    const generationBeforeUndo = await currentGeneration(page)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(userIsland(page, 'Globally paid operator')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
    await expectSaved(page, generationBeforeUndo)
    await expect(page.getByRole('button', { name: 'Unlock inventories' })).toHaveCount(
      0,
    )

    await page.getByRole('button', { name: 'Problems, read only' }).click()
    await expect(
      page.getByText('Inventory v1 · read only', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('article', { name: 'Slow transfers, read only' }),
    ).toBeVisible()

    await page.reload()
    await expect(
      page.getByText('Inventory v1 · read only', { exact: true }),
    ).toBeVisible()
    await expect(userIsland(page, 'Globally paid operator')).toHaveCount(0)
  })

  test('Tidy and Restore preserve membership and exact freeform positions', async ({
    page,
  }) => {
    await openBlankBoard(page)
    await buildInventories(page, {
      ...minimumInventory,
      users: ['Globally paid operator', 'Nomadic high earner'],
    })
    await lockInventories(page)
    await seedUser(page, 'Globally paid operator')
    await seedUser(page, 'Nomadic high earner')

    await continueTo(page, 'problems')
    await addSourceToIsland(page, 'Slow transfers', 'Globally paid operator')
    await continueTo(page, 'regions')
    await addSourceToIsland(page, 'Dubai', 'Globally paid operator')
    await continueTo(page, 'monetization')
    await addSourceToIsland(page, 'Interchange', 'Globally paid operator')

    const firstIsland = userIsland(page, 'Globally paid operator')
    const secondIsland = userIsland(page, 'Nomadic high earner')
    await expect(localCopy(firstIsland, 'Slow transfers', 'problem')).toBeVisible()
    await expect(localCopy(firstIsland, 'Dubai', 'region')).toBeVisible()
    await expect(localCopy(firstIsland, 'Interchange', 'monetization')).toBeVisible()
    const membershipBefore = await islandMembership(firstIsland)
    const firstBefore = await islandNodeTransform(firstIsland)
    const secondBefore = await islandNodeTransform(secondIsland)

    await page.getByRole('button', { name: 'Tidy' }).click()
    await expect(page.getByRole('button', { name: 'Restore freeform' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Archetypes', exact: true }),
    ).toBeVisible()
    const buildRail = page.getByLabel('Build archetypes')
    for (const label of [
      'Seed users',
      'Add problems',
      'Add regions',
      'Add monetization',
    ]) {
      const step = buildRail.getByRole('button', { name: label, exact: true })
      await expect(step).not.toHaveAttribute('aria-current', 'step')
      await expect(step).not.toHaveAttribute('data-active', 'true')
    }
    await expect(page.getByLabel('Locked monetization')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    await expect(page.getByLabel('Locked monetization')).toHaveAttribute('inert', '')
    await expect
      .poll(async () => [
        await islandNodeTransform(firstIsland),
        await islandNodeTransform(secondIsland),
      ])
      .not.toEqual([firstBefore, secondBefore])
    await expect(page.locator('.workspace-main')).not.toHaveAttribute(
      'data-layout-animating',
      'true',
    )

    expect(await islandMembership(firstIsland)).toEqual(membershipBefore)
    const firstTidy = await islandNodeTransform(firstIsland)
    const secondTidy = await islandNodeTransform(secondIsland)
    expect([firstTidy, secondTidy]).not.toEqual([firstBefore, secondBefore])

    await page.getByRole('button', { name: 'Restore freeform' }).click()
    await expect(page.getByRole('button', { name: 'Tidy' })).toBeVisible()
    await expect
      .poll(async () => [
        await islandNodeTransform(firstIsland),
        await islandNodeTransform(secondIsland),
      ])
      .toEqual([firstBefore, secondBefore])
    await expect(page.locator('.workspace-main')).not.toHaveAttribute(
      'data-layout-animating',
      'true',
    )

    expect(await islandMembership(firstIsland)).toEqual(membershipBefore)
    expect(await islandNodeTransform(firstIsland)).toBe(firstBefore)
    expect(await islandNodeTransform(secondIsland)).toBe(secondBefore)
  })

  test('compact Tidy keeps six islands inside the canvas and neutralises the build rail', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-compact', 'Compact viewport only')
    expect(page.viewportSize()).toEqual({ width: 1024, height: 768 })
    const users = [
      'Remote founder',
      'Cross-border contractor',
      'Crypto-native earner',
      'International student',
      'Frequent traveller',
      'Diaspora family lead',
    ]
    await openBlankBoard(page)
    await buildInventories(page, { ...minimumInventory, users })
    await lockInventories(page)
    for (const user of users) await seedUser(page, user)
    await continueTo(page, 'problems')
    await continueTo(page, 'regions')
    await continueTo(page, 'monetization')

    const islands = page.getByRole('article', { name: /, user archetype$/ })
    await expect(islands).toHaveCount(6)
    const freeformTransforms = await Promise.all(
      users.map((user) => islandNodeTransform(userIsland(page, user))),
    )
    await page.getByRole('button', { name: 'Tidy' }).click()
    await expect(page.getByRole('button', { name: 'Restore freeform' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Archetypes', exact: true }),
    ).toBeVisible()
    const buildRail = page.getByLabel('Build archetypes')
    for (const label of [
      'Seed users',
      'Add problems',
      'Add regions',
      'Add monetization',
    ]) {
      const step = buildRail.getByRole('button', { name: label, exact: true })
      await expect(step).not.toHaveAttribute('aria-current', 'step')
      await expect(step).not.toHaveAttribute('data-active', 'true')
    }

    await expect
      .poll(() =>
        Promise.all(users.map((user) => islandNodeTransform(userIsland(page, user)))),
      )
      .not.toEqual(freeformTransforms)
    await expect(page.locator('.workspace-main')).not.toHaveAttribute(
      'data-layout-animating',
      'true',
    )
    await expectAllContainedWithin(
      page.getByRole('application', { name: 'Archetype assembly canvas' }),
      islands,
    )
  })

  test('keeps all journey actions reachable at 1024 by 768', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-compact', 'Compact viewport only')
    await openBlankBoard(page)

    for (const label of [
      'Problems',
      'Users',
      'Regions',
      'Monetization',
      'Seed users',
      'Add problems',
      'Add regions',
      'Add monetization',
    ]) {
      await expectInsideViewport(
        page.getByRole('button', { name: label, exact: true }),
        1024,
        768,
      )
    }

    await buildInventories(page)
    await lockInventories(page)
    await seedUser(page, 'Globally paid operator')

    for (const label of [
      'Seed users',
      'Add problems',
      'Add regions',
      'Add monetization',
    ]) {
      const action = page.getByRole('button', { name: label, exact: true })
      await expect(action).toBeEnabled()
      await expectInsideViewport(action, 1024, 768)
      await action.click()
      await expect(action).toHaveAttribute('aria-current', 'step')
    }

    await expectInsideViewport(page.getByRole('button', { name: 'Tidy' }), 1024, 768)
  })

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('keeps state changes immediate and bounded', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await openBlankBoard(page)
      expect(
        await page.evaluate(
          () => matchMedia('(prefers-reduced-motion: reduce)').matches,
        ),
      ).toBe(true)

      await buildInventories(page)
      await lockInventories(page)
      await seedUser(page, 'Globally paid operator')
      await page.getByRole('button', { name: 'Add monetization' }).click()
      await page.getByRole('button', { name: 'Tidy' }).click()
      await expect(page.getByRole('button', { name: 'Restore freeform' })).toBeVisible()

      const motionOffenders = await page.evaluate(() => {
        const toMilliseconds = (value: string) => {
          const trimmed = value.trim()
          return trimmed.endsWith('ms')
            ? Number.parseFloat(trimmed)
            : Number.parseFloat(trimmed) * 1000
        }
        return Array.from(document.querySelectorAll<HTMLElement>('*'))
          .map((element) => {
            const style = getComputedStyle(element)
            const durations = [
              ...style.transitionDuration.split(','),
              ...style.animationDuration.split(','),
            ]
              .map(toMilliseconds)
              .filter(Number.isFinite)
            return {
              tag: element.tagName.toLowerCase(),
              className: element.className,
              transitionDuration: style.transitionDuration,
              animationDuration: style.animationDuration,
              longestMs: Math.max(0, ...durations),
            }
          })
          .filter((entry) => entry.longestMs > 100)
      })

      expect(
        motionOffenders,
        motionOffenders
          .map(
            (entry) =>
              `${entry.tag}.${entry.className}: transition ${entry.transitionDuration}, animation ${entry.animationDuration}`,
          )
          .join('\n'),
      ).toEqual([])
    })
  })

  test('has no critical or serious axe violations in blank, modal, or assembly states', async ({
    page,
  }) => {
    const expectNoHighImpactViolations = async () => {
      const result = await new AxeBuilder({ page }).analyze()
      const highImpact = result.violations.filter(
        (violation) =>
          violation.impact === 'critical' || violation.impact === 'serious',
      )
      expect(
        highImpact,
        highImpact
          .map(
            (violation) =>
              `${violation.id}: ${violation.help}\n${violation.nodes
                .map((node) => `  ${node.target.join(' ')}: ${node.failureSummary}`)
                .join('\n')}`,
          )
          .join('\n\n'),
      ).toEqual([])
    }

    await openBlankBoard(page)
    await expectNoHighImpactViolations()

    await page.getByRole('button', { name: 'Lock inventories' }).click()
    await expect(page.getByRole('dialog', { name: 'Lock inventories?' })).toBeVisible()
    await expectNoHighImpactViolations()
    await page.getByRole('button', { name: 'Keep editing' }).click()

    await buildInventories(page)
    await lockInventories(page)
    await seedUser(page, 'Globally paid operator')
    await expectNoHighImpactViolations()
  })
})

test.describe('WebKit smoke', () => {
  test.skip(({ browserName }) => browserName !== 'webkit', 'WebKit only')

  test('creates and restores one isolated inventory item', async ({ page }) => {
    await openBlankBoard(page)
    await addInventoryItem(page, 'problem', 'Slow transfers')
    await switchInventory(page, 'user')
    await switchInventory(page, 'problem')
    await expect(
      page.getByRole('article', { name: 'Slow transfers', exact: true }),
    ).toBeVisible()

    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Problems', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('article', { name: 'Slow transfers', exact: true }),
    ).toBeVisible()
  })
})
