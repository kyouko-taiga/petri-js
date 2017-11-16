import PetriNet from 'petri-js'

// Create a new PetriNet view.
const model = {
  places     : [ 'p0', 'p1' ],
  transitions: [
    {
      name          : 't1',
      preconditions : { 'p0': 1 },
      postconditions: { 'p1': 2 },
    },
    {
      name          : 't0',
      preconditions : { 'p1': 1 },
      postconditions: { 'p0': 1 },
    },
  ],
  m0: { 'p0': 1, 'p1': 0 },
}

const petrinet = new PetriNet(document.getElementById('petrinet'), model)

// Bind undo/redo commands
document.onkeydown = (e) => {
  e = e || window.event
  switch (e.key) {
  case 'ArrowLeft':
    petrinet.undo()
    break
  case 'ArrowRight':
    petrinet.redo()
    break
  default:
    break
  }
}
