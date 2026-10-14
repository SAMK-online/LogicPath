import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ContainerScroll } from '../components/ContainerScroll'
import { Logo, Wordmark } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'

const STEPS = [
  ['Read the problem', 'Each one has examples, constraints and a function signature to fill in.'],
  ['Write and run', 'Python runs in your browser against test cases. A failing test shows the input, what you returned and what was expected.'],
  ['Ask, or ask for a hint', 'The tutor reads your current code. It answers with a question, not with the solution.'],
  ['Revise', 'Change the code, run it again, and keep going until every test passes.'],
] as const

const HINTS = [
  ['A question about the core idea of the problem', 'What does the function have to decide for each element?'],
  ['A prompt to check assumptions and edge cases', 'What happens with an empty list, or with duplicates?'],
  ['A pointer at part of your own code', 'Trace line 4 with the input [3, 3]. What does it return?'],
  ['The name of a useful concept', 'A structure that answers “have I seen this?” in one step.'],
  ['A specific hint on applying it', 'Still no code and no full algorithm.'],
] as const

const ROADMAPS = [
  { id: 'python-foundations', title: 'Python Foundations', level: 'Beginner', ready: '12 of 12 problems', text: 'Variables, conditions, loops, functions, strings and lists, taught through small problems.' },
  { id: 'dsa-fundamentals', title: 'DSA Fundamentals', level: 'Intermediate', ready: '17 of 17 problems', text: 'Searching, hashing, windows, recursion, linked lists, trees and graphs, with attention to correctness and complexity.' },
  { id: 'blind-75', title: 'Blind 75', level: 'Advanced', ready: '14 of 75 problems', text: 'The well-known interview list. The full list is shown, and the problems that are not built yet are marked coming soon.' },
] as const

const LIMITS = [
  ['Python only.', 'Other languages are not supported.'],
  ['The tutor is an AI model.', 'It can be wrong. Your tests are the source of truth, so treat its questions as prompts to think, not as verdicts.'],
  ['Blind 75 is partly built.', 'Fourteen of the 75 problems are available today.'],
  ['The first run is slower.', 'Your browser downloads the Python runtime once, which takes a few seconds. After that it is cached.'],
  ['Not every problem has speed tests.', 'Five beginner problems are constant or linear by nature, so they only check correctness.'],
] as const

/** True once the element has scrolled into view (or when IntersectionObserver is unavailable). */
function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setSeen(true); io.disconnect() } }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return [ref, seen] as const
}

const HEADLINE = 'A tutor that builds your instinct instead of giving answers'
const kw = 'text-[#e3a98a]', num = 'text-[#a9c4e4]'

function SessionExample() {
  return (
    <figure className="rise overflow-hidden rounded-lg border border-white/10 bg-[#0d1b2e] shadow-raise" style={{ '--d': '500ms' } as React.CSSProperties} aria-label="Example session on the Two Sum problem">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-xs text-white/55 xl:px-6 xl:py-3.5 xl:text-sm">
        <span className="font-mono">two_sum.py</span>
        <span>Example session</span>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6 text-white/90 xl:px-6 xl:py-6 xl:text-base xl:leading-8" tabIndex={0}>
        <code>
          {[
            <><span className={kw}>def</span> two_sum(nums, target):</>,
            <>{'    '}<span className={kw}>for</span> i <span className={kw}>in</span> range(len(nums)):</>,
            <>{'        '}<span className={kw}>for</span> j <span className={kw}>in</span> range(i + <span className={num}>1</span>, len(nums)):</>,
            <>{'            '}<span className={kw}>if</span> nums[i] + nums[j] == target:</>,
            <>{'                '}<span className={kw}>return</span> [i, j]</>,
          ].map((line, i) => <span key={i} className="rise block" style={{ '--d': `${900 + i * 130}ms` } as React.CSSProperties}>{line}</span>)}
        </code>
      </pre>
      <div className="rise border-t border-white/10 px-4 py-3 text-sm xl:px-6 xl:py-5 xl:text-base" style={{ '--d': '1700ms' } as React.CSSProperties}>
        <p className="font-medium text-white">6 of 7 tests passed</p>
        <ul className="mt-2 space-y-1 text-[13px] text-white/70 xl:text-[15px]">
          <li>Six small cases pass.</li>
          <li className="flag -mx-1 rounded px-1" style={{ '--d': '2100ms' } as React.CSSProperties}><span className="text-[#f2b8ae]">Too slow</span> on the large input test: took 4.1 s, the limit is 1 s.</li>
        </ul>
      </div>
      <figcaption className="rise relative border-t border-copper/40 bg-[#14263d] px-4 py-4 xl:px-6 xl:py-6" style={{ '--d': '2600ms' } as React.CSSProperties}>
        <span aria-hidden className="rule-draw absolute inset-y-0 left-0 w-0.5 bg-copper" style={{ '--d': '2600ms' } as React.CSSProperties} />
        <p className="text-xs text-copper-100 xl:text-sm">Tutor</p>
        <p className="tutor-voice mt-1 italic text-white xl:text-xl xl:leading-8">
          Your logic holds on every small case. The last test uses a large input. For a single number, how many others does your loop have to look at?
        </p>
      </figcaption>
    </figure>
  )
}

export function LandingPage() {
  const { user } = useAuth()
  const [hintsRef, hintsSeen] = useInView<HTMLOListElement>()
  return (
    <div className="min-h-screen bg-surface text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-[88rem] 2xl:max-w-[100rem] items-center justify-between px-4 sm:px-6 xl:px-10">
          <Link to="/" aria-label="LogicPath" className="flex items-center gap-2.5 font-display text-[17px] font-semibold tracking-tight"><Logo size={34} /><Wordmark className="hidden whitespace-nowrap sm:inline" /></Link>
          <nav aria-label="Page" className="hidden items-center gap-6 text-sm text-slate-muted md:flex">
            <a className="hover:text-ink" href="#how">How it works</a>
            <a className="hover:text-ink" href="#roadmaps">Roadmaps</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? <Link className="btn-primary" to="/dashboard">Open dashboard</Link> : <>
              <Link className="btn-ghost" to="/login">Log in</Link>
              <Link className="btn-primary" to="/register">Create account</Link>
            </>}
          </div>
        </div>
      </header>

      <main id="main">
        <section className="bg-navy text-white">
          <div className="mx-auto grid max-w-[88rem] 2xl:max-w-[100rem] items-center gap-12 px-4 py-16 sm:px-6 xl:px-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:py-24 xl:py-32">
            <div>
              <h1 className="font-display text-4xl font-semibold leading-[1.1] sm:text-5xl xl:text-6xl 2xl:text-7xl">
                {HEADLINE.split(' ').map((w, i) => <span key={i}><span className="reveal-word" style={{ '--i': i } as React.CSSProperties}>{w}</span>{' '}</span>)}
              </h1>
              <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-white/75 xl:mt-8 xl:max-w-[42rem] xl:text-xl 2xl:text-2xl">
                Practise Python and data structures in your browser. When you are stuck, the tutor reads your code and asks the question that moves you forward. It does not write your solution.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                {user ? <Link className="btn-accent !px-5 !py-2.5 !text-base" to="/dashboard">Open dashboard</Link> : <>
                  <Link className="btn-accent !px-5 !py-2.5 !text-base xl:!px-7 xl:!py-3.5 xl:!text-lg" to="/register">Create an account</Link>
                  <Link className="btn !border !border-white/25 !px-5 !py-2.5 !text-base xl:!px-7 xl:!py-3.5 xl:!text-lg text-white hover:bg-white/10" to="/login">Log in</Link>
                </>}
              </div>
              <p className="mt-6 text-sm text-white/55 xl:text-base">Python only. Your code runs in your browser.</p>
            </div>
            <SessionExample />
          </div>
        </section>

        <section aria-labelledby="workspace-heading" className="overflow-hidden bg-paper">
          <ContainerScroll
            titleComponent={
              <>
                <h2 id="workspace-heading" className="font-display text-3xl font-semibold sm:text-5xl xl:text-6xl">Your code, the tests and the tutor in one workspace</h2>
                <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-slate-muted xl:max-w-3xl xl:text-xl">Write Python on the left, see every test result under it, and ask the tutor on the right. The visualizer steps through your own code.</p>
              </>
            }
          >
            <img src="/workspace-preview.jpg" alt="The LogicPath workspace: the problem on the left, a code editor with its test results below it, and the tutor panel on the right" width={1600} height={1000}
              className="mx-auto h-full w-full rounded-xl object-cover object-left-top" draggable={false} loading="lazy" />
          </ContainerScroll>
        </section>

        <section id="how" className="mx-auto max-w-[88rem] 2xl:max-w-[100rem] scroll-mt-4 px-4 py-20 sm:px-6 xl:px-10">
          <h2 className="max-w-xl font-display text-3xl font-semibold xl:text-4xl">How a session works</h2>
          <ol className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([h, p], i) => (
              <li key={h} className="border-t-2 border-copper pt-4">
                <p className="text-sm tabular-nums text-slate-muted">Step {i + 1}</p>
                <h3 className="mt-1 font-display text-lg font-semibold xl:text-xl">{h}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-muted xl:text-base">{p}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y border-line bg-paper">
          <div className="mx-auto grid max-w-[88rem] 2xl:max-w-[100rem] gap-12 px-4 py-20 sm:px-6 xl:px-10 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl font-semibold xl:text-4xl">Hints start small and get more specific</h2>
              <p className="mt-4 max-w-md leading-relaxed text-slate-muted xl:max-w-xl xl:text-lg">
                Each time you ask for a hint, the level goes up by one. The tutor is told the level and is not allowed to go beyond it. You choose how much help you want.
              </p>
              <p className="mt-6 max-w-md leading-relaxed text-slate-muted xl:max-w-xl xl:text-lg">
                There is also a visualizer. Pick a test case and step through your code line by line, watching variables, lists and dictionaries change.
              </p>
            </div>
            <ol ref={hintsRef} className="divide-y divide-line border-y border-line bg-surface">
              {HINTS.map(([h, ex], i) => (
                <li key={h} className="flex gap-4 px-4 py-4">
                  <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-medium tabular-nums transition-colors duration-500 motion-reduce:transition-none ${hintsSeen ? 'border-copper bg-copper text-white' : 'border-line bg-surface text-slate-muted'}`} style={{ transitionDelay: `${i * 220}ms` }} aria-label={`Level ${i + 1}`}>{i + 1}</span>
                  <div>
                    <p className="font-medium xl:text-lg">{h}</p>
                    <p className="tutor-voice mt-0.5 italic text-slate-muted xl:text-xl">{ex}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid max-w-[88rem] 2xl:max-w-[100rem] gap-12 px-4 py-20 sm:px-6 xl:px-10 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="font-display text-3xl font-semibold xl:text-4xl">Tests that stop brute force from passing</h2>
            <p className="mt-4 max-w-lg leading-relaxed text-slate-muted xl:max-w-2xl xl:text-lg">
              Most problems with a meaningful speed difference include tests at the largest size the constraints allow, each with a time limit. A nested loop that is correct on small inputs passes the first tests and fails the large one. The result says which input failed and how long it took. It does not tell you the faster method.
            </p>
            <p className="mt-4 max-w-lg leading-relaxed text-slate-muted xl:max-w-2xl xl:text-lg">
              That applies to 20 of the 29 problems that exist today. Binary Search is checked differently: it counts how many items your code looks at, because a linear scan is still fast on a million numbers.
            </p>
          </div>
          <table className="w-full border-y border-line text-left text-sm xl:text-base">
            <caption className="pb-2 text-left text-sm text-slate-muted">Two Sum, before and after a rewrite (example)</caption>
            <thead className="text-slate-muted"><tr className="border-b border-line"><th className="py-2 pr-4 font-medium">Test</th><th className="py-2 pr-4 font-medium">First attempt</th><th className="py-2 font-medium">Second attempt</th></tr></thead>
            <tbody className="divide-y divide-line">
              {[['Small cases (6)', 'Pass', 'Pass'], ['Large input test, limit 1 s', 'Too slow, 4.1 s', 'Pass, under 0.1 s']].map(([t, a, b]) => (
                <tr key={t}><td className="py-3 pr-4">{t}</td><td className={`py-3 pr-4 ${a.startsWith('Too') ? 'font-medium text-bad' : ''}`}>{a}</td><td className="py-3 font-medium text-ok">{b}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section id="roadmaps" className="scroll-mt-4 border-y border-line bg-paper">
          <div className="mx-auto max-w-[88rem] 2xl:max-w-[100rem] px-4 py-20 sm:px-6 xl:px-10">
            <h2 className="font-display text-3xl font-semibold xl:text-4xl">Three roadmaps</h2>
            <ul className="mt-8 divide-y divide-line border-y border-line bg-surface">
              {ROADMAPS.map((r) => (
                <li key={r.id} className="grid gap-2 px-4 py-5 sm:grid-cols-[14rem_minmax(0,1fr)_9rem] sm:items-baseline sm:gap-6">
                  <div>
                    <h3 className="font-display text-lg font-semibold">{r.title}</h3>
                    <p className="text-sm text-slate-muted">{r.level}</p>
                  </div>
                  <p className="leading-relaxed text-slate-muted xl:text-lg">{r.text}</p>
                  <p className="text-sm tabular-nums sm:text-right xl:text-base">{r.ready}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="limits" className="mx-auto grid max-w-[88rem] 2xl:max-w-[100rem] scroll-mt-4 gap-10 px-4 py-20 sm:px-6 xl:px-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <h2 className="font-display text-3xl font-semibold xl:text-4xl">What to know before you start</h2>
          <dl className="space-y-5">
            {LIMITS.map(([t, d]) => (
              <div key={t}>
                <dt className="font-medium xl:text-lg">{t}</dt>
                <dd className="mt-0.5 leading-relaxed text-slate-muted xl:text-lg">{d}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="bg-navy text-white">
          <div className="mx-auto flex max-w-[88rem] 2xl:max-w-[100rem] flex-wrap items-center justify-between gap-6 px-4 py-14 sm:px-6 xl:px-10">
            <h2 className="max-w-lg font-display text-2xl font-semibold xl:max-w-2xl xl:text-3xl">Make an account and open your first problem</h2>
            <div className="flex gap-3">
              {user ? <Link className="btn-accent !px-5 !py-2.5" to="/dashboard">Open dashboard</Link> : <>
                <Link className="btn-accent !px-5 !py-2.5" to="/register">Create account</Link>
                <Link className="btn !border !border-white/25 !px-5 !py-2.5 text-white hover:bg-white/10" to="/login">Log in</Link>
              </>}
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-line bg-surface py-6 text-center text-sm text-slate-muted"><Wordmark /></footer>
    </div>
  )
}
