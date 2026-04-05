# Bloxd-ProtoTree
## Usage
```js
// ─── usage ────────────────────────────────────────────────────────────────────
//
// travel receives:
// {
//   op     — 'get' | 'set' | 'has'
//   key    — variable name
//   value  — (set only) value to write
//   node   — current position in the topology (starts at realm.global)
//   realm  — the Realm instance (access .scopes, .global, .container())
// }
//
// travel decides everything:
//   - which container to look in      → realm.container(name)
//   - whether to go deeper            → travel({ ...ctx, node: node[childName] })
//   - what to return / write
//   - cycle detection if needed       → your own WeakSet
//   - throwing on miss                → your call

const scopeA = { myUtil: () => "hello from A" };
const scopeB = { helper: () => "hello from B" };
const scopeC = { deep: 42 };

function depthFirst(ctx) {
  const { op, key, value, node, realm } = ctx;
  console.log(ctx,"NEXT")
  // check every scope name that appears at this node level
  for (const name of Object.keys(node)) {
    const c = realm.scopes[name];        // may be undefined if name isn't registered
    if (c && key in c) {
      if (op === 'get' || op === 'has') return c[key];
      if (op === 'set') { c[key] = value; return; }
    }

    // recurse into this child by calling travel again at node[name]
    const result = depthFirst({ ...ctx, node: node[name] });
    if (result !== undefined) return result;
  }
}

new Realm({
  scopes: { scopeA: scopeA, scopeB: scopeB, scopeC: scopeC },
  global: {
    scopeA: {
      scopeB: {
        scopeC: {}
      }
    }
  },
  travel: depthFirst
});

// bare name lookup — travel owns everything from here
console.log(
myUtil(),"\n\n",   // "hello from A"
helper(),"\n\n",   // "hello from B"
deep,        // 42
)
```
