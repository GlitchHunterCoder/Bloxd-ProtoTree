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
    this.origin = false
    
    let handler = Object.fromEntries(
      Realm.TRAPS.map(op => [
        op,
        (...args) => {
          this.origin = true
          let error;
          try{return Reflect[op](...args)}
          catch(err){error = err}
          finally{this.origin = false}
          throw error
        }
      ])
    ); //first handler, avoid proxy

    Object.defineProperty(globalThis, 'global', {
      value: new Proxy(globalThis,handler),
      writable: true,
      configurable: true,
    }); //set global

    const _proto = Object.getPrototypeOf(globalThis);
  
    handler = Object.fromEntries(
      Realm.TRAPS.map(op => [
        op,
        (target, ...args) =>{
          if (this.origin) return Reflect[op](target, ...args);
          return ((this.travel[op]?.({ target, args, node: this.tree, realm: this }))
          ?? Reflect[op](target, ...args))
        }
      ])
    ); //second handler, proxy handler
    
    Object.setPrototypeOf(globalThis, new Proxy(_proto, handler)); //set global prototype
  }

  container(name) {
    const c = this.scopes[name];
    if (!c) throw new Error(`Realm: no scope registered as "${name}"`);
    return c;
  }
}
