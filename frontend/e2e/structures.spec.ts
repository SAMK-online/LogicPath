import { expect, test, type Page } from '@playwright/test'

const REVERSE = `from typing import List, Optional


def reverse_list(head: Optional[ListNode]) -> Optional[ListNode]:
    prev = None
    curr = head
    while curr:
        nxt = curr.next
        curr.next = prev
        prev = curr
        curr = nxt
    return prev
`

const COMPONENTS = `from typing import List


def count_components(n: int, edges: List[List[int]]) -> int:
    adj = [[] for _ in range(n)]
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    visited = set()
    count = 0
    for start in range(n):
        if start in visited:
            continue
        count += 1
        stack = [start]
        visited.add(start)
        while stack:
            node = stack.pop()
            for nb in adj[node]:
                if nb not in visited:
                    visited.add(nb)
                    stack.append(nb)
    return count
`

async function setEditor(page: Page, code: string) {
  await page.waitForFunction(() => (window as any).monaco?.editor.getModels().length > 0)
  await page.evaluate((c) => (window as any).monaco.editor.getModels()[0].setValue(c), code)
}

async function signUp(page: Page) {
  await page.goto('/register')
  await page.getByLabel('Full name').fill('Structures Tester')
  await page.getByLabel('Email address').fill(`struct-${Date.now()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery')
  await page.getByLabel('Confirm password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible()
}

test('linked list: run passes, and the visualizer draws the list being reversed', async ({ page }) => {
  await signUp(page)
  await page.goto('/workspace/reverse-linked-list?roadmap=dsa-fundamentals')
  await expect(page.getByRole('heading', { name: 'Reverse Linked List' })).toBeVisible()
  await setEditor(page, REVERSE)
  await page.getByRole('button', { name: /Run Code/ }).click()
  await expect(page.getByTestId('summary')).toContainText('6/6 passed', { timeout: 120_000 })

  await page.getByRole('tab', { name: 'Visualize' }).click()
  const viz = page.getByTestId('visualizer')
  await expect(viz.getByRole('region', { name: /head \(/ })).toBeVisible() // the input list is drawn from the test data
  await viz.getByRole('tab', { name: 'Step through my code' }).click()
  await viz.getByRole('button', { name: 'Trace my code' }).click()
  await expect(viz.getByTestId('step-counter')).toContainText('Step 1 of', { timeout: 120_000 })
  for (let i = 0; i < 8; i++) await viz.getByRole('button', { name: /Next/ }).click()
  await expect(viz.getByRole('region', { name: /prev \(linked list\)/ })).toBeVisible()
  await expect(viz.getByRole('list', { name: /linked list with/ }).first()).toBeVisible()
})

test('graph: run passes, and the visualizer draws the graph with the node being visited', async ({ page }) => {
  await signUp(page)
  await page.goto('/workspace/number-of-connected-components-in-an-undirected-graph?roadmap=dsa-fundamentals')
  await expect(page.getByRole('heading', { name: /Connected Components/ })).toBeVisible()
  await setEditor(page, COMPONENTS)
  await page.getByRole('button', { name: /Run Code/ }).click()
  await expect(page.getByTestId('summary')).toContainText('9/9 passed', { timeout: 120_000 }) // 7 small tests + 2 large ones

  await page.getByRole('tab', { name: 'Visualize' }).click()
  const viz = page.getByTestId('visualizer')
  await expect(viz.getByTestId('graph-scene')).toBeVisible() // the test case's edges are drawn as a graph
  await viz.getByRole('tab', { name: 'Step through my code' }).click()
  await viz.getByRole('button', { name: 'Trace my code' }).click()
  await expect(viz.getByTestId('step-counter')).toContainText('Step 1 of', { timeout: 120_000 })
  for (let i = 0; i < 30; i++) await viz.getByRole('button', { name: /Next/ }).click()
  await expect(viz.locator('[data-state="visited"], [data-state="current"]').first()).toBeVisible()
})
