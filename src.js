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
          let output = this.travel[op]?.(args)
          return output ?? Reflect[op](global, ...args) //defaults to globalThis
        }])
    );

    Object.setPrototypeOf(globalThis, new Proxy(window, handler));
  }
}
