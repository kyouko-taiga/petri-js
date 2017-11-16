import { combineReducers } from 'redux'
import undoable from 'redux-undo'

import { actionTypes } from './actions'

const initialModel = { places: [], transitions: [], m0: {} }
const model = (state = initialModel, action) => {
  switch (action.type) {
  case actionTypes.INIT:
    return action.payload.model
  default:
    return state
  }
}

const marking = (state = {}, action) => {
  switch (action.type) {
  case actionTypes.INIT:
    return action.payload.model.m0
  case actionTypes.FIRE:
    return action.payload.nextMarking
  default:
    return state
  }
}

const sequence = (state = [], action) => {
  switch (action.type) {
  case actionTypes.INIT:
    return []
  case actionTypes.FIRE:
    return state.concat([{
      transition: action.payload.transition.name,
      binding   : action.payload.binding,
    }])
  default:
    return state
  }
}

export default combineReducers({
  model,
  marking: undoable(marking),
  sequence: undoable(sequence),
})
