import { expect, test, type Locator } from '@playwright/test'

import {
  addInventoryItem,
  addSourceToIsland,
  buildInventories,
  continueTo,
  currentGeneration,
  expectSaved,
  lockInventories,
  minimumInventory,
  openBlankBoard,
  seedUser,
  userIsland,
} from './helpers/workshop'

async function expectNoIntersection(first: Locator, second: Locator) {
  await expect
    .poll(async () => {
      const firstBox = await first.boundingBox()
      const secondBox = await second.boundingBox()
      if (!firstBox || !secondBox) return false
      return (
        firstBox.x + firstBox.width <= secondBox.x + 1 ||
        secondBox.x + secondBox.width <= firstBox.x + 1 ||
        firstBox.y + firstBox.height <= secondBox.y + 1 ||
        secondBox.y + secondBox.height <= firstBox.y + 1
      )
    })
    .toBe(true)
}

test.describe('effectiveness study fixes', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium coverage')
  test.setTimeout(120_000)

  test('captures repeatedly and keeps dense category Actions reachable', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-compact', 'Compact viewport only')
    await openBlankBoard(page)
    await page.getByRole('button', { name: 'Add card' }).click()

    const dialog = page.getByRole('dialog', { name: 'Add problem' })
    const title = dialog.getByRole('textbox', { name: 'Title' })
    const note = dialog.getByRole('textbox', { name: 'Optional note' })
    const problemTitles = Array.from(
      { length: 6 },
      (_, index) => `Dense capture problem ${index + 1}`,
    )

    for (const [index, problemTitle] of problemTitles.entries()) {
      await title.fill(problemTitle)
      await note.fill(`Facilitator context ${index + 1}. `.repeat(18))
      const generation = await currentGeneration(page)
      if (index === problemTitles.length - 1) {
        await dialog.getByRole('button', { name: 'Add problem' }).click()
      } else {
        await dialog.getByRole('button', { name: 'Save and add another' }).click()
        await expect(title).toHaveValue('')
        await expect(note).toHaveValue('')
        await expect(title).toBeFocused()
      }
      await expectSaved(page, generation)
    }

    await expect(dialog).toBeHidden()
    const boxes = await Promise.all(
      problemTitles.map((problemTitle) =>
        page.getByRole('article', { name: problemTitle, exact: true }).boundingBox(),
      ),
    )
    expect(new Set(boxes.map((box) => `${box?.x}:${box?.y}`)).size).toBe(
      problemTitles.length,
    )

    const categoryGeneration = await currentGeneration(page)
    await page.getByRole('button', { name: 'New category' }).click()
    await expectSaved(page, categoryGeneration)
    const emptyCategory = page.getByLabel('New category, category with 0 items')
    await expect(emptyCategory).toBeVisible()

    const containedCard = page.getByRole('article', {
      name: problemTitles[0],
      exact: true,
    })
    await containedCard.focus()
    await page.keyboard.press('Shift+F10')
    await page.getByRole('menuitem', { name: 'Move to category…' }).click()
    await page
      .getByRole('dialog', { name: 'Move to category' })
      .getByRole('button', { name: 'New category' })
      .click()

    const category = page.getByLabel('New category, category with 1 item')
    await expect(category).toBeVisible()
    expect((await category.boundingBox())?.height ?? 0).toBeGreaterThan(200)
    await category.getByRole('button', { name: 'Actions for New category' }).click()
    await expect(
      page.getByRole('menu', { name: 'Actions for New category' }),
    ).toBeVisible()
    await page.keyboard.press('Escape')

    const headerNode = category.locator('xpath=..')
    const headerId = await headerNode.getAttribute('data-id')
    if (!headerId?.startsWith('category-header:')) {
      throw new Error('Category header node did not expose its category id')
    }
    const categoryId = headerId.slice('category-header:'.length)
    const bodyNode = page.locator(`.react-flow__node[data-id="${categoryId}"]`)
    const dragHandle = category.locator('.category-node-header-raised')
    const initialHeader = await category.boundingBox()
    const initialBody = await bodyNode.boundingBox()
    const initialCard = await containedCard.boundingBox()
    const handleBox = await dragHandle.boundingBox()
    if (!initialHeader || !initialBody || !initialCard || !handleBox) {
      throw new Error('Category drag fixture was not measurable')
    }

    const dragGeneration = await currentGeneration(page)
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 + 84,
      handleBox.y + handleBox.height / 2 + 62,
      { steps: 12 },
    )
    await page.mouse.up()
    await expectSaved(page, dragGeneration)

    const movedHeader = await category.boundingBox()
    const movedBody = await bodyNode.boundingBox()
    const movedCard = await containedCard.boundingBox()
    if (!movedHeader || !movedBody || !movedCard) {
      throw new Error('Dragged category fixture was not measurable')
    }
    const headerDelta = {
      x: movedHeader.x - initialHeader.x,
      y: movedHeader.y - initialHeader.y,
    }
    const bodyDelta = {
      x: movedBody.x - initialBody.x,
      y: movedBody.y - initialBody.y,
    }
    const cardDelta = {
      x: movedCard.x - initialCard.x,
      y: movedCard.y - initialCard.y,
    }
    expect(Math.hypot(headerDelta.x, headerDelta.y)).toBeGreaterThan(40)
    expect(Math.abs(headerDelta.x - bodyDelta.x)).toBeLessThan(3)
    expect(Math.abs(headerDelta.y - bodyDelta.y)).toBeLessThan(3)
    expect(Math.abs(headerDelta.x - cardDelta.x)).toBeLessThan(3)
    expect(Math.abs(headerDelta.y - cardDelta.y)).toBeLessThan(3)

    const undoGeneration = await currentGeneration(page)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expectSaved(page, undoGeneration)
    await expect
      .poll(async () => {
        const box = await bodyNode.boundingBox()
        return box
          ? Math.abs(box.x - initialBody.x) < 3 && Math.abs(box.y - initialBody.y) < 3
          : false
      })
      .toBe(true)
    await page.reload()
    await expect
      .poll(async () => {
        const box = await bodyNode.boundingBox()
        return box
          ? Math.abs(box.x - initialBody.x) < 3 && Math.abs(box.y - initialBody.y) < 3
          : false
      })
      .toBe(true)
  })

  test('opens a saved copy atomically and restores the displaced board', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Desktop viewport only')
    await openBlankBoard(page)
    await addInventoryItem(page, 'problem', 'Portable problem')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save copy' }).click(),
    ])
    const downloadPath = await download.path()
    if (!downloadPath) throw new Error('Save copy did not create a local download')

    await page.getByRole('button', { name: 'New board' }).click()
    await page
      .getByRole('alertdialog', { name: 'Start a new blank board?' })
      .getByRole('button', { name: 'Start new board' })
      .click()
    await expect(
      page.getByRole('article', { name: 'Portable problem', exact: true }),
    ).toHaveCount(0)

    const chooseCopy = async () => {
      const chooserPromise = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: 'Open copy' }).click()
      const chooser = await chooserPromise
      await chooser.setFiles(downloadPath)
    }

    await chooseCopy()
    let preview = page.getByRole('dialog', { name: 'Open saved copy?' })
    await expect(preview.getByText('1 Problems')).toBeVisible()
    await preview.getByRole('button', { name: 'Cancel' }).click()
    await expect(
      page.getByRole('article', { name: 'Portable problem', exact: true }),
    ).toHaveCount(0)

    await chooseCopy()
    preview = page.getByRole('dialog', { name: 'Open saved copy?' })
    await preview.getByRole('button', { name: 'Open copy' }).click()
    await expect(
      page.getByRole('article', { name: 'Portable problem', exact: true }),
    ).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole('article', { name: 'Portable problem', exact: true }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'New board' }).click()
    await page
      .getByRole('alertdialog', { name: 'Start a new blank board?' })
      .getByRole('button', { name: 'Restore previous board' })
      .click()
    await expect(
      page.getByRole('article', { name: 'Portable problem', exact: true }),
    ).toHaveCount(0)
  })

  test('compacts Tidy notes and fits around live canvas overlays', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-compact', 'Compact viewport only')
    const users = ['Remote founder', 'Market seller', 'Family sender', 'Traveller']
    const longNote = 'Important comparison detail for the room. '.repeat(22)

    await openBlankBoard(page)
    await addInventoryItem(page, 'problem', 'Long comparison problem', longNote)
    await buildInventories(page, {
      ...minimumInventory,
      problems: [],
      users,
    })
    await lockInventories(page)
    for (const user of users) await seedUser(page, user)
    await continueTo(page, 'problems')
    for (const user of users) {
      await addSourceToIsland(page, 'Long comparison problem', user)
    }
    await continueTo(page, 'regions')
    await continueTo(page, 'monetization')

    const firstIsland = userIsland(page, users[0])
    const note = firstIsland.locator('.copy-note')
    await expect(note).toHaveText(longNote.trim())
    expect(
      await note.evaluate((element) => element.clientHeight === element.scrollHeight),
    ).toBe(true)

    const canvasToolbar = page.getByRole('toolbar', { name: 'Canvas controls' })
    await canvasToolbar.getByRole('button', { name: 'Collapse source shelf' }).click()
    await expect(page.getByRole('button', { name: 'Open source shelf' })).toBeVisible()
    await expect(page.getByText(/^Open locked /)).toHaveCount(0)

    const shelf = page.getByLabel('Locked monetization')
    await canvasToolbar.getByRole('button', { name: 'Open source shelf' }).click()
    await page.getByRole('button', { name: 'Fit board to view' }).click()
    for (const user of users) await expectNoIntersection(userIsland(page, user), shelf)
    await canvasToolbar.getByRole('button', { name: 'Collapse source shelf' }).click()

    await page.getByRole('button', { name: 'Tidy' }).click()
    await expect(page.getByRole('button', { name: 'Restore freeform' })).toBeVisible()
    await expect
      .poll(() =>
        note.evaluate((element) => element.clientHeight < element.scrollHeight),
      )
      .toBe(true)

    const titleBlock = page.locator('.canvas-title-block')
    const toolbar = page.locator('.canvas-toolbar')
    for (const user of users) {
      const island = userIsland(page, user)
      await expectNoIntersection(island, titleBlock)
      await expectNoIntersection(island, toolbar)
    }

    await page.getByRole('button', { name: 'Restore freeform' }).click()
    await expect(page.getByRole('button', { name: 'Tidy' })).toBeVisible()
    await expect(note).toHaveText(longNote.trim())
    expect(
      await note.evaluate((element) => element.clientHeight === element.scrollHeight),
    ).toBe(true)
  })
})
