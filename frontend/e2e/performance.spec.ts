import { expect, test, type Page } from '@playwright/test'

async function setEditor(page: Page, code: string) {
  await page.waitForFunction(() => (window as any).monaco?.editor.getModels().length > 0)
  await page.waitForTimeout(1000) // let the editor's change listener attach
  await page.evaluate((c) => (window as any).monaco.editor.getModels()[0].setValue(c), code)
}
async function signUp(page: Page) {
  await page.goto('/register')
  await page.getByLabel('Full name').fill('Perf Tester')
  await page.getByLabel('Email address').fill(`perf-${Date.now()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery')
  await page.getByLabel('Confirm password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible()
}

const TWO_SUM_BRUTE = `def two_sum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
`
const TWO_SUM_FAST = `def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
`
const SEARCH_LINEAR = `def search(nums, target):
    for i, x in enumerate(nums):
        if x == target:
            return i
    return -1
`
const SEARCH_FAST = `def search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
`

test('Two Sum: brute force is correct on small tests but stopped by the large one; the optimal solution passes', async ({ page }) => {
  await signUp(page)
  await page.goto('/workspace/two-sum')
  await expect(page.getByRole('heading', { name: 'Two Sum' })).toBeVisible()
  await expect(page.getByTestId('perf-note')).toContainText('every one has a time limit')

  await setEditor(page, TWO_SUM_BRUTE)
  await page.getByRole('button', { name: /Run Code/ }).click()
  // The run is killed after 8 s; everything that finished is still shown, and the stuck test is named.
  await expect(page.getByTestId('speed-nudge')).toBeVisible({ timeout: 150_000 })
  await expect(page.getByTestId('summary')).toContainText('6/7 passed')
  await expect(page.getByTestId('case-6')).toContainText('Passed')
  const big = page.getByTestId('case-7')
  await expect(big).toContainText('Too slow')
  await expect(big).toContainText('20,000 numbers')
  await expect(big).toContainText('Time limit exceeded')
  await expect(page.getByTestId('speed-nudge')).toContainText('2 <= len(nums) <= 2 * 10**4')
  await expect(page.getByText('Performance tests: inputs as large as the constraints allow')).toBeVisible()

  // The same student fixes the approach; the runtime recovered from the kill.
  await setEditor(page, TWO_SUM_FAST)
  await page.getByRole('button', { name: /Run Code/ }).click()
  await expect(page.getByTestId('summary')).toContainText('7/7 passed', { timeout: 120_000 })
  await expect(page.getByText('All tests passed')).toBeVisible()
  await expect(page.getByTestId('speed-nudge')).toBeHidden()
  const ms = Number(((await page.getByTestId('ms-7').textContent()) ?? '').match(/(\d+) ms/)![1])
  expect(ms).toBeLessThan(500)
})

test('Binary Search: a linear scan is correct but is stopped by the inspection budget', async ({ page }) => {
  await signUp(page)
  await page.goto('/workspace/binary-search')
  await expect(page.getByRole('heading', { name: 'Binary Search' })).toBeVisible()
  await setEditor(page, SEARCH_LINEAR)
  await page.getByRole('button', { name: /Run Code/ }).click()
  await expect(page.getByTestId('speed-nudge')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByTestId('case-9')).toContainText('looked at')
  await expect(page.getByTestId('case-9')).toContainText('allows at most 64')
  await expect(page.getByTestId('case-1')).toContainText('Passed')

  await setEditor(page, SEARCH_FAST)
  await page.getByRole('button', { name: /Run Code/ }).click()
  await expect(page.getByTestId('summary')).toContainText('11/11 passed', { timeout: 120_000 })
})
