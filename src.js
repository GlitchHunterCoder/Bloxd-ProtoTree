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

  constructor({ scopes, global, travel }) {
    this.scopes = scopes;
    this.global = global;
    this.travel = travel;

  const handler = Object.fromEntries(
    Realm.TRAPS.map(op => [
      op,
      (target, ...args) =>
        this.travel[op]?.({ target, args, node: this.global, realm: this })
        ?? Reflect[op](target, ...args)
    ])
  );

    Object.setPrototypeOf(globalThis, new Proxy(Object.create(null), handler));
  }

  container(name) {
    const c = this.scopes[name];
    if (!c) throw new Error(`Realm: no scope registered as "${name}"`);
    return c;
  }
}
