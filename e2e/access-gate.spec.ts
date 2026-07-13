import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { requiredAccessPassword } from './helpers/workshop'

test.describe('workshop access gate', () => {
  test('rejects a wrong password, unlocks visibly, and survives reload', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-smoke', 'Single WebKit proof')

    const runtimeErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text())
    })
    page.on('pageerror', (error) => runtimeErrors.push(error.message))

    await page.goto('/')

    const gate = page.getByRole('heading', {
      name: 'Plasma One User Map',
      exact: true,
    })
    const password = page.getByLabel('Password')
    await expect(gate).toBeVisible()
    await expect(password).toBeFocused()
    await expect(page.getByRole('button', { name: 'Add card' })).toHaveCount(0)

    const accessibility = await new AxeBuilder({ page }).analyze()
    const highImpactViolations = accessibility.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    )
    expect(highImpactViolations).toEqual([])

    await password.fill('not the password')
    await page.getByRole('button', { name: 'Open workshop' }).click()

    await expect(page.getByRole('alert')).toHaveText('Incorrect password.')
    await expect(password).toHaveValue('')
    await expect(password).toBeFocused()
    await expect(gate).toBeVisible()

    await password.fill(requiredAccessPassword())
    await page.getByRole('button', { name: 'Open workshop' }).click()

    await expect(gate).toBeHidden()
    await expect(
      page.getByRole('heading', { name: 'Problems', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add card' })).toBeVisible()

    await page.reload()

    await expect(gate).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'Problems', exact: true }),
    ).toBeVisible()
    expect(runtimeErrors).toEqual([])
  })
})
