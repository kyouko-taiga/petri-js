# petri-js

A Javascript library to display and interact with Petri Nets.

## Installation

To install the latest version (assuming you are using [npm](https://www.npmjs.com/)  as your package manager):

```bash
npm install --save petri-js
```

`petri-js` is intended to be used as a [CommonJS](http://webpack.github.io/docs/commonjs.html) module,
in a [Webpack](https://webpack.js.org/) or [Browserify](http://browserify.org/) environment.
This lets you then import the module as follows:

```js
import PetriNet from 'petri-js'
```

## Usage

All you need to do is create an instance of simulator,
a model to simulate and a SVG element it can renders to:

```js
import PetriNet from 'petri-js'

// Create the Petri Net model:
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

// Create an instance of a simulator.
const petrinet = new PetriNet(document.getElementById('petrinet'), model)
```

By default, `petri-js` assumes the given models can be simulated with the semantics of classic
[Place/Transition (PT) nets](https://en.wikipedia.org/wiki/Petri_net).
