package uz.views.development;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Color;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
  private WebView web;
  private String allowedHost;
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setPadding(18, 22, 18, 12);
    root.setBackgroundColor(Color.rgb(246,245,242));
    TextView title = new TextView(this);
    title.setText("VIEWS  ·  DEVELOPMENT");
    title.setTextSize(20);
    title.setTextColor(Color.rgb(26,29,36));
    root.addView(title);
    TextView warning = new TextView(this);
    warning.setText("Тестовая версия. Укажите адрес закрытого HTTPS-сервера VIEWS. Реальные платежи отключены.");
    warning.setTextSize(13);
    root.addView(warning);
    EditText endpoint = new EditText(this);
    endpoint.setSingleLine(true);
    endpoint.setHint("https://staging.example.com/guest");
    endpoint.setText(getPreferences(MODE_PRIVATE).getString("staging_url",""));
    root.addView(endpoint);
    Button connect = new Button(this);
    connect.setText("Подключить тестовый сервер");
    root.addView(connect);
    web = new WebView(this);
    web.setVisibility(View.GONE);
    root.addView(web, new LinearLayout.LayoutParams(-1,0,1));
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setDomStorageEnabled(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
    web.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView view,android.webkit.WebResourceRequest request){
        Uri uri=request.getUrl();
        if("https".equalsIgnoreCase(uri.getScheme()) && allowedHost!=null && allowedHost.equalsIgnoreCase(uri.getHost())) return false;
        if("https".equalsIgnoreCase(uri.getScheme())) startActivity(new Intent(Intent.ACTION_VIEW,uri));
        return true;
      }
    });
    connect.setOnClickListener(v->{
      try {
        Uri uri=Uri.parse(endpoint.getText().toString().trim());
        if(!"https".equalsIgnoreCase(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null) throw new IllegalArgumentException();
        allowedHost=uri.getHost();
        String value=uri.toString();
        getPreferences(MODE_PRIVATE).edit().putString("staging_url",value).apply();
        web.setVisibility(View.VISIBLE);
        web.loadUrl(value);
      } catch(Exception ex) { warning.setText("Только действительный HTTPS-адрес закрытого тестового сервера."); }
    });
    setContentView(root);
  }
  @Override public void onBackPressed() {
    if(web!=null && web.canGoBack()) web.goBack(); else super.onBackPressed();
  }
  @Override protected void onDestroy() { if(web!=null) web.destroy(); super.onDestroy(); }
}
