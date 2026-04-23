let window = Object.create(null)

class Realm {
  static TRAPS = Object.getOwnPropertyNames(Reflect)

  constructor(travel={}) {
    this.travel = travel;
    
    //user interface for proxy
    this.active = this.wrap = this.fallback = true
    
    //engine proxy overrides
    let _activate = false, _wrap = false;

    // cache everything before any manipulation
    let _Reflect = Reflect, _Object = Object, _globalThis = globalThis, _Proxy = Proxy

    let snapshot = _Reflect.ownKeys(globalThis).reduce((o, k) => (o[k] = _globalThis[k], o), {})
      
    let bypass = Object.fromEntries(
      Realm.TRAPS.map(op => [op, (...args) => {
        _activate = true;
        try { return _Reflect[op](...args); }
        finally { _activate = false; }
      }])
    ); //global bypass

    _Object.defineProperty(_globalThis, 'global', {
      value: new Proxy(_globalThis, bypass),
      writable: true, configurable: true,
    });

    let handler = Object.fromEntries(
      Realm.TRAPS.map(op => [op, (...args) => {

        //this.active
        if (!this.active || _activate) {
          return _Reflect[op](...args);
        }
    
        let output;
    
        // run user logic
        this.active = this.wrap = this.fallback = false //sets (proxy / wrap / fallback) OFF
        try{
          output = this.travel[op]?.(args, this);
      
          //this.fallback
          if (output == void 0) {
            _activate = true;
            try {
              if(this.fallback){
                  throw "SKIP"
              } //make-shift && for this.fallback if
              output = _Reflect[op](...args);
            } finally {
              _activate = false;
            }
          }

          //this.wrap
          if (this.wrap && !_wrap) {
            _wrap = true;
            try {
              output = new _Proxy(output, handler);
            } finally {
              _wrap = false;
            }
          }
      
          return output;
        } catch(e){
          throw e
        } finally {
          this.active = this.wrap = this.fallback = true //sets (proxy / wrap / fallback) ON
        }
    
      }])
    );

    // hollow out globalThis so everything falls through to proxy
    _Reflect.ownKeys(_globalThis).forEach(k => {
      if (k === 'globalThis') return
      try { delete _globalThis[k] } catch(e) {}
    })

    //create chain ( hollowGlobal -> globalClone -> prototype )
    _Object.setPrototypeOf(_globalThis, new _Proxy(snapshot, handler));
  }
}
