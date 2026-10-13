import { expect, test, type Page } from '@playwright/test'

const BINARY_SEARCH = `from typing import List


def search(nums: List[int], target: int) -> int:
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

async function setEditor(page: Page, code: string) {
  await page.waitForFunction(() => (window as any).monaco?.editor.getModels().length > 0)
  await page.evaluate((c) => (window as any).monaco.editor.getModels()[0].setValue(c), code)
}

async function signUp(page: Page) {
  await page.goto('/register')
  await page.getByLabel('Full name').fill('Viz Tester')
  await page.getByLabel('Email address').fill(`viz-${Date.now()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery')
  await page.getByLabel('Confirm password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible()
}

test('visualize: test case view → trace stepping with editor highlight → AI view → looping code', async ({ page }) => {
  await signUp(page)
  await page.goto('/workspace/binary-search?roadmap=dsa-fundamentals')
  await expect(page.getByRole('heading', { name: 'Binary Search' })).toBeVisible()
  await setEditor(page, BINARY_SEARCH)

  // Part 1: the test case is drawn straight from the test data
  await page.getByRole('tab', { name: 'Visualize' }).click()
  const viz = page.getByTestId('visualizer')
  await expect(viz.getByRole('region', { name: 'nums (array)' })).toBeVisible()
  await expect(viz.getByLabel('index 5: 12')).toBeVisible()
  await expect(viz.getByRole('region', { name: 'expected (value)' })).toContainText('4')
  await viz.getByLabel('Test case').selectOption('2') // target 2 is not in the list: expected -1
  await expect(viz.getByRole('region', { name: 'target (value)' })).toContainText('2')
  await expect(viz.getByRole('region', { name: 'expected (value)' })).toContainText('-1')

  // Part 2: trace the student's own code on test #1
  await viz.getByLabel('Test case').selectOption('1')
  await viz.getByRole('tab', { name: 'Step through my code' }).click()
  await viz.getByRole('button', { name: 'Trace my code' }).click()
  await expect(viz.getByTestId('step-counter')).toContainText('Step 1 of', { timeout: 120_000 })
  await expect(page.locator('.trace-line').first()).toBeVisible() // current line is highlighted in Monaco
  const firstTotal = Number(((await viz.getByTestId('step-counter').textContent()) ?? '').match(/of (\d+)/)![1])
  expect(firstTotal).toBeGreaterThan(5)

  // step to where lo/hi/mid exist; pointers are drawn under the array
  for (let i = 0; i < 6; i++) await viz.getByRole('button', { name: /Next/ }).click()
  await expect(viz.getByTestId('var-mid')).toBeVisible()
  await expect(viz.getByText(/▲ .*mid/).first()).toBeVisible()
  await expect(viz.getByRole('slider', { name: 'Step' })).toHaveAttribute('max', String(firstTotal - 1))

  // jump to the end: the result is shown
  await viz.getByRole('slider', { name: 'Step' }).fill(String(firstTotal - 1))
  await expect(viz.getByTestId('trace-end')).toContainText('returned 4')

  // Part 3: AI view (mock provider in e2e) adds captions and a clearly-labelled mock note
  await viz.getByRole('button', { name: /AI view/ }).click()
  await expect(viz.getByRole('note')).toContainText('not from an AI model')
  await viz.getByRole('button', { name: 'First step' }).click()
  await expect(viz.getByTestId('caption')).toContainText('(mock)')
  // repeating is served from the cache
  await viz.getByRole('button', { name: /AI view/ }).click()
  await expect(viz.getByText(/Loaded a saved view/)).toBeVisible()

  // Looping code: truncated quickly, not hung; steps up to that point are still viewable
  await setEditor(page, 'def search(nums, target):\n    while True:\n        pass\n')
  await viz.getByRole('button', { name: /Trace/ }).click()
  await expect(viz.getByRole('alert')).toContainText('Trace stopped after 500 steps', { timeout: 30_000 })
  await expect(viz.getByTestId('step-counter')).toContainText('of 500')

  // Syntax errors are reported
  await setEditor(page, 'def search(nums target):\n    pass')
  await viz.getByRole('button', { name: /Trace/ }).click()
  await expect(viz.getByRole('alert')).toContainText('SyntaxError')

  // The normal results tab still works afterwards
  await page.getByRole('tab', { name: 'Test results' }).click()
  await setEditor(page, BINARY_SEARCH)
  await page.getByRole('button', { name: /Run Code/ }).click()
  await expect(page.getByTestId('summary')).toContainText('11/11 passed')
})
