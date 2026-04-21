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

  constructor(travel={}) {
    this.travel = travel;
    this.active = true;
    let origin = false;
  
    const bypass = Object.fromEntries(
      Realm.TRAPS.map(op => [op, (...args) => {
        origin = true;
        try { return Reflect[op](...args); }
        finally { origin = false; }
      }])
    );

    // global — unproxied window into globalThis
    Object.defineProperty(globalThis, 'global', {
      value: new Proxy(globalThis, bypass),
      writable: true, configurable: true,
    });
  
    const handler = Object.fromEntries(
      Realm.TRAPS.map(op => [op, (target, ...args) => {
        if (origin || !this.active) return Reflect[op](target, ...args);
        this.active = false;
        try {
          let output = this.travel[op]?.(args, this)
          return output ?? Reflect[op](global, ...args)
        } finally {
          this.active = true;
        }
      }])
    );
  
    Object.setPrototypeOf(globalThis, new Proxy(window, handler));
  }
}
