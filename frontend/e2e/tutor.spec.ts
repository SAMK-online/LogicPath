import { expect, test, type Page } from '@playwright/test'

const TWO_SUM = `from typing import List


def two_sum(nums: List[int], target: int) -> List[int]:
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
`

async function setEditor(page: Page, code: string) {
  // Typing into Monaco fights auto-indent/auto-close, so set the model directly (fires the same onChange).
  await page.waitForFunction(() => (window as any).monaco?.editor.getModels().length > 0)
  await page.evaluate((c) => (window as any).monaco.editor.getModels()[0].setValue(c), code)
}
const editorText = (page: Page) => page.evaluate(() => (window as any).monaco.editor.getModels()[0].getValue() as string)

test('register → roadmap → problem → run → save → ask tutor → refresh → resume → logout', async ({ page }) => {
  const email = `student-${Date.now()}@example.com`

  // Signed out: "/" is the landing page and protected routes redirect to login
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /builds your instinct instead of giving answers/ })).toBeVisible()
  await page.goto('/roadmaps/blind-75')
  await expect(page).toHaveURL(/\/login/)

  // Register
  await page.getByRole('link', { name: 'Create an account' }).click()
  await page.getByLabel('Full name').fill('Grace Hopper')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery')
  await page.getByLabel('Confirm password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()

  // Dashboard shows all three roadmaps
  await expect(page.getByRole('heading', { name: 'Welcome, Grace' })).toBeVisible()
  for (const t of ['Python Foundations', 'DSA Fundamentals', 'Blind 75']) await expect(page.getByRole('listitem', { name: t })).toBeVisible()

  // Roadmap → problem
  await page.getByRole('listitem', { name: 'DSA Fundamentals' }).getByRole('link', { name: 'View' }).click()
  await expect(page.getByRole('heading', { name: '2. Hash maps' })).toBeVisible()
  await page.getByRole('link', { name: /Two Sum/ }).click()
  await expect(page.getByRole('heading', { name: 'Two Sum' })).toBeVisible()
  await expect(page.getByText('Function to implement')).toBeVisible()

  // The starter code fails the tests (and the failure is reported per case)
  await page.getByRole('button', { name: /Run Code/ }).click()
  await expect(page.getByTestId('summary')).toContainText('0/7 passed')
  await expect(page.getByTestId('case-1')).toContainText('Failed')

  // A syntax error is reported, not swallowed
  await setEditor(page, 'def two_sum(nums, target)\n    return []')
  await page.getByRole('button', { name: /Run Code/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'SyntaxError' })).toBeVisible()

  // Infinite loop → timeout → runner recovers
  await setEditor(page, 'def two_sum(nums, target):\n    while True:\n        pass\n')
  await page.getByRole('button', { name: /Run Code/ }).click()
  await expect(page.getByText('Time limit exceeded').first()).toBeVisible({ timeout: 120_000 })
  await setEditor(page, TWO_SUM)
  await page.getByRole('button', { name: /Run Code/ }).click()
  await expect(page.getByTestId('summary')).toContainText('7/7 passed')
  await expect(page.getByText('All tests passed')).toBeVisible()

  // Unsaved-changes indicator + explicit save
  await setEditor(page, TWO_SUM + '\n# my note\n')
  await expect(page.getByTestId('save-status')).toContainText('Unsaved changes')
  await page.getByRole('button', { name: 'Save Code' }).click()
  await expect(page.getByTestId('save-status')).toContainText('All changes saved')

  // Ask the tutor (mock mode is clearly labelled)
  await expect(page.getByText('Development mock mode')).toBeVisible()
  await page.getByLabel('Message the tutor').fill('Why does this work?')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText('not AI')).toBeVisible()
  await page.getByRole('button', { name: /Request Hint/ }).click()
  await expect(page.getByRole('button', { name: /used 1\/5/ })).toBeVisible()

  // Refresh: code and conversation come back
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Two Sum' })).toBeVisible()
  await expect.poll(() => editorText(page).catch(() => '')).toContain('# my note')
  await expect(page.getByText('Why does this work?')).toBeVisible()
  await expect(page.getByTestId('save-status')).toContainText('All changes saved')

  // Progress is reflected on the dashboard
  await page.getByRole('link', { name: '← Roadmap' }).click()
  await page.getByRole('link', { name: '← Dashboard' }).click()
  await expect(page.getByRole('heading', { name: 'Recently attempted' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Two Sum/ })).toBeVisible()
  await expect(page.getByRole('listitem', { name: 'DSA Fundamentals' }).getByRole('link', { name: 'Continue Learning' })).toBeVisible()

  // Logout, and the session is really gone
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/roadmaps/blind-75')
  await expect(page).toHaveURL(/\/login/)
})

test('login with wrong password shows an error; login with right password works', async ({ page, request }) => {
  const email = `login-${Date.now()}@example.com`
  const origin = 'http://localhost:5174'
  const r = await request.post('http://localhost:5174/api/auth/register', {
    headers: { Origin: origin }, data: { name: 'Lin', email, password: 'correct-horse-battery', confirm_password: 'correct-horse-battery' },
  })
  expect(r.status()).toBe(201)
  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('wrong-password-123')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('alert')).toContainText('Incorrect email or password')
  await page.getByLabel('Password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome, Lin' })).toBeVisible()
})
