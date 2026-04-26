let window = Object.create(null)
 
let Realm = class {
  static TRAPS = Object.getOwnPropertyNames(Reflect)
  static ONE = false
  static active = true
  static wrap = false
  static fallback = false
  static travel = void 0

  constructor(travel={}) {
    if(Realm.ONE){return}
    Realm.travel = travel;
    
    let [_active, _wrap, _boot, _date, _store] = [!1, !1, !1, 0, {}]
    let globalThis = (0,eval)("globalThis.globalThis")
    let {Reflect, Object, Proxy, Date} = globalThis

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

        if (!Realm.active || _active) {
          return Reflect[op](...args);
        }

        let output;
        try {
          Realm.active = Realm.wrap = Realm.fallback = false

          output = Realm.travel[op]?.(...args)

          if(_date != Date.now()){
            _date = Date.now()
            _boot = true
          } 

          if(_boot){
            let [_,key,value] = args
            
            if(op == "set"){
              output = !!(_store[key] = value)
            }
            
            if(op == "get"){
              output = _store[key]
              if (key=="Date") {
                _boot = false
                _store = {}
              }
            }

            return output
          }
          
          if (Realm.fallback && output == void 0) { 
            _active = true;
            try {
              output = Reflect[op](...args)
            } finally {
              _active = false;
            }
          }

          if (Realm.wrap && !_wrap) {
            _wrap = true;
            try {
              output = new Proxy(output, handler);
            } finally {
              _wrap = false;
            }
          }
      
          return output;
        } finally {
          Realm.active = Realm.wrap = Realm.fallback = true
        }
      }])
    );

    Reflect.ownKeys(globalThis).forEach(k => {
      if (k === 'globalThis') return
      try { delete globalThis[k] } catch(e) {}
    })

    globalThis.__proto__ = new Proxy(snapshot, handler)
    Realm.ONE = true
  }
}
