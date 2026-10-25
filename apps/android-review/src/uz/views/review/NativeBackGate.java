package uz.views.review;

/** Exact boolean handshake only; no JavaScript interface or asynchronous permission cache. */
final class NativeBackGate {
  static final String SCRIPT = "(function(){try{var guard=window.__viewsAllowNativeBack;return typeof guard==='undefined'?true:typeof guard==='function'&&guard()===true;}catch(error){return false;}})()";
  private long generation;
  private boolean pending;
  long begin(){if(pending)return 0;pending=true;return ++generation;}
  boolean complete(long request,String value){
    if(!pending||request!=generation)return false;
    pending=false;
    return "true".equals(value);
  }
  void invalidate(){pending=false;generation++;}
}
