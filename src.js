class Realm {

  constructor({ scopes, global, travel }) {
    this.scopes = scopes;  // { name: container object }
    this.global = global;  // the tree of references
    this.travel = travel;  // traversal logic

    const self = this;
    const proxy = new Proxy(Object.create(null), {
      get(_, key)         { return self.travel({ op: 'get', key, node: self.global, realm: self }); },
      set(_, key, value) { self.travel({ op: 'set', key, value, node: self.global, realm: self }); return true; },
      has(_, key)         { return self.travel({ op: 'has', key, node: self.global, realm: self }) ?? false; },
    });

    Object.setPrototypeOf(globalThis, proxy);
  }

  container(name) {
    const c = this.scopes[name];
    if (!c) throw new Error(`Realm: no scope registered as "${name}"`);
    return c;
  }
}
