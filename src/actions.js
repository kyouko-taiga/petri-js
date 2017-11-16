const actionTypes = {
  INIT: '@@petri-js/INIT',
  FIRE: '@@petri-js/FIRE',
}

function init(model) {
  return {
    type   : actionTypes.INIT,
    payload: { model },
  }
}

function fireTransition(transition, marking, binding, fireFunction) {
  const nextMarking = fireFunction(transition, marking, binding)
  return {
    type   : actionTypes.FIRE,
    payload: { transition, binding, nextMarking },
  }
}

export {
  actionTypes,
  init,
  fireTransition,
}
