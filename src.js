let window = Object.create(null)

class Realm {
  static TRAPS = Object.getOwnPropertyNames(Reflect)
  
  constructor(travel={}) {
    this.travel = travel;
    
    //user interface for proxy
    this.active = this.wrap = this.fallback = true
    
    //engine proxy overrides
    let _activate = false, _wrap = false;
    
    // cache important globals for engine use
    let {Reflect, Object, globalThis, Proxy} = new Function(`return globalThis`)()

    let snapshot = Reflect.ownKeys(globalThis).reduce((o, k) => (o[k] = globalThis[k], o), {})

    let bypass = Object.fromEntries(
      Realm.TRAPS.map(op => [op, (...args) => {
        _activate = true;
        try { return Reflect[op](...args); }
        finally { _activate = false; }
      }])
    ); //global bypass

    Object.defineProperty(globalThis, 'global', {
      value: new Proxy(globalThis, bypass),
      writable: true, configurable: true,
    });

    let handler = Object.fromEntries(
      Realm.TRAPS.map(op => [op, (...args) => {
        
        //this.active
        if (!this.active || _activate) {
          return Reflect[op](...args);
        }
    
        let output;
    
        // run user logic
        this.active = this.wrap = this.fallback = false //sets (proxy / wrap / fallback) OFF
        try{
          output = this.travel[op]?.(args, this);
      
          //this.fallback
          if (this.fallback && output == void 0) {
            _activate = true;
            try {
              output = Reflect[op](...args);
            } finally {
              _activate = false;
            }
          }
          
          //this.wrap
          if (this.wrap && !_wrap) {
            _wrap = true;
            try {
              output = new Proxy(output, handler);
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

    //remove globalThis
    Reflect.ownKeys(globalThis).forEach(k => {
      if (k === 'globalThis') return
      try { delete globalThis[k] } catch(e) {}
    })

    //create chain ( hollowGlobal -> globalClone -> prototype )
    Object.setPrototypeOf(globalThis, new Proxy(snapshot, handler));
  }
}
