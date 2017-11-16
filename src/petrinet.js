import { createStore, applyMiddleware } from 'redux'
import { ActionCreators } from 'redux-undo'
import { createLogger } from 'redux-logger'
import * as d3 from 'd3'

import * as actions from './actions'
import reducers from './reducers'

// MARK: Some constants.

const TRANSITION_SIDE = 30
const PLACE_RADIUS    = Math.sqrt(TRANSITION_SIDE * TRANSITION_SIDE / 2)

// MARK: Default semantics.

function defaultIsFireable(t, marking) {
  return Object.keys(t.preconditions).every((p) => marking[p] >= t.preconditions[p])
}

function defaultFire(t, marking) {
  const pre         = t.preconditions
  const post        = t.postconditions
  const nextMarking = {}

  for (const p in marking) {
    if (!marking.hasOwnProperty(p)) {
      throw new Error(
        `'${p}' is precondition of '${t.name}' but doesn't appear in marking '${marking}'.`)
    }

    nextMarking[p] = (marking[p] || 0) - (pre[p] || 0) + (post[p] || 0)

    if (nextMarking[p] < 0) {
      throw new Error(`'${t.name}' is not fireable`)
    }
  }

  return nextMarking
}

// MARK: The PetriNet class.

/**
 * Class representing a Petri Net simulator.
 *
 * This class holds the state of a Petri Net simulator, and renders its view. The semantics of the
 * underlying Petri Net model is customizable (see constructor), but defaults to Place/Transition
 * nets (see https://en.wikipedia.org/wiki/Petri_net).
 */
export default class PetriNet {

  /**
   * Creates a Petri Net simulator.
   *
   * @param {HTMLElement} element - An SVG node the simulator will be rendered to.
   * @param {Object}      model   - The Petri Net model to simulate.
   * @param {Object}      options - Additional options
   */
  constructor(element, model, options = { fireSemantics: {}, enableLogging: false }) {
    this.svg     = d3.select(element)
    const width  = this.svg.node().getBoundingClientRect().width
    const height = this.svg.node().getBoundingClientRect().height

    // Handle default options.
    const customFireSemantics = options.fireSemantics || {}
    this.fireSemantics = {
      isFireable   : customFireSemantics.isFireable    || defaultIsFireable,
      fire         : customFireSemantics.fire          || defaultFire,
      chooseBinding: customFireSemantics.chooseBinding || null,
    }

    // Build the arrow en marker. Note that arrows are drawn like that: ``-->-``. Hence we should draw
    // their source and target nodes over them, so as to hide the exceeding parts.
    this.svg.append('svg:defs').selectAll('marker')
      .data(['end']).enter()
      .append('svg:marker')
      .attr('id'          , String)
      .attr('refX'        , TRANSITION_SIDE)
      .attr('refY'        , 4)
      .attr('markerWidth' , 12)
      .attr('markerHeight', 12)
      .attr('orient'      , 'auto')
      .append('svg:path')
      .attr('d', 'M0,0 L0,8 L8,4 z')

    this.arcsGroup  = this.svg.append('g').attr('class', 'arcs')
    this.nodesGroup = this.svg.append('g').attr('class', 'nodes')

    // Create the force simulation.
    this.simulation = d3.forceSimulation()
      .force('link'   , d3.forceLink().id((d) => d.id).distance(50))
      .force('charge' , d3.forceManyBody())
      .force('center' , d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(TRANSITION_SIDE * 2))
      .on   ('tick'   , () => {
        this.nodesGroup.selectAll('g')
          .attr('transform', (d) => `translate(${d.x}, ${d.y})`)
        this.arcsGroup.selectAll('g line')
          .attr('x1', (d) => d.source.x)
          .attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x)
          .attr('y2', (d) => d.target.y)
        this.arcsGroup.selectAll('g text')
          .attr('x', (d) => (d.source.x + d.target.x) / 2)
          .attr('y', (d) => (d.source.y + d.target.y) / 2)
      })

    // Create the redux store.
    this.store = options.enableLogging
      ? this.store = createStore(reducers, applyMiddleware(createLogger({ collapsed: true })))
      : this.store = createStore(reducers)
    this.store.subscribe(::this.render)
    this.store.dispatch(actions.init(model))
    this.store.dispatch(ActionCreators.clearHistory())
  }

  handleDragStart(d) {
    if (!d3.event.active) {
      this.simulation.alphaTarget(0.3).restart()
    }
    d.fx = d.x
    d.fy = d.y
  }

  handleDrag(d) {
    d.fx = d3.event.x
    d.fy = d3.event.y
  }

  handleDragEnd(d) {
    if (!d3.event.active) {
      this.simulation.alphaTarget(0)
    }
    d.fx = null
    d.fy = null
  }

  /** Returns the current marking of the model. */
  marking() {
    return this.store.getState().marking.present
  }

  /** Returns the sequence of transition (with their optional binding) fired so far. */
  sequence() {
    return this.store.getState().sequence.present
  }

  /** Attempt to fire the given transition. */
  fire(transition) {
    const marking = this.store.getState().marking.present
    const binding = this.fireSemantics.chooseBinding !== null
      ? this.fireSemantics.chooseBinding(transition, marking)
      : null
    this.store.dispatch(actions.fireTransition(
      transition, marking, binding, this.fireSemantics.fire))
  }

  /** Undo the last transition firing. */
  undo() {
    this.store.dispatch(ActionCreators.undo())
  }

  /** Redo the last transition firing. */
  redo() {
    this.store.dispatch(ActionCreators.redo())
  }

  render() {
    const model   = this.store.getState().model
    const marking = this.store.getState().marking.present

    // Adapt places and transitions data to d3. The goal is to create an array that contains all
    // vertices and another that contains all egdes, so that it'll be easier to handle them in the
    // force simulation later on.

    // vertices: [(id: String, type: String)]
    const vertices = model.places
      .map((place) => ({ id: place, type: 'place' }))
      .concat(model.transitions
        .map((transition) => ({
          ...transition,
          id  : transition.name,
          type: 'transition',
          fire: () => this.fire(transition),
        })))

    // edges: [(source: String, target: String, label: Model.Transition.Label)]
    const edges = model.transitions
      .map((transition) => {
        const preconditions = Object.keys(transition.preconditions)
          .map((place) => ({
            id    : place + transition.name,
            source: place,
            target: transition.name,
            label : transition.preconditions[place],
          }))
        const postconditions = Object.keys(transition.postconditions)
          .map((place) => ({
            id    : transition.name + place,
            source: transition.name,
            target: place,
            label : transition.postconditions[place],
          }))
        return preconditions.concat(postconditions)
      })
      .reduce((partialResult, e) => partialResult.concat(e))

    // Note that because d3 will mutate the data objects we'll bind to the vertices, we can't bind
    // the updated data as is. Instead, we should mutate the already bound objetcs, so that we can
    // preserve the positions and relations that were computed by the previous simulation run.
    const updatedVertices = this.nodesGroup.selectAll('g').data()
    for (const vertex of vertices) {
      const prev = updatedVertices.find((v) => v.id == vertex.id)
      if (typeof prev !== 'undefined') {
        for (const prop in vertex) {
          prev[prop] = vertex[prop]
        }
      } else {
        updatedVertices.push(vertex)
      }
    }

    // Draw new places and new transitions.
    let arcs = this.arcsGroup.selectAll('g')
      .data(edges, (d) => d.id)
    arcs.exit().remove()

    const arcsEnter = arcs.enter().append('g')
      .attr('id', (edge) => edge.id)
    arcsEnter.append('line')
      .attr('stroke'      , 'black')
      .attr('stroke-width', 1)
      .attr('marker-end'  , 'url(#end)')
    arcsEnter.filter((edge) => edge.label != '1').append('text')
      .text((edge) => edge.label)

    arcs = arcsEnter.merge(arcs)

    let nodes = this.nodesGroup.selectAll('g')
      .data(updatedVertices, (d) => d.id)

    const nodesEnter = nodes.enter().append('g')
      .attr('id'   , (vertex) => vertex.id)
      .attr('class', (vertex) => vertex.type)
      .call(d3.drag()
        .on('start', ::this.handleDragStart)
        .on('drag' , ::this.handleDrag)
        .on('end'  , ::this.handleDragEnd))

    const places = nodesEnter.filter('.place')
    places.append('circle')
      .attr('r'                 , () => PLACE_RADIUS)
      .attr('fill'              , 'rgb(255, 248, 220)')
      .attr('stroke'            , 'rgb(224, 220, 191)')
      .attr('stroke-width'      , '3px')
    places.append('text')
      .attr('class'             , 'marking')
      .attr('text-anchor'       , 'middle')
      .attr('alignment-baseline', 'central')
    places.append('text')
      .attr('text-anchor'       , 'left')
      .attr('alignment-baseline', 'central')
      .attr('dx', PLACE_RADIUS * 1.25)
      .text((place) => place.id)

    const transitions = nodesEnter.filter('.transition')
      .attr('cursor'            , 'pointer')
    transitions.append('circle')
      .attr('r'                 , PLACE_RADIUS)
      .attr('fill'              , 'white')
    transitions.append('rect')
      .attr('width'             , TRANSITION_SIDE)
      .attr('height'            , TRANSITION_SIDE)
      .attr('x'                 , -TRANSITION_SIDE / 2)
      .attr('y'                 , -TRANSITION_SIDE / 2)
      .attr('fill'              , 'rgb(220, 227, 255)')
      .attr('stroke'            , 'rgb(169, 186, 255)')
      .attr('stroke-width'      , 3)
    transitions.append('text')
      .attr('text-anchor'       , 'middle')
      .attr('alignment-baseline', 'central')
      .text((transition) => transition.id)
    transitions.on('click', (t) => t.fire())

    nodes = nodesEnter.merge(nodes)

    // Update place markings and transition states.
    nodes.filter('.place').select('.marking')
      .text((p) => marking[p.id])
    nodes.filter('.transition').
      classed('fireable', (t) => this.fireSemantics.isFireable(t, marking))

    // Run the force simulation to space out places and transitions.
    this.simulation.nodes(updatedVertices)
      .force('link').links(edges)
  }

}
