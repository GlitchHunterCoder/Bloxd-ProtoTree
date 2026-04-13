# Bloxd-ProtoTree

## Why it was made

this project exists because i was exploring how prototype chains work in javascript
and how bare name lookup flows through `globalThis` and its prototype
i realised that if you could control that chain, you could define entirely custom scoping rules
rules that no language gives you natively — read only memory, type enforcement, permission gates, dynamic rollback
and so this was made, a tool to intercept all variable access on `globalThis`
and supply your own logic to control exactly how variables are found and written

---

## Main Premise: `Realm`

the core idea is simple — `Realm` replaces the prototype of `globalThis` with a Proxy
every bare name lookup that isn't an own property of `globalThis` flows through that proxy
and your `travel` object decides what happens

what sets this apart from other approaches:
most scope tools are flat — you pick a namespace explicitly (`BS["world"].myUtil`)
ProtoTree makes bare name lookup interceptable — you just write `myUtil()` and travel decides where to find it
and because travel is yours to define, the rules can be anything

---

## Global Tiers

ProtoTree exposes three tiers of access, each with different proxy behaviour:

| Name | What it is | Proxy behaviour |
|---|---|---|
| `globalThis` | the real global object | own properties bypass travel entirely, missing properties hit the proxy |
| `global` | unproxied window into `globalThis` | reads and writes go directly to `globalThis`, travel never fires |
| `window` | `Object.create(null)` | completely separate from `globalThis`, lexically scoped, never proxied |

### `globalThis`

all unqualified variable access flows through `globalThis`
if a name exists as an own property it is found immediately — travel never fires
if it doesn't, JS walks the prototype chain and hits the proxy — travel fires

```js
globalThis.x = 1
x  // own property — travel never fires

y  // not an own property → proxy → travel fires
```

### `global`

`global` is a clean escape hatch — reads and writes go directly to `globalThis` without travel intercepting

```js
global.World  = { gravity: 9.8 }  // writes directly to globalThis
global.Code   = { gravity: 1.5 }  // same
global.myId                        // reads directly, travel never fires
```

use `global` inside travel handlers to safely read containers and context without recursing

```js
travel: {
  get([key]) {
    const myId = global.myId;         // safe — no recursion
    return myId == void 0
      ? global.World[key]             // safe — direct container access
      : global.Code[key];
  }
}
```

### `window`

`window` is a plain `Object.create(null)` — completely separate from `globalThis`
because it is resolved lexically at parse time, nothing in ProtoTree can ever intercept it
it is never accessible as a bare name, only as `window.x`

```js
window.TypeMeta  = new Map()  // type registry for travel internals
window.visited   = new WeakSet()  // cycle detection state
window.SECRET    = Symbol()   // private symbols
```

the key difference from `global`:

```js
global.score = 0   // bare `score` now resolves to this — travel sees it
window.score = 0   // only accessible as `window.score` — travel never sees it
```

---

# User Notes

## All User Features

- `new Realm(travel)` — takes a travel object and hooks into `globalThis`
- `global` — unproxied window into `globalThis`, safe to use inside travel
- `window` — fully private lexical object, completely invisible to the proxy

---

## `travel`

`travel` is an object of functions keyed by proxy trap name
each function is called when that trap fires on `globalThis`
unhandled traps fall through to `Reflect` automatically

```js
new Realm({
  get([key]) { ... },
  set([key, value]) { ... },
  // anything not defined → Reflect handles it as normal JS
})
```

### `args` per trap

each travel function receives the trap args directly as an array

| Trap | `args` | Return value |
|---|---|---|
| `get` | `[key, receiver]` | **any value** → becomes the result of the lookup |
| `set` | `[key, value, receiver]` | **boolean** → `true` = success, `false` = fails in strict mode |
| `has` | `[key]` | **boolean** → result of `"key" in obj` |
| `deleteProperty` | `[key]` | **boolean** → `true` = deleted |
| `defineProperty` | `[key, descriptor]` | **boolean** → `true` = defined |
| `getOwnPropertyDescriptor` | `[key]` | **object / undefined** → descriptor |
| `ownKeys` | `[]` | **array of keys** → controls `Object.keys`, spread, destructuring |
| `getPrototypeOf` | `[]` | **object / null** → prototype |
| `setPrototypeOf` | `[proto]` | **boolean** → success/failure |
| `isExtensible` | `[]` | **boolean** → controls `Object.isExtensible` |
| `preventExtensions` | `[]` | **boolean** → `true` if now non-extensible |
| `apply` | `[thisArg, argsList]` | **any value** → return value of call |
| `construct` | `[argsList, newTarget]` | **object** → constructed instance |

### Return values

| Return | Effect |
|---|---|
| any value | used directly as the trap result |
| `null` or `undefined` | `Reflect[op]` handles it — default JS behaviour |

---

## Example User Programs

### Basic Scope Routing

```js
global.World = { gravity: 9.8, time: 0 };
global.Code  = { gravity: 1.5, score: 0 };

new Realm({
  get([key]) {
    const myId = global.myId;
    return myId == void 0
      ? global.World[key]   // world code — route to World
      : global.Code[key];   // code block — route to Code
  },
  set([key, value]) {
    const myId = global.myId;
    const target = myId == void 0 ? global.World : global.Code;
    if (key in target) { target[key] = value; return true; }
    throw new Error(`"${key}" not found`);
  }
});

gravity  // 1.5 if inside a code block, 9.8 if world code
```

---

### Read Only Scope

```js
new Realm({
  get([key]) { return global.Constants[key]; },
  set([key]) {
    throw new Error(`"${key}" is read only`);
  }
});
```

---

### Type Enforced Scope

```js
global.World = { gravity: 9.8, count: 0 };

new Realm({
  set([key, value]) {
    const c = global.World;
    if (!(key in c)) throw new Error(`"${key}" not declared`);
    if (typeof value !== typeof c[key])
      throw new TypeError(`"${key}" expected ${typeof c[key]}, got ${typeof value}`);
    c[key] = value;
    return true;
  }
});

gravity = "fast"  // TypeError: "gravity" expected number, got string
```

---

### Prod / Staging / Testing Rollback

```js
global.testing = { featureX: () => "experimental" };
global.staging  = { featureX: () => "stable" };
global.prod     = { featureX: () => "live" };

new Realm({
  get([key]) {
    if (key in global.testing) return global.testing[key];
    if (key in global.staging) return global.staging[key];
    return global.prod[key];
  }
});

featureX()  // "experimental"

// instant rollback — remove testing entries and staging takes over
delete global.testing.featureX;
featureX()  // "stable"
```

---

### Expiring Variables

```js
window.expiry = new Map();  // stored in window — travel never sees it

global.World = { sessionToken: null };

window.expiry.set('sessionToken', Date.now() + 5000);  // expires in 5s

new Realm({
  get([key]) {
    const exp = window.expiry.get(key);
    if (exp && Date.now() > exp) {
      delete global.World[key];
      window.expiry.delete(key);
      return undefined;
    }
    return global.World[key];
  }
});
```

---

### Cycle Detection

```js
window.visited = new WeakSet();

new Realm({
  get([key]) {
    if (window.visited.has(global.node)) return undefined;
    window.visited.add(global.node);
    // ... lookup logic
  }
});
```

---

# Developer Notes

## All Developer Features

- `Realm.TRAPS` — static array of all 13 proxy trap names, used to generate the handler map
- `global` — built using a bypass proxy with an `origin` flag so reads/writes skip the main proxy entirely
- `Reflect` fallback — any unhandled trap or `null`/`undefined` return falls through to `Reflect[op]` on `globalThis`
- `window` — a plain `Object.create(null)` declared lexically before the class, safe for any internal state

---

## Example Developer Programs

### Observable Scope

```js
new Realm({
  get([key]) {
    console.log(`get: ${key}`);
    return global.World[key];
  },
  set([key, value]) {
    console.log(`set: ${key} =`, value);
    global.World[key] = value;
    return true;
  }
});
```

---

### Permission Gated Scope

```js
new Realm({
  get([key]) {
    if (!global.currentUser.can('read', key))
      throw new Error(`permission denied: ${key}`);
    return global.World[key];
  }
});
```

---

### Lazy Evaluated Variables

```js
global.World = {
  heavyValue: () => expensiveComputation()  // stored as thunk
};

new Realm({
  get([key]) {
    const v = global.World[key];
    return typeof v === 'function' ? v() : v;  // resolve thunk on access
  }
});
```

---

### Dynamic Scope Switching at Runtime

```js
new Realm({
  get([key]) {
    // swap which container is active based on runtime state
    const scope = global.strictMode ? global.Strict : global.Loose;
    return scope[key];
  }
});

global.strictMode = false;
x  // from Loose

global.strictMode = true;
x  // from Strict — no code changes, just flipped a flag
```

---

# Outro

## Use Cases

- **Language simulation** — read only memory, type enforcement, expiring variables, lazy evaluation
- **Sandboxing** — isolate variables per user, permission gated scopes, context-aware resolution
- **Namespaces** — define how namespaces sit relative to each other and how they appear to bare name lookup
- **Prototyping** — `prod` overrides `staging` overrides `testing`, instant rollback by removing a layer
- **Organisation** — structure code behind scenes while keeping call sites looking like flat globals

## Full Example: Everything Together

```js
global.World  = { gravity: 9.8, time: 0 };
global.Code   = { gravity: 1.5, score: 0 };
global.Shared = { log: console.log };

window.types = { gravity: 'number', time: 'number', score: 'number' };

new Realm({
  get([key]) {
    const myId = global.myId;
    if (key in global.Shared) return global.Shared[key];
    return myId == void 0 ? global.World[key] : global.Code[key];
  },
  set([key, value]) {
    const myId = global.myId;
    const target = myId == void 0 ? global.World : global.Code;
    if (!(key in target)) throw new Error(`"${key}" not declared`);
    const expected = window.types[key];
    if (expected && typeof value !== expected)
      throw new TypeError(`"${key}" expected ${expected}, got ${typeof value}`);
    target[key] = value;
    return true;
  }
});

gravity        // 1.5 inside code block, 9.8 in world code
log("hello")   // always from Shared
gravity = "x"  // TypeError — type enforced
score = 10     // fine — correct type, routes to Code
```
