let window = Object.create(null)

class Realm {
  static TRAPS = Object.getOwnPropertyNames(Reflect)
  static ONE = false
  
  constructor(travel={}) {
    if(Realm.ONE){return}
    this.travel = travel;
    
    this.active = true, this.wrap = false, this.fallback = true
    
    let _active = false, _wrap = false;
    let _Reflect = Reflect, _Object = Object, _globalThis = globalThis, _Proxy = Proxy

    let snapshot = _Reflect.ownKeys(_globalThis).reduce((o, k) => (o[k] = _globalThis[k], o), {})
      
    let bypass = Object.fromEntries(
      Realm.TRAPS.map(op => [op, (...args) => {
        _active = true;
        try { return _Reflect[op](...args); }
        finally { _active = false; }
      }])
    );

    _Object.defineProperty(_globalThis, 'global', {
      value: new _Proxy(_globalThis, bypass),
      writable: true, configurable: true,
    });

    let handler = Object.fromEntries(
      Realm.TRAPS.map(op => [op, (...args) => {

        // snapshot user flags before zeroing
        let _snapActive = this.active, _snapFallback = this.fallback, _snapWrap = this.wrap

        if (!_snapActive || _active) {
          return _Reflect[op](...args);
        }

        this.active = false, this.wrap = false, this.fallback = true  // default fallback ON unless user turns off in travel

        let output;
        try {
          output = this.travel[op]?.(args, this);

          // read user's choice from travel, then cache it
          _snapActive = this.active, _snapFallback = this.fallback, _snapWrap = this.wrap
      
          if (_snapFallback && output == void 0) {
            _active = true;
            try {
              output = _Reflect[op](...args);
            } finally {
              _active = false;
            }
          }

          if (_snapWrap && !_wrap &&
              output != void 0 &&
              (typeof output === 'object' || typeof output === 'function')) {
            _wrap = true;
            try {
              output = new _Proxy(output, handler);
            } finally {
              _wrap = false;
            }
          }
      
          return output;
        } catch(e) {
          throw e
        } finally {
          this.active = true, this.wrap = false, this.fallback = true
        }
      }])
    );

    _Reflect.ownKeys(_globalThis).forEach(k => {
      if (k === 'globalThis') return
      try { delete _globalThis[k] } catch(e) {}
    })

    _Object.setPrototypeOf(_globalThis, new _Proxy(snapshot, handler));
    Realm.ONE = true
  }
}
