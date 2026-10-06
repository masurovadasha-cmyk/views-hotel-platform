package uz.views.review;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/** Review shell only. The web assets are produced by the existing VIEWS build. */
public final class MainActivity extends Activity {
  private static final String HOST="appassets.androidplatform.net";
  private static final String PREFIX="/views-hotel-platform/";
  private static final String HOME="https://"+HOST+PREFIX;
  private WebView web;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout root=new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(Color.rgb(246,245,242));
    // Keep the review label visible, including when the web app is in dark mode.
    TextView banner=new TextView(this);
    banner.setText("VIEWS · ПРОВЕРОЧНАЯ СБОРКА · ДЕМО");
    banner.setTextSize(11);
    banner.setTextColor(Color.rgb(168,139,88));
    banner.setBackgroundColor(Color.rgb(26,29,36));
    int pad=(int)(10*getResources().getDisplayMetrics().density);
    banner.setPadding(pad,pad,pad,pad);
    banner.setOnClickListener(v->new AlertDialog.Builder(this)
      .setTitle("VIEWS Review")
      .setMessage("Проверка интерфейса VIEWS 0.7.17. Данные демонстрационные. Реальные платежи, вход и серверная синхронизация не подключены. Не вводите паспорта, карты и другие реальные персональные данные.")
      .setPositiveButton("Понятно",null).show());
    root.addView(banner);
    web=new WebView(this);
    root.addView(web,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1));
    setContentView(root);
    root.setOnApplyWindowInsetsListener((v,insets)->{
      v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
      return insets.consumeSystemWindowInsets();
    });
    WebView.setWebContentsDebuggingEnabled(false);
    WebSettings settings=web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setAllowFileAccessFromFileURLs(false);
    settings.setAllowUniversalAccessFromFileURLs(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setSafeBrowsingEnabled(true);
    settings.setJavaScriptCanOpenWindowsAutomatically(false);
    settings.setSupportMultipleWindows(false);
    settings.setMediaPlaybackRequiresUserGesture(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
    web.setWebChromeClient(new WebChromeClient());
    web.setWebViewClient(new WebViewClient(){
      @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
        Uri uri=request.getUrl();
        if(!HOST.equals(uri.getHost()))return null;
        if(!"https".equals(uri.getScheme())||!"GET".equals(request.getMethod()))return denied();
        String path=uri.getPath();
        if(path==null||!path.startsWith(PREFIX)||path.indexOf('\\')>=0||path.indexOf('\u0000')>=0)return denied();
        for(String part:path.split("/"))if(part.equals("..")||part.equals("."))return denied();
        String asset=path.substring(PREFIX.length());
        if(asset.isEmpty())asset="index.html";
        try {
          InputStream bytes=getAssets().open("www/"+asset);
          String mime=mime(asset);
          Map<String,String> headers=new HashMap<>();
          headers.put("X-Content-Type-Options","nosniff");
          headers.put("Cache-Control","no-store");
          return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,bytes);
        }catch(Exception error){return denied();}
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
        Uri uri=request.getUrl();
        if("https".equals(uri.getScheme())&&HOST.equals(uri.getHost())&&uri.getPath()!=null&&uri.getPath().startsWith(PREFIX))return false;
        // No custom schemes, intents, filesystem access or JavaScript bridge.
        if(request.isForMainFrame()&&"https".equals(uri.getScheme())){
          new AlertDialog.Builder(MainActivity.this).setTitle("Внешняя ссылка")
            .setMessage("Открыть внешний сайт в браузере?")
            .setPositiveButton("Открыть",(d,w)->{try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}})
            .setNegativeButton("Отмена",null).show();
        }
        return true;
      }
    });
    web.loadUrl(HOME);
  }
  private static WebResourceResponse denied(){
    return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",new HashMap<String,String>(),new ByteArrayInputStream(new byte[0]));
  }
  private static String mime(String path){
    if(path.endsWith(".html"))return "text/html";
    if(path.endsWith(".js")||path.endsWith(".mjs"))return "application/javascript";
    if(path.endsWith(".css"))return "text/css";
    if(path.endsWith(".json"))return "application/json";
    if(path.endsWith(".svg"))return "image/svg+xml";
    if(path.endsWith(".png"))return "image/png";
    if(path.endsWith(".jpg")||path.endsWith(".jpeg"))return "image/jpeg";
    if(path.endsWith(".webp"))return "image/webp";
    if(path.endsWith(".woff2"))return "font/woff2";
    if(path.endsWith(".woff"))return "font/woff";
    return "application/octet-stream";
  }
  @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
  @Override protected void onPause(){web.onPause();super.onPause();}
  @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
  @Override protected void onDestroy(){if(web!=null)web.destroy();super.onDestroy();}
}
