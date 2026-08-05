import './styles.css'
import './exercises/animations.css'

import { createStorage } from './storage'
import { createBeeper } from './audio'
import { renderHome } from './ui/home'
import { renderEditor } from './ui/editor'
import { renderRun } from './ui/run'
import { renderWeight } from './ui/weight'
import { closeSheet } from './ui/sheet'
import { h } from './ui/dom'
import type { AppContext } from './ui/context'
import type { Settings } from './types'

const storage = createStorage()
let settings: Settings = storage.loadSettings()

const ctx: AppContext = {
  storage,
  beeper: createBeeper(() => settings),
  getSettings: () => settings,
  setSettings(next) {
    settings = next
    storage.saveSettings(next)
  },
  navigate(hash) {
    if (location.hash === hash) render()
    else location.hash = hash
  },
}

const appElement = document.querySelector<HTMLDivElement>('#app')
if (!appElement) throw new Error('Elemento #app não encontrado')
const root: HTMLDivElement = appElement

type Disposable = HTMLElement & { dispose?: () => void }
let current: Disposable | null = null

function route(): HTMLElement {
  const hash = location.hash || '#/'
  const editMatch = /^#\/edit\/(.+)$/.exec(hash)
  if (editMatch?.[1]) return renderEditor(ctx, editMatch[1])
  const runMatch = /^#\/run\/(.+)$/.exec(hash)
  if (runMatch?.[1]) return renderRun(ctx, runMatch[1])
  if (hash === '#/peso') return renderWeight(ctx)
  return renderHome(ctx)
}

function render(): void {
  closeSheet()
  current?.dispose?.()
  const screen = route() as Disposable
  root.replaceChildren(screen)
  current = screen
  window.scrollTo(0, 0)
}

window.addEventListener('hashchange', render)
render()

// ---- abertura -------------------------------------------------------------

function showSplash(): void {
  const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  mark.setAttribute('viewBox', '0 0 100 100')
  mark.setAttribute('class', 'mark')
  mark.setAttribute('aria-hidden', 'true')
  mark.innerHTML = `
    <circle cx="50" cy="50" r="42" fill="none" stroke="#262a31" stroke-width="7"/>
    <circle class="arc" cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="7"
            stroke-linecap="round" stroke-dasharray="264" stroke-dashoffset="110"
            transform="rotate(-90 50 50)"/>
    <path d="M44 34 L44 66 M56 34 L56 66 M44 50 L56 50" stroke="#eef1f5" stroke-width="6"
          stroke-linecap="round" fill="none"/>`

  const splash = h(
    'div',
    { class: 'splash' },
    mark,
    h('div', { class: 'wordmark', text: 'HIIT' }),
    h('div', { class: 'tagline', text: 'Interval trainer' }),
    h('div', { class: 'by', text: 'By Renato Furriel' }),
  )
  document.body.append(splash)

  setTimeout(() => {
    splash.classList.add('out')
    setTimeout(() => splash.remove(), 500)
  }, 1100)
}

if (!location.hash.startsWith('#/run/')) showSplash()

// ---- service worker -------------------------------------------------------

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  })
}
