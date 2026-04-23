let window = Object.create(null)

class Realm {
  static TRAPS = ['get','set','has','deleteProperty','defineProperty','getOwnPropertyDescriptor','ownKeys','getPrototypeOf','setPrototypeOf','isExtensible','preventExtensions','apply','construct'];

  constructor(travel={}) {
    this.travel = travel;
    
    //userside interface for proxy toggles
    this.active = this.wrap = this.fallback = true
    
    //engine side overrides
    let _activate = false, _wrap = false;

    // cache everything before any manipulation
    const _Reflect = Reflect
    const _Object = Object
    const _globalThis = globalThis
    const _Proxy = Proxy

    const bypass = Object.fromEntries(
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

    const handler = Object.fromEntries(
      Realm.TRAPS.map(op => [op, (...args) => {
    
        const allowTrap = this.active && !_activate;
    
        if (!allowTrap) {
          return _Reflect[op](...args);
        } //if trap is NOT on, use reflect
    
        let output;
    
        // run user logic (can recurse if user wants)
        this.active = this.wrap = !(this.fallback = true) //sets to proxy off / wrap off / fallback on
        try{
          output = this.travel[op]?.(args, this);
      
          // fallback (engine protected)
          if (this.fallback && output == void 0) {
            _activate = true;
            try {
              output = _Reflect[op](...args);
            } finally {
              _activate = false;
            }
          }
  
          const allowWrap = this.wrap && !_wrap;
          
          if (allowWrap) {
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
          this.active = this.wrap = true
        }
      }])
    );

    // snapshot all globals before hollowing out
    const snapshot = _Reflect.ownKeys(_globalThis)
      .reduce((o, k) => (o[k] = _globalThis[k], o), {})

    // hollow out globalThis so everything falls through to proxy
    _Reflect.ownKeys(_globalThis).forEach(k => {
      if (k === 'globalThis') return
      try { delete _globalThis[k] } catch(e) {}
    })

    // set proxy as prototype — catches missing AND existing properties
    _Object.setPrototypeOf(_globalThis, new _Proxy(snapshot, handler));
  }
}
