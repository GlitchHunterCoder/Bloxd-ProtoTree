let window = Object.create(null)

class Realm {
  static TRAPS = [
    'get',
    'set',
    'has',
    'deleteProperty',
    'defineProperty',
    'getOwnPropertyDescriptor',
    'ownKeys',
    'getPrototypeOf',
    'setPrototypeOf',
    'isExtensible',
    'preventExtensions',
    'apply',
    'construct',
  ];

  constructor({ scopes={}, tree={}, travel={} }={}) {
    this.scopes = scopes;
    this.tree = tree;
    this.travel = travel;
    this.origin = false;

    const bypass = Object.fromEntries(
      Realm.TRAPS.map(op => [op, (...args) => {
        this.origin = true;
        try { return Reflect[op](...args); }
        finally { this.origin = false; }
      }])
    );

    // global — unproxied window into globalThis
    Object.defineProperty(globalThis, 'global', {
      value: new Proxy(globalThis, bypass),
      writable: true, configurable: true,
    });

    const handler = Object.fromEntries(
      Realm.TRAPS.map(op => [op, (target, ...args) => {
          if (this.origin) return Reflect[op](target, ...args);
          let output = this.travel[op]?.({ target, args, node: this.tree, realm: this })
          return output ?? Reflect[op](target, ...args)
        }])
    );

    Object.setPrototypeOf(globalThis, new Proxy(window, handler));
  }

  container(name) {
    const c = this.scopes[name];
    if (!c) throw new Error(`Realm: no scope registered as "${name}"`);
    return c;
  }
}
