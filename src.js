let window = Object.create(null)

let snapshot = function (obj) {
  return Reflect.ownKeys(obj).reduce(function(o, k) {
    try { o[k] = obj[k] } catch(e) {}
    return o
  }, {})
}

let Realm = class {
  static TRAPS = Object.getOwnPropertyNames(Reflect)
  static ONE = false
  static active = false
  static wrap = false
  static fallback = false
  static travel = void 0

  constructor(travel={}) {
    if(Realm.ONE){return}
    Realm.travel = travel;
    let [_active, _wrap, _boot, _date, _store] = [!0, !1, !1, 0, {}]
    let globalThis = (0,eval)("globalThis.globalThis")
    let {Reflect, Object, Proxy, Date} = globalThis
    let handler = Object.fromEntries(
      Realm.TRAPS.map(op => [op, (...args) => {
        let output;
        let err;
        try {
          Realm.active = Realm.wrap = Realm.fallback = false

          try{
            err = false
            output = Realm.travel[op]?.(...args)
          }catch(e){
            err = true
            output = e
          }
            
          if(_date != Date.now()){
            _date = Date.now()
            _boot = true
          };

          if(_boot){
            let [_,key,value] = args
            if(op == "set"){
              output = !!(_store[key] = value)
            };
            if(op == "get"){
              output = _store[key]
              if (key=="Date") {
                _boot = false
                _store = {}
              }
            }
            return output
          };
            
          if(!err){
            if (Realm.fallback && output == void 0) { 
              _active = true;
              try {
                output = Reflect[op](...args)
              } finally {
                _active = false;
              }
            };
              
            if (Realm.wrap && !_wrap) {
              _wrap = true;
              try {
                output = new Proxy(output, handler);
              } finally {
                _wrap = false;
              }
            };

            return output;
          }else{
            throw output
          }
        } finally {
          Realm.active = Realm.wrap = Realm.fallback = true
        }
      }])
    );
    const HANDLE = new Proxy({}, {
      get(_, prop) {
        return (!Realm.active || _active) ? undefined : handler[prop]
      }
    });
    ["Array","Object","String","Number","Boolean","RegExp","Function"].forEach(key => {
        Reflect.setPrototypeOf(globalThis[key].prototype, new Proxy(snapshot(globalThis[key].prototype), HANDLE))
        Reflect.ownKeys(globalThis[key].prototype).filter(k=>key === "Array" && k !== "push").forEach(k => {
        try { Reflect.deleteProperty(globalThis[key].prototype, k) } catch(e) {}
        })
    });
    Reflect.setPrototypeOf(globalThis, new Proxy(snapshot(globalThis), HANDLE))
    Reflect.ownKeys(globalThis).filter(k=>k !== "globalThis").forEach(k => {
      try { Reflect.deleteProperty(globalThis, k) } catch(e) {}
    });
    Realm.ONE = true
    _active = false
    Realm.active = true
  }
}
