let window = Object.create(null)
 
class Realm {
  static TRAPS = Object.getOwnPropertyNames(Reflect)
  static ONE = false
  static UNHANDLED = Symbol('unhandled')
  static GLOBALREF = globalThis
  static active = true
  static wrap = false
  static fallback = false
  static travel = void 0

  constructor(travel={}) {
    if(Realm.ONE){return}
    Realm.travel = travel;
    
    let _active = false, _wrap = false;
    
    let globalThis = Realm.GLOBALREF.globalThis
    let Reflect = globalThis.Reflect, Object = globalThis.Object, Proxy = globalThis.Proxy

    let snapshot = Reflect.ownKeys(globalThis).reduce((o, k) => (o[k] = globalThis[k], o), {})
      
    let bypass = Object.fromEntries(
      Realm.TRAPS.map(op => [op, (...args) => {
        _active = true;
        try { return Reflect[op](...args); }
        finally { _active = false; }
      }])
    );

    Object.defineProperty(globalThis, 'global', {
      value: new Proxy(globalThis, bypass),
      writable: true, configurable: true,
    });

    let handler = Object.fromEntries(
      Realm.TRAPS.map(op => [op, (...args) => {
        // snapshot user flags before zeroing
        let _snapActive = Realm.active, _snapWrap = Realm.wrap, _snapFallback = Realm.fallback

        if (!_snapActive || _active) {
          return Reflect[op](...args);
        }

        let output;
        try {
          Realm.active = Realm.wrap = Realm.fallback = false

          output = Realm.travel[op] ? Realm.travel[op](...args) : Realm.UNHANDLED

          // read user's choice from travel, then cache it
          _snapActive = Realm.active, _snapWrap = Realm.wrap, _snapFallback = Realm.fallback
      
          if (output === Realm.UNHANDLED || (_snapFallback && output == void 0)) {
            _active = true;
            try {
              output = Reflect[op](...args)
            } finally {
              _active = false;
            }
          }

          if (_snapWrap && !_wrap &&
              output != void 0 &&
              (typeof output === 'object' || typeof output === 'function')) {
            _wrap = true;
            try {
              output = new Proxy(output, handler);
            } finally {
              _wrap = false;
            }
          }
      
          return output;
        } catch(e) {
          throw e
        } finally {
          Realm.active = Realm.wrap = Realm.fallback = true
        }
      }])
    );

    Reflect.ownKeys(globalThis).forEach(k => {
      if (k === 'globalThis') return
      try { delete globalThis[k] } catch(e) {}
    })

    Object.setPrototypeOf(globalThis, new Proxy(snapshot, handler));
    Realm.ONE = true
  }
}
