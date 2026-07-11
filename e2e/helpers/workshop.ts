import { expect, type Locator, type Page } from '@playwright/test'

export type InventoryKind = 'problem' | 'user' | 'region' | 'monetization'

const inventoryMeta: Record<
  InventoryKind,
  { navigation: string; heading: string; add: string }
> = {
  problem: {
    navigation: 'Problems',
    heading: 'Problems',
    add: 'Add problem',
  },
  user: {
    navigation: 'Users',
    heading: 'Users',
    add: 'Add user',
  },
  region: {
    navigation: 'Regions',
    heading: 'Regions',
    add: 'Add region',
  },
  monetization: {
    navigation: 'Monetization',
    heading: 'Monetization',
    add: 'Add monetization',
  },
}

export type InventoryFixture = {
  problems: string[]
  users: string[]
  regions: string[]
  monetization: string[]
}

export const minimumInventory: InventoryFixture = {
  problems: ['Slow transfers'],
  users: ['Globally paid operator'],
  regions: ['Dubai'],
  monetization: ['Interchange'],
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function openBlankBoard(page: Page) {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Problems', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('application', { name: 'Problems' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add card' })).toBeVisible()
  await expect(page.getByLabel('Archetype assembly canvas')).toHaveCount(0)
  await expect(page.getByLabel('Locked users')).toHaveCount(0)
}

export async function currentGeneration(page: Page) {
  const generation = page.getByText(/^Local generation \d+$/)
  await expect(generation).toBeAttached()
  const text = await generation.textContent()
  const value = Number(text?.match(/\d+$/)?.[0])
  if (!Number.isFinite(value)) throw new Error(`Invalid local generation: ${text}`)
  return value
}

export async function expectSaved(page: Page, previousGeneration?: number) {
  if (previousGeneration !== undefined) {
    await expect
      .poll(() => currentGeneration(page), {
        message: `Expected local generation to advance past ${previousGeneration}`,
      })
      .toBeGreaterThan(previousGeneration)
  }
  await expect(page.locator('.save-state')).toContainText('Saved locally')
}

export async function switchInventory(page: Page, kind: InventoryKind) {
  const meta = inventoryMeta[kind]
  await page.getByRole('button', { name: meta.navigation, exact: true }).click()
  await expect(
    page.getByRole('heading', { name: meta.heading, exact: true }),
  ).toBeVisible()
}

export async function addInventoryItem(
  page: Page,
  kind: InventoryKind,
  title: string,
  note = '',
) {
  await switchInventory(page, kind)
  await page.getByRole('button', { name: 'Add card' }).click()

  const dialog = page.getByRole('dialog', {
    name: new RegExp(`^${escapeRegExp(inventoryMeta[kind].add)}$`, 'i'),
  })
  await dialog.getByRole('textbox', { name: 'Title' }).fill(title)
  if (note) await dialog.getByRole('textbox', { name: 'Optional note' }).fill(note)
  const generation = await currentGeneration(page)
  await dialog.getByRole('button', { name: inventoryMeta[kind].add }).click()

  await expect(page.getByRole('article', { name: title, exact: true })).toBeVisible()
  await expectSaved(page, generation)
}

export async function buildInventories(
  page: Page,
  fixture: InventoryFixture = minimumInventory,
) {
  for (const title of fixture.problems) {
    await addInventoryItem(page, 'problem', title)
  }
  for (const title of fixture.users) {
    await addInventoryItem(page, 'user', title)
  }
  for (const title of fixture.regions) {
    await addInventoryItem(page, 'region', title)
  }
  for (const title of fixture.monetization) {
    await addInventoryItem(page, 'monetization', title)
  }
}

export async function groupInventoryItems(page: Page, titles: string[]) {
  for (const [index, title] of titles.entries()) {
    await page
      .getByRole('article', { name: title, exact: true })
      .click({ modifiers: index === 0 ? [] : ['Shift'] })
  }

  const group = page.getByRole('button', { name: 'Group selected cards' })
  await expect(group).toBeEnabled()
  const generation = await currentGeneration(page)
  await group.click()
  await expect(
    page.getByLabel(`New category, category with ${titles.length} items`),
  ).toBeVisible()
  await expectSaved(page, generation)
}

export async function lockInventories(page: Page) {
  await page.getByRole('button', { name: 'Lock inventories' }).click()
  const dialog = page.getByRole('dialog', { name: 'Lock inventories?' })
  const confirm = dialog.getByRole('button', { name: 'Lock and build' })
  const emptyAcknowledgement = dialog.getByRole('checkbox', {
    name: /one or more inventories are empty/i,
  })
  const uncategorizedAcknowledgement = dialog.getByRole('checkbox', {
    name: /reviewed the uncategorised items/i,
  })

  if ((await emptyAcknowledgement.count()) > 0) {
    await expect(confirm).toBeDisabled()
    await emptyAcknowledgement.check()
  }
  if ((await uncategorizedAcknowledgement.count()) > 0) {
    await expect(confirm).toBeDisabled()
    await uncategorizedAcknowledgement.check()
  }

  await expect(confirm).toBeEnabled()
  const generation = await currentGeneration(page)
  await confirm.click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()
  await expect(page.getByLabel('Locked users')).toBeVisible()
  await expectSaved(page, generation)
}

export function sourceButton(page: Page, title: string) {
  return page.getByRole('button', {
    name: new RegExp(`^${escapeRegExp(title)}\\. Press Enter to add`),
  })
}

export async function dragSourceToCanvas(page: Page, title: string) {
  const source = sourceButton(page, title)
  const canvas = page.getByRole('application', {
    name: 'Archetype assembly canvas',
  })
  await expect(source).toBeVisible()
  await expect(canvas).toBeVisible()

  const sourceBox = await source.boundingBox()
  const canvasBox = await canvas.boundingBox()
  if (!sourceBox || !canvasBox) {
    throw new Error('Expected source and assembly canvas bounding boxes')
  }

  const start = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  }
  const drop = {
    x: canvasBox.x + canvasBox.width * 0.72,
    y: canvasBox.y + canvasBox.height * 0.45,
  }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  try {
    await page.mouse.move(start.x + 8, start.y + 8, { steps: 4 })
    await expect(source).toHaveAttribute('data-dragging', 'true')
    await page.mouse.move(drop.x, drop.y, { steps: 16 })
  } finally {
    await page.mouse.up()
  }

  return drop
}

export function userIsland(page: Page, title: string) {
  return page.getByRole('article', {
    name: `${title}, user archetype`,
    exact: true,
  })
}

export function localCopy(
  island: Locator,
  title: string,
  kind: Exclude<InventoryKind, 'user'>,
) {
  return island.getByLabel(
    `${title}. Local ${inventoryMeta[kind].navigation.toLowerCase().replace(/s$/, '')} copy.`,
    { exact: true },
  )
}

export async function seedUser(page: Page, title: string) {
  const generation = await currentGeneration(page)
  await sourceButton(page, title).click()
  await expect(userIsland(page, title)).toBeVisible()
  await expectSaved(page, generation)
}

export async function continueTo(
  page: Page,
  kind: 'problems' | 'regions' | 'monetization',
) {
  await page.getByRole('button', { name: `Next: ${kind}` }).click()
  await expect(page.getByRole('heading', { name: `Add ${kind}` })).toBeVisible()
}

export async function addSourceToIsland(
  page: Page,
  sourceTitle: string,
  islandTitle: string,
) {
  await sourceButton(page, sourceTitle).click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', { name: `Add “${sourceTitle}”` }),
  ).toBeVisible()
  const generation = await currentGeneration(page)
  await dialog.getByRole('button', { name: islandTitle, exact: true }).click()
  await expectSaved(page, generation)
}

export async function islandNodeTransform(island: Locator) {
  return island.evaluate((element) => {
    const node = element.closest<HTMLElement>('.react-flow__node')
    if (!node) throw new Error('User island is missing its React Flow node')
    return node.style.transform
  })
}

export async function islandHeaderCenter(island: Locator) {
  const box = await island.locator('.island-core').boundingBox()
  if (!box) throw new Error('Expected a rendered island header')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

export async function islandMembership(island: Locator) {
  return island
    .locator('[aria-label*=". Local "][aria-label$=" copy."]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('aria-label')).sort(),
    )
}

export async function expectInsideViewport(
  locator: Locator,
  width: number,
  height: number,
) {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, 'Expected a rendered bounding box').not.toBeNull()
  if (!box) return
  const name = (await locator.getAttribute('aria-label')) ?? (await locator.innerText())
  expect(box.x, `${name} left edge`).toBeGreaterThanOrEqual(0)
  expect(box.y, `${name} top edge`).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, `${name} right edge`).toBeLessThanOrEqual(width)
  expect(box.y + box.height, `${name} bottom edge`).toBeLessThanOrEqual(height)
}

export async function expectAllContainedWithin(container: Locator, elements: Locator) {
  await expect
    .poll(
      async () => {
        const containerBox = await container.boundingBox()
        if (!containerBox) return [{ issue: 'Missing container bounding box' }]

        const boxes = await elements.evaluateAll((nodes) =>
          nodes.map((node) => {
            const rect = node.getBoundingClientRect()
            return {
              name: node.getAttribute('aria-label') ?? node.textContent ?? 'island',
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
            }
          }),
        )

        return boxes.filter(
          (box) =>
            box.left < containerBox.x - 1 ||
            box.top < containerBox.y - 1 ||
            box.right > containerBox.x + containerBox.width + 1 ||
            box.bottom > containerBox.y + containerBox.height + 1,
        )
      },
      { message: 'Expected every island bounding box inside the canvas viewport' },
    )
    .toEqual([])
}
