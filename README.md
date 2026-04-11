# Bloxd-ProtoTree

## Why it was made

this project exists because i was exploring how prototype chains work in javascript
and how bare name lookup flows through `globalThis` and its prototype
i realised that if you could control that chain, you could define entirely custom scoping rules
rules that no language gives you natively — read only memory, type enforcement, permission gates, dynamic rollback
and so this was made, a tool to define the topology of scopes as a tree, web, or chain
and supply your own traversal logic to control exactly how variables are found and written

---

## Main Premise: `Realm`

the core idea is that all scopes live inside one master object called a `Realm`
which has three parts — a registry of scope containers, a topology describing how they relate, and a `travel` object defining how traversal works

what sets this apart from other approaches:
most scope tools are flat — you pick a namespace explicitly (`BS["world"].myUtil`)
ProtoTree makes scopes traversable — you just write `myUtil()` and travel decides where to find it
and because travel is yours to define, the rules can be anything

### Short Explanation of the Topology

the `global` object describes the shape of your scope graph
it is not a flat list — it is a tree, web, or chain of named nodes

```js
global: {
  scopeA: {         // top level, searched first
    scopeB: {       // child of A
      scopeC: {}    // leaf
    }
  }
}
```

name reuse is not a cycle — `scopeA → scopeB → scopeA → scopeC` is a valid path
a true cycle is when a node's object reference points back to itself

```js
// NOT a cycle — name reused as a label
global: { scopeA: { scopeB: { scopeA: { scopeC: {} } } } }

// TRUE cycle — same object reference
realm.global.scopeA = realm.global.scopeA // object points to itself
```

---

## Global Tiers

ProtoTree exposes three tiers of global access:

| Name | What it is | Proxy behaviour |
|---|---|---|
| `globalThis` | the real global object | prototype is proxied — unqualified names that aren't own properties hit travel |
| `global` | `Proxy(globalThis, bypass)` | writes go directly to globalThis as own properties, bypassing travel |
| `window` | `Object.create(null)` | completely separate from globalThis, lexically scoped, never proxied |

### `globalThis`

all unqualified variable access flows through `globalThis`
if a name exists as an own property, it is found immediately — travel never fires
if it doesn't exist as an own property, JS walks the prototype chain and hits the proxy — travel fires

```js
// own property — never hits proxy
globalThis.x = 1
x  // found immediately, travel never fires

// not an own property — hits proxy
y  // not on globalThis → prototype chain → proxy → travel fires
```

### `global`

`global` exists for **writes** — setting via `global.x = 1` writes directly to `globalThis` as an own property, bypassing travel entirely
once written this way, subsequent reads also bypass the proxy since own properties are found first

```js
global.score = 0  // writes directly to globalThis, travel never fires
score             // own property now — reads never hit proxy either
score = 1         // unqualified set — travel intercepts this
```

use `global` when you need to declare a true global that travel should never touch — system state, type metadata, utilities used inside travel handlers themselves

```js
// safe to use inside travel handlers — wont recurse
global.console.log("hello")  // reads console directly off globalThis
global.isWorldCode = () => { ... }  // stores without travel intercepting
```

### `window`

`window` is a plain `Object.create(null)` stored as a lexical `let` variable, not on `globalThis`
because it is resolved lexically at parse time, it is completely invisible to the proxy — nothing in ProtoTree can intercept it

```js
// safest place for internals
window._pending = null    // type system pending state
window.TypeMeta = new Map() // type registry
window.SECRET = Symbol()  // private symbols
```

the difference from `global` — `global` writes to `globalThis` so the values become accessible as bare names
`window` is a separate object entirely, only accessible as `window.x`, never as bare `x`

```js
global.score = 0  // accessible as bare `score` anywhere
window.score = 0  // only accessible as `window.score`, bare `score` still hits proxy
```

---

# User Notes

## All User Features

- `Realm`
  - `scopes` — registry of scope names to their container objects `{ name → object }`
  - `global` — topology describing how scopes relate
  - `travel` — object of trap handlers, keys are trap names, only define what you need
- `realm.container(name)` — resolves a scope name to its container, throws if not registered

---

## `travel`

`travel` is an object of functions keyed by proxy trap name
each function is called when that trap fires on `globalThis`
unhandled traps fall through to `Reflect` automatically — ProtoTree is fully transparent for anything you don't handle

```js
travel: {
  get(ctx) { ... },
  set(ctx) { ... },
  // anything not defined here → Reflect handles it as normal JS
}
```

### Context Object

every trap function receives a single context object

| Property | Description |
|---|---|
| `target` | the raw Proxy target, passed to `Reflect` on fallback |
| `args` | trap-specific arguments (see below) |
| `node` | current position in the topology, starts at `realm.global` |
| `realm` | the Realm instance — `.scopes`, `.global`, `.container()`, `.travel` |

### `args` per trap

| Trap | `args` |
|---|---|
| `get` | `[key, receiver]` |
| `set` | `[key, value, receiver]` |
| `has` | `[key]` |
| `deleteProperty` | `[key]` |
| `defineProperty` | `[key, descriptor]` |
| `getOwnPropertyDescriptor` | `[key]` |
| `ownKeys` | `[]` |
| `getPrototypeOf` | `[]` |
| `setPrototypeOf` | `[proto]` |
| `isExtensible` | `[]` |
| `preventExtensions` | `[]` |
| `apply` | `[thisArg, argsList]` |
| `construct` | `[argsList, newTarget]` |

### Return values

| Return | Effect |
|---|---|
| any value | used directly as the trap result |
| `null` or `undefined` | `Reflect[op](target, ...args)` handles it — default JS behaviour |

### Recursing

to go deeper into the topology, call the relevant travel handler again with an updated `node`
ProtoTree never recurses on its own — you decide if, when, and where

```js
const result = realm.travel.get?.({ ...ctx, node: node[childName] });
```

---

## Example User Programs

### Depth-First Lookup

```js
const scopeA = { myUtil: () => "hello from A", x: 1 };
const scopeB = { helper: () => "hello from B", x: 2 };
const scopeC = { deep: 42 };

new Realm({
  scopes: { scopeA, scopeB, scopeC },
  global: {
    scopeA: {
      scopeB: {
        scopeC: {}
      }
    }
  },
  travel: {
    get({ args, node, realm }) {
      const [key] = args;
      for (const name of Object.keys(node)) {
        const c = realm.scopes[name];
        if (c && key in c) return c[key];
        const result = realm.travel.get?.({ args, node: node[name], realm });
        if (result != null) return result;
      }
    },
    has({ args, node, realm }) {
      const [key] = args;
      for (const name of Object.keys(node)) {
        const c = realm.scopes[name];
        if (c && key in c) return true;
        const result = realm.travel.has?.({ args, node: node[name], realm });
        if (result != null) return result;
      }
    },
    set({ args, node, realm }) {
      const [key, value] = args;
      for (const name of Object.keys(node)) {
        const c = realm.scopes[name];
        if (c && key in c) { c[key] = value; return true; }
        const result = realm.travel.set?.({ args, node: node[name], realm });
        if (result != null) return result;
      }
      throw new Error(`Realm: "${key}" not found in any scope — declare it first`);
    }
  }
});

myUtil()  // "hello from A"
helper()  // "hello from B"
deep      // 42
x         // 1  (scopeA.x shadows scopeB.x)
```

---

### Read Only Scope

```js
travel: {
  get({ args, node, realm }) { /* normal lookup */ },
  set() {
    throw new Error("this scope is read only");
  }
}
```

---

### Type Enforced Scope

```js
travel: {
  set({ args, node, realm }) {
    const [key, value] = args;
    for (const name of Object.keys(node)) {
      const c = realm.scopes[name];
      if (c && key in c) {
        if (typeof value !== typeof c[key])
          throw new TypeError(`Realm: "${key}" expected ${typeof c[key]}, got ${typeof value}`);
        c[key] = value;
        return true;
      }
    }
  }
}
```

---

### Prod / Staging / Testing Rollback

```js
const testing = { featureX: () => "experimental" };
const staging  = { featureX: () => "stable" };
const prod     = { featureX: () => "live" };

new Realm({
  scopes: { testing, staging, prod },
  global: {
    testing: {   // checked first
      staging: { // fallback
        prod: {} // final fallback
      }
    }
  },
  travel: { /* depth-first get/set as above */ }
});

featureX() // "experimental" — from testing
// remove testing from scopes → falls back to staging automatically
```

---

### Cycle Detection

```js
travel: {
  get(ctx, visited = new WeakSet()) {
    if (visited.has(ctx.node)) return undefined; // true reference cycle, bail
    visited.add(ctx.node);
    // ... normal lookup
  }
}
```

---

# Developer Notes

## All Developer Features

- `Realm.TRAPS` — static array of all 13 proxy trap names
- full proxy coverage — all 13 traps are wired up and routed through `travel`
- `Reflect` fallback — any unhandled trap or `null`/`undefined` return falls through to default JS behaviour
- topology is plain data — `global` is just an object, mutate it at runtime to restructure scopes dynamically
- `travel` is plain functions — swap handlers at runtime to change scoping rules on the fly

---

## Example Developer Programs

### Dynamic Topology at Runtime

```js
// narrow a scope at runtime by restructuring the graph
realm.global.scopeA.scopeB = narrowedNode;
// travel now resolves differently with no changes at the call site
```

---

### Observable Scope

```js
travel: {
  get({ args, node, realm }) {
    const [key] = args;
    console.log(`get: ${key}`); // log every access
    // ... normal lookup
  }
}
```

---

### Permission Gated Scope

```js
travel: {
  get({ args, node, realm }) {
    const [key] = args;
    if (!currentUser.can('read', key))
      throw new Error(`permission denied: ${key}`);
    // ... normal lookup
  }
}
```

---

### Lazy Evaluated Variables

```js
const scopeA = { heavyValue: () => expensiveComputation() }; // thunk

travel: {
  get({ args, node, realm }) {
    const [key] = args;
    for (const name of Object.keys(node)) {
      const c = realm.scopes[name];
      if (c && key in c) {
        const v = c[key];
        return typeof v === 'function' ? v() : v; // resolve thunk on access
      }
    }
  }
}
```

---

# Outro

## Use Cases

- **Language simulation** — read only memory, type enforcement, expiring variables, lazy evaluation
- **Sandboxing** — isolate variables per user, permission gated scopes, context-aware resolution
- **Namespaces** — define how namespaces sit relative to each other and how they appear to `globalThis`
- **Prototyping** — `prod` overrides `staging` overrides `testing`, instant rollback by removing a layer
- **Organisation** — structure code with a scope web while keeping bare name lookup flat

## Full Example: Everything Together

```js
const world    = { gravity: 9.8, time: 0 };
const shared   = { logger: console.log };
const code     = { gravity: 1.5 }; // shadows world.gravity for this block

new Realm({
  scopes: { world, shared, code },
  global: {
    code: {       // code block scope — checked first
      world: {    // world scope — fallback
        shared: {}// shared utilities — always available
      }
    }
  },
  travel: {
    get({ args, node, realm }) {
      const [key] = args;
      for (const name of Object.keys(node)) {
        const c = realm.scopes[name];
        if (c && key in c) return c[key];
        const r = realm.travel.get?.({ args, node: node[name], realm });
        if (r != null) return r;
      }
    },
    set({ args, node, realm }) {
      const [key, value] = args;
      for (const name of Object.keys(node)) {
        const c = realm.scopes[name];
        if (c && key in c) { c[key] = value; return true; }
        const r = realm.travel.set?.({ args, node: node[name], realm });
        if (r != null) return r;
      }
      throw new Error(`Realm: "${key}" not found`);
    }
  }
});

gravity  // 1.5  — code scope shadows world
time     // 0    — from world
logger   // fn   — from shared
```
