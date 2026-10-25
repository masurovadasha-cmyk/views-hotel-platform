package uz.views.review;
public final class NativeBackGateTest {
  private static void check(boolean condition){if(!condition)throw new AssertionError();}
  public static void main(String[] args){
    NativeBackGate gate=new NativeBackGate();long request=gate.begin();check(request>0);check(gate.begin()==0);
    check(!gate.complete(request+1,"true"));check(gate.begin()==0);check(!gate.complete(request,"false"));
    for(String malformed:new String[]{null,"null","undefined","1","\"true\""," true ","{}",""})check(!gate.complete(gate.begin(),malformed));
    check(gate.complete(gate.begin(),"true"));check(!gate.complete(request,"true"));
    long stale=gate.begin();gate.invalidate();long fresh=gate.begin();check(!gate.complete(stale,"true"));check(gate.begin()==0);check(gate.complete(fresh,"true"));
    System.out.println("Native Back gate: deny, pending, exact true, malformed and stale callbacks PASS");
  }
}
