/**
 * Página de apoio ao desenvolvimento das animações: mostra todas as figuras
 * lado a lado, grandes. Serve só no `npm run dev` — o build gera apenas o
 * `index.html`, então ela não vai para o app publicado.
 */
import './styles.css'
import './exercises/animations.css'
import { EXERCISES, REST_POSE, createAnimation } from './exercises'

const grid = document.querySelector<HTMLDivElement>('#grid')
if (!grid) throw new Error('#grid não encontrado')

grid.style.cssText =
  'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding:12px'

for (const exercise of [...EXERCISES, REST_POSE]) {
  const art = document.createElement('div')
  art.style.cssText = 'height:150px;color:#eef1f5'
  art.append(createAnimation(exercise))

  const label = document.createElement('div')
  label.textContent = exercise.name
  label.style.cssText = 'font-size:12px;color:#8b93a1;text-align:center;margin-top:6px'

  const cell = document.createElement('div')
  cell.style.cssText =
    'background:#14161a;border:1px solid #262a31;border-radius:12px;padding:10px'
  cell.append(art, label)
  grid.append(cell)
}
