import { expect, test, type Page } from '@playwright/test'

const TWO_SUM = `from typing import List


def two_sum(nums: List[int], target: int) -> List[int]:
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
    return []
`

async function setEditor(page: Page, code: string) {
  await page.waitForFunction(() => (window as any).monaco?.editor.getModels().length > 0)
  await page.evaluate((c) => (window as any).monaco.editor.getModels()[0].setValue(c), code)
}

test('custom cases: run, visualize, nothing is recorded', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel('Full name').fill('Custom Tester')
  await page.getByLabel('Email address').fill(`custom-${Date.now()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery')
  await page.getByLabel('Confirm password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible()

  const submissions: string[] = []
  page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/submissions/.test(r.url())) submissions.push(r.url()) })

  await page.goto('/workspace/two-sum?roadmap=dsa-fundamentals')
  await expect(page.getByRole('heading', { name: 'Two Sum' })).toBeVisible()
  await setEditor(page, TWO_SUM)

  await page.getByRole('tab', { name: 'Try your own' }).click()
  const panel = page.getByTestId('custom-cases')
  await expect(panel).toContainText('do not count toward your progress')

  // an invalid entry is explained, not added
  await panel.getByLabel(/nums/).fill('[1, 2')
  await panel.getByLabel(/target/).fill('3')
  await panel.getByRole('button', { name: 'Add case' }).click()
  await expect(panel.getByRole('alert').first()).toBeVisible()
  await expect(panel.getByTestId('custom-1')).toHaveCount(0)

  // an experiment with no expected output shows what the code returns
  await panel.getByLabel(/nums/).fill('[3, 3]')
  await panel.getByLabel(/target/).fill('6')
  await panel.getByRole('button', { name: 'Add case' }).click()
  await panel.getByTestId('custom-1').getByRole('button', { name: 'Run' }).click()
  await expect(panel.getByTestId('custom-1')).toContainText('[0, 1]', { timeout: 120_000 })

  // a case with an expected output is judged
  await panel.getByLabel(/nums/).fill('[1, 5, 9]')
  await panel.getByLabel(/target/).fill('10')
  await panel.getByLabel(/expected output/).fill('[0, 2]')
  await panel.getByRole('button', { name: 'Add case' }).click()
  await panel.getByRole('button', { name: 'Run all' }).click()
  await expect(panel.getByTestId('custom-2')).toContainText('Matches your expected output', { timeout: 60_000 })

  // Visualize opens the case and traces it right away
  await panel.getByTestId('custom-1').getByRole('button', { name: 'Visualize' }).click()
  const viz = page.getByTestId('visualizer')
  await expect(viz.getByTestId('step-counter')).toContainText('Step 1 of', { timeout: 60_000 })
  await expect(viz.getByLabel('Test case')).toHaveValue('-1')

  // none of it was recorded as a submission
  expect(submissions).toEqual([])
})
