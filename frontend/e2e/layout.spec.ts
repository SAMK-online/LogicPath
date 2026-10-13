import { expect, test, type Page } from '@playwright/test'

async function signUp(page: Page) {
  await page.goto('/register')
  await page.getByLabel('Full name').fill('Layout Tester')
  await page.getByLabel('Email address').fill(`layout-${Date.now()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery')
  await page.getByLabel('Confirm password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible()
}
const width = async (page: Page, name: string) => (await page.getByRole('region', { name }).boundingBox())!.width

test('panels can be resized by mouse and keyboard, the layout is remembered, and it can be reset', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await signUp(page)
  await page.goto('/workspace/two-sum')
  await expect(page.getByRole('heading', { name: 'Two Sum' })).toBeVisible()

  const before = await width(page, 'Problem')
  const bar = page.getByRole('separator', { name: 'Resize problem panel' })
  const box = (await bar.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 200, { steps: 8 })
  await page.mouse.up()
  const after = await width(page, 'Problem')
  expect(after).toBeGreaterThan(before + 60)

  // keyboard on the tutor splitter
  const tutorBefore = await width(page, 'Tutor')
  await page.getByRole('separator', { name: 'Resize tutor panel' }).focus()
  await page.keyboard.press('Shift+ArrowLeft') // invert: moving the bar left grows the tutor panel
  expect(await width(page, 'Tutor')).toBeGreaterThan(tutorBefore + 40)

  // output panel height
  const outBefore = await page.getByRole('tablist', { name: 'Output' }).boundingBox()
  await page.getByRole('separator', { name: 'Resize output panel' }).focus()
  await page.keyboard.press('Shift+ArrowUp')
  expect((await page.getByRole('tablist', { name: 'Output' }).boundingBox())!.y).toBeLessThan(outBefore!.y - 40)

  // remembered across a reload
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Two Sum' })).toBeVisible()
  expect(Math.abs((await width(page, 'Problem')) - after)).toBeLessThan(3)

  // reset
  await page.getByRole('button', { name: 'Reset layout' }).click()
  expect(Math.abs((await width(page, 'Problem')) - before)).toBeLessThan(3)
})

test('on a phone the workspace uses tabs and the splitters are hidden', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await signUp(page)
  await page.goto('/workspace/two-sum')
  await expect(page.getByRole('tab', { name: 'Code' })).toBeVisible()
  await expect(page.getByRole('separator', { name: 'Resize problem panel' })).toBeHidden()
  await page.getByRole('tab', { name: 'Problem' }).click()
  await expect(page.getByRole('heading', { name: 'Two Sum' })).toBeVisible()
  await page.getByRole('tab', { name: 'Tutor' }).click()
  await expect(page.getByRole('heading', { name: 'Socratic tutor' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false) // no horizontal page scroll
})
