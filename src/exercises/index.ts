export interface Exercise {
  id: string
  name: string
  /** Uma frase de execução, exibida durante o esforço. */
  cue: string
  viewBox: string
  markup: string
}

/**
 * Cada figura é uma silhueta em traço animada por `@keyframes` — ver
 * `animations.css`. O traço, o preenchimento e a origem de cada articulação
 * vivem no CSS; aqui fica só a geometria da pose base.
 *
 * Convenção das poses em pé: cabeça em (50,16), ombro em (50,30),
 * quadril em (50,64), chão em y=112.
 */
export const EXERCISES: Exercise[] = [
  {
    id: 'polichinelo',
    name: 'Polichinelo',
    cue: 'Braços e pernas abrindo juntos, aterrissando leve',
    viewBox: '0 0 100 120',
    markup: `
      <g class="body">
        <circle cx="50" cy="16" r="9"/>
        <line x1="50" y1="25" x2="50" y2="64"/>
        <g class="armL"><line x1="50" y1="30" x2="36" y2="58"/></g>
        <g class="armR"><line x1="50" y1="30" x2="64" y2="58"/></g>
        <g class="legL"><line x1="50" y1="64" x2="50" y2="110"/></g>
        <g class="legR"><line x1="50" y1="64" x2="50" y2="110"/></g>
      </g>`,
  },
  {
    id: 'agachamento',
    name: 'Agachamento',
    cue: 'Peso nos calcanhares, peito aberto, desça até a coxa paralela',
    viewBox: '0 0 100 120',
    markup: `
      <g class="body">
        <g class="upper">
          <circle cx="56" cy="17" r="9"/>
          <line x1="54" y1="26" x2="48" y2="64"/>
          <g class="arm"><line x1="53" y1="32" x2="78" y2="38"/></g>
        </g>
        <g class="thigh">
          <line x1="48" y1="64" x2="52" y2="86"/>
          <g class="shin"><line x1="52" y1="86" x2="48" y2="110"/></g>
        </g>
      </g>
      <line class="ground" x1="14" y1="112" x2="86" y2="112"/>`,
  },
  {
    id: 'flexao',
    name: 'Flexão',
    cue: 'Corpo em linha reta, cotovelos a 45 graus do tronco',
    viewBox: '0 0 130 120',
    markup: `
      <g class="body">
        <circle cx="26" cy="52" r="9"/>
        <line x1="35" y1="56" x2="118" y2="82"/>
      </g>
      <g class="armAnchor">
        <polyline points="38,58 48,82 40,104"/>
      </g>
      <line class="ground" x1="14" y1="106" x2="122" y2="106"/>`,
  },
  {
    id: 'burpee',
    name: 'Burpee',
    cue: 'Desça, chute as pernas para trás, volte e salte',
    viewBox: '0 0 120 120',
    markup: `
      <g class="body">
        <g class="upper">
          <circle cx="56" cy="17" r="9"/>
          <line x1="54" y1="26" x2="48" y2="64"/>
          <g class="arm"><line x1="53" y1="32" x2="66" y2="56"/></g>
        </g>
        <g class="thigh">
          <line x1="48" y1="64" x2="52" y2="86"/>
          <g class="shin"><line x1="52" y1="86" x2="48" y2="110"/></g>
        </g>
      </g>
      <line class="ground" x1="10" y1="112" x2="110" y2="112"/>`,
  },
  {
    id: 'prancha',
    name: 'Prancha',
    cue: 'Abdômen firme, quadril na linha dos ombros',
    viewBox: '0 0 130 120',
    markup: `
      <g class="body">
        <circle cx="26" cy="58" r="9"/>
        <line x1="35" y1="62" x2="118" y2="84"/>
        <line x1="42" y1="64" x2="40" y2="98"/>
      </g>
      <line class="ground" x1="14" y1="106" x2="122" y2="106"/>`,
  },
  {
    id: 'abdominal',
    name: 'Abdominal',
    cue: 'Suba com o abdômen, sem puxar o pescoço',
    viewBox: '0 0 130 120',
    markup: `
      <g class="upper">
        <circle cx="24" cy="84" r="9"/>
        <line x1="33" y1="84" x2="66" y2="90"/>
        <g class="arm"><line x1="36" y1="84" x2="30" y2="70"/></g>
      </g>
      <line x1="66" y1="90" x2="94" y2="72"/>
      <line x1="94" y1="72" x2="98" y2="100"/>
      <line class="ground" x1="14" y1="102" x2="116" y2="102"/>`,
  },
  {
    id: 'mountain-climber',
    name: 'Mountain climber',
    cue: 'Quadril baixo, joelhos alternando rápido',
    viewBox: '0 0 130 120',
    markup: `
      <circle cx="26" cy="58" r="9"/>
      <line x1="35" y1="62" x2="96" y2="78"/>
      <line x1="42" y1="64" x2="40" y2="98"/>
      <g class="legA"><line x1="96" y1="78" x2="108" y2="100"/></g>
      <g class="legB"><line x1="96" y1="78" x2="108" y2="100"/></g>
      <line class="ground" x1="14" y1="106" x2="122" y2="106"/>`,
  },
  {
    id: 'corrida-parada',
    name: 'Corrida parada',
    cue: 'Joelhos na altura do quadril, apoio na ponta do pé',
    viewBox: '0 0 100 120',
    markup: `
      <g class="body">
        <circle cx="50" cy="16" r="9"/>
        <line x1="50" y1="25" x2="50" y2="64"/>
        <g class="armA"><line x1="50" y1="31" x2="40" y2="54"/></g>
        <g class="armB"><line x1="50" y1="31" x2="60" y2="54"/></g>
        <g class="legA">
          <line x1="50" y1="64" x2="50" y2="86"/>
          <g class="shinA"><line x1="50" y1="86" x2="50" y2="110"/></g>
        </g>
        <g class="legB">
          <line x1="50" y1="64" x2="50" y2="86"/>
          <g class="shinB"><line x1="50" y1="86" x2="50" y2="110"/></g>
        </g>
      </g>`,
  },
  {
    id: 'afundo',
    name: 'Afundo',
    cue: 'Joelho da frente sobre o tornozelo, tronco ereto',
    viewBox: '0 0 120 120',
    markup: `
      <g class="body">
        <circle cx="54" cy="16" r="9"/>
        <line x1="54" y1="25" x2="52" y2="64"/>
        <g class="front">
          <line x1="52" y1="64" x2="52" y2="86"/>
          <g class="frontShin"><line x1="52" y1="86" x2="52" y2="110"/></g>
        </g>
        <g class="back">
          <line x1="52" y1="64" x2="52" y2="86"/>
          <g class="backShin"><line x1="52" y1="86" x2="52" y2="110"/></g>
        </g>
      </g>
      <line class="ground" x1="10" y1="112" x2="110" y2="112"/>`,
  },
  {
    id: 'ponte',
    name: 'Ponte de glúteo',
    cue: 'Aperte o glúteo no topo, costelas baixas',
    viewBox: '0 0 130 120',
    markup: `
      <circle cx="22" cy="94" r="9"/>
      <g class="torso"><line x1="31" y1="94" x2="74" y2="94"/></g>
      <g class="thigh"><line x1="74" y1="94" x2="94" y2="74"/></g>
      <line x1="94" y1="74" x2="98" y2="102"/>
      <line class="ground" x1="12" y1="106" x2="116" y2="106"/>`,
  },
]

/** Pose neutra exibida durante os intervalos. Não é um exercício selecionável. */
export const REST_POSE: Exercise = {
  id: '__rest__',
  name: 'Descanso',
  cue: 'Respire fundo, solte os ombros',
  viewBox: '0 0 100 120',
  markup: `
    <g class="body">
      <circle cx="50" cy="16" r="9"/>
      <line x1="50" y1="25" x2="50" y2="64"/>
      <line x1="50" y1="34" x2="34" y2="60"/>
      <line x1="50" y1="34" x2="66" y2="60"/>
      <line x1="50" y1="64" x2="44" y2="110"/>
      <line x1="50" y1="64" x2="56" y2="110"/>
    </g>`,
}

const byId = new Map(EXERCISES.map((e) => [e.id, e]))

export function getExercise(id: string | undefined): Exercise | undefined {
  return id === undefined ? undefined : byId.get(id)
}

export function exerciseName(id: string | undefined): string {
  return getExercise(id)?.name ?? '—'
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Monta o SVG animado de um exercício, pronto para inserir na página. */
export function createAnimation(exercise: Exercise): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', exercise.viewBox)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', `ex ex-${exercise.id.replace(/_/g, '')}`)
  svg.innerHTML = exercise.markup
  return svg
}
