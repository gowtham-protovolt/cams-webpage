#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <time.h>
#include <sys/time.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_NeoPixel.h>

// OLED
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64
#define OLED_SDA      1
#define OLED_SCL      2
#define OLED_ADDR     0x3C

// Hardware pins
#define BUTTON_PIN    3   // External button: connect between GPIO3 and GND
#define LED_PIN       4   // WS2812 data; physically connect to GPIO4
#define LED_COUNT     8

void beginTimeEditor();

// ---------- WiFi provisioning (setup portal) ----------
const char* AP_SSID = "CAMS-Setup";           // Hotspot name shown on the phone (open network)
const uint32_t FACTORY_HOLD_MS = 10000;       // Hold time for factory reset

// Defaults saved after Factory Reset (and on a brand new device)
const char* DEFAULT_WIFI_SSID = "admin";
const char* DEFAULT_WIFI_PASS = "admin@123";

String wifiSsid = DEFAULT_WIFI_SSID;
String wifiPass = DEFAULT_WIFI_PASS;
bool wifiConfigured = false;      // true only after user saves WiFi from the web page
bool provisioningMode = false;
String portalNetworks = "";                   // <option> list built from scan

WebServer webServer(80);
DNSServer dnsServer;

// India Standard Time
const long GMT_OFFSET_SECONDS = 19800;
const int DAYLIGHT_OFFSET_SECONDS = 0;

// Faster button timing
const uint32_t BUTTON_DEBOUNCE_MS = 25;
const uint32_t DOUBLE_PRESS_MS = 250;
const uint32_t LONG_PRESS_MS = 800;

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
Adafruit_NeoPixel statusLed(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
Preferences preferences;

// Set these from your MQTT and RS485 code.
bool mqttConnected = false;
bool rs485Connected = false;

// Screens
enum Screen : uint8_t {
  SCREEN_DASHBOARD,
  SCREEN_SETTINGS,
  SCREEN_WIFI_INFO,
  SCREEN_MQTT_INFO,
  SCREEN_TIME_CONFIG,
  SCREEN_DATE_CONFIG,
  SCREEN_WIFI_SCAN,
  SCREEN_FACTORY_RESET,
  SCREEN_PROVISION
};

Screen currentScreen = SCREEN_DASHBOARD;
uint8_t menuIndex = 0;

const char* menuItems[] = {
  "WiFi Settings",
  "MQTT Settings",
  "Time Configuration",
  "Date Configuration",
  "Factory Reset"
};
const uint8_t MENU_COUNT = sizeof(menuItems) / sizeof(menuItems[0]);

// WiFi scan results
String scanNames[8];
int scanCount = 0;
int scanIndex = 0;
bool wifiScanRunning = false;

// Factory reset hold tracking
uint8_t factoryProgress = 0;      // 0..100
bool factoryHoldValid = false;    // true only for a press that started on the reset screen

// Time/date editor
bool editing = false;
uint8_t editField = 0;
int editHour = 12;
int editMinute = 0;
int editSecond = 0;
bool editPM = false;

int editDay = 1;
int editMonth = 1;
int editYear = 2026;

// Button state
bool rawButtonLast = HIGH;
bool stableButton = HIGH;
uint32_t lastDebounceAt = 0;
uint32_t pressStartedAt = 0;
uint32_t lastReleaseAt = 0;
bool longPressHandled = false;
bool waitingForSecondPress = false;

// Timers
uint32_t lastDisplayRefresh = 0;
uint32_t lastWifiRetry = 0;
uint32_t lastCursorBlinkAt = 0;
bool editCursorVisible = true;
const uint32_t CURSOR_BLINK_MS = 450;

// CAMS logo bitmap, 84x32 pixels
const uint8_t CAMS_LOGO[] PROGMEM = {
  0x01, 0xF8, 0x00, 0x0A, 0x80, 0x05, 0x00, 0x15, 0x00, 0x7E, 0x00, 0x07,
  0xFF, 0x00, 0x1F, 0x80, 0x0F, 0xC0, 0x3F, 0x01, 0xFF, 0x80, 0x1F, 0xFF,
  0x80, 0x1F, 0xC0, 0x0F, 0xC0, 0x3F, 0x03, 0xFF, 0xC0, 0x3F, 0xFF, 0xC0,
  0x3F, 0xC0, 0x0F, 0xE0, 0x7F, 0x07, 0xFF, 0xE0, 0x3F, 0xFF, 0xE0, 0x3F,
  0xC0, 0x1F, 0xE0, 0x7F, 0x87, 0xF7, 0xE0, 0x7F, 0x0F, 0xE0, 0x3F, 0xE0,
  0x1F, 0xF0, 0xFF, 0x0F, 0xC3, 0xE0, 0x7E, 0x03, 0xF0, 0x7F, 0xE0, 0x1F,
  0xF0, 0xFF, 0x87, 0xC2, 0x40, 0xFC, 0x03, 0xF0, 0x7F, 0xF0, 0x1F, 0xF1,
  0xFF, 0x87, 0xF8, 0x00, 0xFC, 0x00, 0x00, 0xFB, 0xF0, 0x1F, 0xF9, 0xFF,
  0x87, 0xFF, 0x00, 0xF8, 0x00, 0x00, 0xF9, 0xF0, 0x1F, 0x7B, 0xFF, 0x83,
  0xFF, 0xC0, 0xFC, 0x00, 0x00, 0xF9, 0xF8, 0x3F, 0x7F, 0xEF, 0x81, 0xFF,
  0xE0, 0xFC, 0x01, 0x51, 0xF0, 0xF8, 0x1F, 0x7F, 0xCF, 0xC0, 0x7F, 0xE0,
  0xFC, 0x03, 0xF1, 0xF0, 0xFC, 0x3E, 0x3F, 0xCF, 0x80, 0x07, 0xF0, 0x7E,
  0x03, 0xF3, 0xF0, 0xFC, 0x3F, 0x3F, 0xC7, 0xC6, 0x83, 0xF0, 0x7F, 0x07,
  0xE3, 0xE0, 0x7C, 0x3E, 0x1F, 0x8F, 0xCF, 0xC3, 0xF0, 0x7F, 0xFF, 0xE3,
  0xE0, 0x7E, 0x3E, 0x1F, 0x87, 0xC7, 0xF7, 0xE0, 0x3F, 0xFF, 0xC7, 0xE0,
  0x7E, 0x3E, 0x0F, 0x07, 0xC7, 0xFF, 0xE0, 0x1F, 0xFF, 0x87, 0xC0, 0x3F,
  0x7E, 0x0F, 0x07, 0xC7, 0xFF, 0xE0, 0x07, 0xFF, 0x0F, 0xC0, 0x3F, 0x3E,
  0x06, 0x07, 0xE1, 0xFF, 0xC0, 0x03, 0xFC, 0x0B, 0x80, 0x1B, 0x6C, 0x06,
  0x03, 0x40, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
  0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x50,
  0x00, 0x00, 0x00, 0x00, 0x02, 0x03, 0x00, 0x00, 0x68, 0xD0, 0xF8, 0x41,
  0x08, 0x42, 0x84, 0x0E, 0x01, 0x42, 0x40, 0x71, 0xE0, 0x48, 0xF3, 0x68,
  0xF1, 0x8F, 0x1E, 0x03, 0xC6, 0x80, 0x68, 0x20, 0xF9, 0x91, 0xF9, 0xB3,
  0x0F, 0x12, 0x01, 0x63, 0x80, 0xE0, 0x60, 0xC0, 0xF0, 0xB0, 0xC1, 0x0C,
  0x1E, 0x03, 0x61, 0x80, 0x68, 0x40, 0x00, 0x40, 0x90, 0x61, 0x06, 0x0A,
  0x01, 0x83, 0x00, 0x30, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x06, 0x00, 0x00, 0x00
};

// ---------- Utility ----------

int daysInMonth(int month, int year)
{
  switch (month) {
    case 4: case 6: case 9: case 11:
      return 30;
    case 2:
      if ((year % 4 == 0 && year % 100 != 0) || (year % 400 == 0))
        return 29;
      return 28;
    default:
      return 31;
  }
}

void loadCurrentTimeIntoEditor()
{
  struct tm t;
  if (getLocalTime(&t, 100)) {
    int hour24 = t.tm_hour;
    editPM = (hour24 >= 12);
    editHour = hour24 % 12;
    if (editHour == 0) editHour = 12;
    editMinute = t.tm_min;
    editSecond = t.tm_sec;
    editDay = t.tm_mday;
    editMonth = t.tm_mon + 1;
    editYear = t.tm_year + 1900;
  }
}

void beginTimeEditor()
{
  loadCurrentTimeIntoEditor();
  editing = false;
  editField = 0;
}

void saveEditedTime()
{
  int hour24 = editHour % 12;
  if (editPM) hour24 += 12;

  struct tm t = {};
  t.tm_year = editYear - 1900;
  t.tm_mon = editMonth - 1;
  t.tm_mday = editDay;
  t.tm_hour = hour24;
  t.tm_min = editMinute;
  t.tm_sec = editSecond;

  setenv("TZ", "IST-5:30", 1);
  tzset();

  time_t epoch = mktime(&t);
  struct timeval now = {};
  now.tv_sec = epoch;
  settimeofday(&now, nullptr);

  preferences.begin("device", false);
  preferences.putInt("hour", editHour);
  preferences.putInt("minute", editMinute);
  preferences.putInt("second", editSecond);
  preferences.putBool("pm", editPM);
  preferences.putInt("day", editDay);
  preferences.putInt("month", editMonth);
  preferences.putInt("year", editYear);
  preferences.end();
}

// ---------- Saved WiFi credentials ----------

void loadWifiCredentials()
{
  preferences.begin("wifi", true);
  wifiSsid = preferences.getString("ssid", DEFAULT_WIFI_SSID);
  wifiPass = preferences.getString("pass", DEFAULT_WIFI_PASS);
  wifiConfigured = preferences.getBool("set", false);
  preferences.end();
}

void saveWifiCredentials(const String& ssid, const String& pass)
{
  preferences.begin("wifi", false);
  preferences.putString("ssid", ssid);
  preferences.putString("pass", pass);
  preferences.putBool("set", true);
  preferences.end();
}

// Factory reset: store default WiFi (admin / admin@123) and mark as NOT configured,
// so the setup web server runs on next boot.
void resetWifiToDefaults()
{
  preferences.begin("wifi", false);
  preferences.clear();
  preferences.putString("ssid", DEFAULT_WIFI_SSID);
  preferences.putString("pass", DEFAULT_WIFI_PASS);
  preferences.putBool("set", false);
  preferences.end();
}

// ---------- Factory reset ----------

void drawFactoryReset()
{
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.print("FACTORY RESET");
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  display.setCursor(0, 14);
  display.print("Erase saved WiFi and");
  display.setCursor(0, 24);
  display.print("start setup mode");

  display.setCursor(0, 36);
  display.print("Hold button 10 sec");

  display.drawRect(0, 46, 128, 8, SSD1306_WHITE);
  int w = (126 * factoryProgress) / 100;
  if (w > 0) display.fillRect(1, 47, w, 6, SSD1306_WHITE);

  display.setCursor(0, 56);
  display.print("Double press: cancel");
  display.display();
}

void factoryReset()
{
  resetWifiToDefaults();

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 16);
  display.print("WiFi set to default");
  display.setCursor(0, 30);
  display.print("Restarting...");
  display.display();

  WiFi.disconnect(true, true);
  delay(1500);
  ESP.restart();
}

// Hold the button while powering on for 10 sec to factory reset
// (backup way if the saved WiFi is wrong and settings can't be reached).
void checkBootFactoryReset()
{
  if (digitalRead(BUTTON_PIN) != LOW) return;

  uint32_t start = millis();
  uint8_t lastP = 255;
  while (digitalRead(BUTTON_PIN) == LOW) {
    uint32_t held = millis() - start;
    uint32_t p = (held * 100) / FACTORY_HOLD_MS;
    if (p > 100) p = 100;
    if (p != lastP) {
      lastP = p;
      factoryProgress = p;
      drawFactoryReset();
    }
    if (held >= FACTORY_HOLD_MS) factoryReset();
    delay(20);
  }
  factoryProgress = 0;
}

// ---------- Setup portal (web server) ----------

String htmlEscape(const String& s)
{
  String out;
  out.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '&') out += "&amp;";
    else if (c == '<') out += "&lt;";
    else if (c == '>') out += "&gt;";
    else if (c == '"') out += "&quot;";
    else if (c == '\'') out += "&#39;";
    else out += c;
  }
  return out;
}

void scanForPortal()
{
  portalNetworks = "";
  int n = WiFi.scanNetworks();
  for (int i = 0; i < n && i < 20; i++) {
    String name = WiFi.SSID(i);
    if (name.length() == 0) continue;
    String opt = "<option value=\"" + htmlEscape(name) + "\">";
    if (portalNetworks.indexOf(opt) >= 0) continue;
    portalNetworks += opt;
  }
  WiFi.scanDelete();
}

const char PAGE_HEAD[] PROGMEM =
  "<!DOCTYPE html><html><head><meta charset='utf-8'>"
  "<meta name='viewport' content='width=device-width,initial-scale=1'>"
  "<title>CAMS WiFi Setup</title><style>"
  "body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:20px}"
  ".c{max-width:380px;margin:auto;background:#1e293b;padding:24px;border-radius:12px}"
  "h2{margin-top:0}label{font-size:14px;color:#94a3b8}"
  "input{width:100%;padding:12px;margin:6px 0 14px;border-radius:8px;"
  "border:1px solid #475569;background:#0f172a;color:#fff;box-sizing:border-box;font-size:16px}"
  "button{width:100%;padding:12px;border:0;border-radius:8px;background:#2563eb;"
  "color:#fff;font-size:16px}a{color:#60a5fa}.e{color:#f87171}"
  "</style></head><body><div class='c'>";

void handleRoot()
{
  String page = FPSTR(PAGE_HEAD);
  page += "<h2>CAMS WiFi Setup</h2>"
          "<form method='POST' action='/save'>"
          "<label>WiFi name (SSID)</label>"
          "<input name='ssid' list='nets' maxlength='32' required autocomplete='off'>"
          "<datalist id='nets'>";
  page += portalNetworks;
  page += "</datalist>"
          "<label>Password (leave empty for open WiFi)</label>"
          "<input name='pass' type='password' maxlength='63'>"
          "<button type='submit'>Save &amp; Connect</button></form>"
          "<p><a href='/rescan'>Rescan networks</a></p>"
          "</div></body></html>";
  webServer.send(200, "text/html", page);
}

void handleRescan()
{
  scanForPortal();
  webServer.sendHeader("Location", "http://192.168.4.1/", true);
  webServer.send(302, "text/plain", "");
}

void handleSave()
{
  String ssid = webServer.arg("ssid");
  String pass = webServer.arg("pass");
  ssid.trim();

  String page = FPSTR(PAGE_HEAD);

  if (ssid.length() == 0 || ssid.length() > 32 ||
      (pass.length() != 0 && (pass.length() < 8 || pass.length() > 63))) {
    page += "<h2 class='e'>Invalid input</h2>"
            "<p>SSID is required. Password must be 8 to 63 characters "
            "(or empty for an open network).</p>"
            "<p><a href='/'>Go back</a></p></div></body></html>";
    webServer.send(200, "text/html", page);
    return;
  }

  saveWifiCredentials(ssid, pass);

  page += "<h2>Saved</h2><p>Connecting to <b>";
  page += htmlEscape(ssid);
  page += "</b>. The device is restarting, you can close this page and "
          "reconnect your phone to your normal WiFi.</p></div></body></html>";
  webServer.send(200, "text/html", page);

  delay(2000);
  ESP.restart();
}

void handleNotFound()
{
  // Captive portal: send every unknown URL to the setup page
  webServer.sendHeader("Location", "http://192.168.4.1/", true);
  webServer.send(302, "text/plain", "");
}

void startProvisioning()
{
  provisioningMode = true;

  WiFi.disconnect(true);
  WiFi.mode(WIFI_AP_STA);
  delay(100);

  scanForPortal();

  WiFi.softAP(AP_SSID);        // open hotspot, like a fresh router
  delay(200);

  dnsServer.start(53, "*", WiFi.softAPIP());

  webServer.on("/", HTTP_GET, handleRoot);
  webServer.on("/rescan", HTTP_GET, handleRescan);
  webServer.on("/save", HTTP_POST, handleSave);
  webServer.onNotFound(handleNotFound);
  webServer.begin();

  currentScreen = SCREEN_PROVISION;
}

void drawProvision()
{
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.print("WIFI SETUP MODE");
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  display.setCursor(0, 14);
  display.print("1. Phone WiFi ->");
  display.setCursor(12, 24);
  display.print(AP_SSID);
  display.setCursor(0, 36);
  display.print("2. Open browser:");
  display.setCursor(12, 46);
  display.print("192.168.4.1");
  display.setCursor(0, 56);
  display.print("3. Enter WiFi & Save");
  display.display();
}

// ---------- WiFi scan ----------

void startWifiScan()
{
  if (wifiScanRunning) return;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("SCANNING WIFI...");
  display.display();

  scanCount = 0;
  scanIndex = 0;
  WiFi.scanDelete();

  // Async scan: returns immediately.
  int result = WiFi.scanNetworks(true, true);

  if (result == WIFI_SCAN_FAILED) {
    wifiScanRunning = false;
    currentScreen = SCREEN_WIFI_INFO;
  } else {
    wifiScanRunning = true;
    currentScreen = SCREEN_WIFI_SCAN;
  }
}

void pollWifiScan()
{
  if (!wifiScanRunning) return;

  int result = WiFi.scanComplete();

  if (result == WIFI_SCAN_RUNNING) return;

  wifiScanRunning = false;
  scanCount = 0;

  if (result > 0) {
    for (int i = 0; i < result && scanCount < 8; i++) {
      scanNames[scanCount++] = WiFi.SSID(i);
    }
  }

  WiFi.scanDelete();
  scanIndex = 0;
  currentScreen = SCREEN_WIFI_SCAN;
  drawCurrentScreen();
}

// ---------- Dashboard icons ----------

void drawWifiIcon(int x, int y, bool connected)
{
  if (connected) {
    int rssi = WiFi.RSSI();
    uint8_t bars;

    if (rssi >= -70)      bars = 4;
    else if (rssi >= -85) bars = 3;
    else if (rssi >= -95) bars = 2;
    else                  bars = 1;

    const int baseline = y + 22;
    const int heights[4] = {5, 10, 15, 20};

    for (uint8_t i = 0; i < bars; i++) {
      display.fillRect(x + i * 5, baseline - heights[i],
                       3, heights[i], SSD1306_WHITE);
    }
  } else {
    display.drawLine(x + 2, y + 7, x + 10, y + 1, SSD1306_WHITE);
    display.drawLine(x + 10, y + 1, x + 18, y + 7, SSD1306_WHITE);
    display.drawLine(x + 5, y + 12, x + 10, y + 8, SSD1306_WHITE);
    display.drawLine(x + 10, y + 8, x + 15, y + 12, SSD1306_WHITE);
    display.fillCircle(x + 10, y + 17, 2, SSD1306_WHITE);
    display.drawLine(x + 1, y + 1, x + 19, y + 20, SSD1306_WHITE);
  }
}

void drawMqttIcon(int x, int y, bool connected)
{
  display.drawCircle(x + 6, y + 12, 4, SSD1306_WHITE);
  display.drawCircle(x + 12, y + 9, 6, SSD1306_WHITE);
  display.drawCircle(x + 19, y + 12, 4, SSD1306_WHITE);
  display.drawLine(x + 3, y + 15, x + 22, y + 15, SSD1306_WHITE);
  display.drawLine(x + 12, y + 14, x + 12, y + 5, SSD1306_WHITE);
  display.drawLine(x + 12, y + 5, x + 9, y + 8, SSD1306_WHITE);
  display.drawLine(x + 12, y + 5, x + 15, y + 8, SSD1306_WHITE);

  if (!connected)
    display.drawLine(x + 2, y + 1, x + 22, y + 20, SSD1306_WHITE);
}

void drawRs485Icon(int x, int y, bool connected)
{
  display.drawRect(x + 1, y + 3, 22, 14, SSD1306_WHITE);
  display.drawLine(x + 5, y + 10, x + 19, y + 10, SSD1306_WHITE);
  display.drawLine(x + 5, y + 10, x + 8, y + 7, SSD1306_WHITE);
  display.drawLine(x + 5, y + 10, x + 8, y + 13, SSD1306_WHITE);
  display.drawLine(x + 19, y + 10, x + 16, y + 7, SSD1306_WHITE);
  display.drawLine(x + 19, y + 10, x + 16, y + 13, SSD1306_WHITE);

  if (!connected)
    display.drawLine(x, y + 1, x + 24, y + 20, SSD1306_WHITE);
}

// ---------- Dashboard ----------

void drawDateTime()
{
  struct tm timeInfo;
  display.drawLine(0, 49, 127, 49, SSD1306_WHITE);
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  if (getLocalTime(&timeInfo, 100)) {
    char dateText[11];
    char timeText[10];
    strftime(dateText, sizeof(dateText), "%d/%m/%Y", &timeInfo);
    strftime(timeText, sizeof(timeText), "%I:%M %p", &timeInfo);

    display.setCursor(0, 54);
    display.print(dateText);
    display.setCursor(76, 54);
    display.print(timeText);
  } else {
    display.setCursor(25, 54);
    display.print("Time syncing");
  }
}

void drawDashboard()
{
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.print("DASHBOARD");
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  bool wifiOK = (WiFi.status() == WL_CONNECTED);
  drawWifiIcon(11, 13, wifiOK);
  drawMqttIcon(52, 13, mqttConnected);
  drawRs485Icon(95, 13, rs485Connected);

  display.drawLine(42, 12, 42, 46, SSD1306_WHITE);
  display.drawLine(84, 12, 84, 46, SSD1306_WHITE);

  drawDateTime();
  display.display();
}

// ---------- Settings pages ----------

void drawSettingsMenu()
{
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.print("SETTINGS");
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  // Show 4 rows at a time and scroll when the selection goes below row 4
  const uint8_t VISIBLE_ROWS = 4;
  uint8_t first = (menuIndex >= VISIBLE_ROWS) ? (menuIndex - VISIBLE_ROWS + 1) : 0;

  for (uint8_t row = 0; row < VISIBLE_ROWS && (first + row) < MENU_COUNT; row++) {
    uint8_t i = first + row;
    int y = 12 + row * 12;

    if (i == menuIndex) {
      display.fillRect(0, y, 128, 11, SSD1306_WHITE);
      display.setTextColor(SSD1306_BLACK);
    } else {
      display.setTextColor(SSD1306_WHITE);
    }

    display.setCursor(4, y + 2);
    display.print(menuItems[i]);
    display.setCursor(119, y + 2);
    display.print(">");

    display.setTextColor(SSD1306_WHITE);
  }

  display.display();
}

void drawWifiInfo()
{
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.print("WIFI SETTINGS");
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  display.setCursor(0, 16);
  display.print("SSID: ");
  String shown = wifiSsid;
  if (shown.length() > 15) shown = shown.substring(0, 15);
  display.println(shown);

  display.setCursor(0, 28);
  if (WiFi.status() == WL_CONNECTED) {
    display.print("Status: Connected");
    display.setCursor(0, 39);
    display.print("RSSI: ");
    display.print(WiFi.RSSI());
    display.print(" dBm");
  } else {
    display.print("Status: Connecting");
  }

  display.setCursor(0, 53);
  display.print("Hold: Scan networks");
  display.display();
}

void drawWifiScan()
{
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.print("WIFI SCAN");
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  if (wifiScanRunning) {
    display.setCursor(0, 23);
    display.print("Scanning...");
  } else if (scanCount == 0) {
    display.setCursor(0, 20);
    display.print("No networks found");
  } else {
    int start = scanIndex;
    for (int row = 0; row < 4 && start + row < scanCount; row++) {
      int y = 12 + row * 11;

      if (row == 0) {
        display.fillRect(0, y, 128, 10, SSD1306_WHITE);
        display.setTextColor(SSD1306_BLACK);
      }

      display.setCursor(3, y + 1);
      String name = scanNames[start + row];
      if (name.length() > 19) name = name.substring(0, 19);
      display.print(name);

      display.setTextColor(SSD1306_WHITE);
    }
  }

  display.setCursor(0, 54);
  display.print("Change: Factory Reset");
  display.display();
}

void drawMqttInfo()
{
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("MQTT SETTINGS");
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);
  display.setCursor(0, 18);
  display.print("Status: ");
  display.print(mqttConnected ? "Connected" : "Not config");
  display.setCursor(0, 32);
  display.print("Broker: set in code");
  display.setCursor(0, 46);
  display.print("Topic: set in code");
  display.display();
}

void drawTimeConfig()
{
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.print("TIME CONFIGURATION");
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  display.setCursor(8, 20);
  display.print((editField == 0 && (!editing || editCursorVisible)) ? ">" : " ");
  if (editHour < 10) display.print("0");
  display.print(editHour);

  display.setCursor(44, 20);
  display.print((editField == 1 && (!editing || editCursorVisible)) ? ">" : " ");
  if (editMinute < 10) display.print("0");
  display.print(editMinute);

  display.setCursor(80, 20);
  display.print((editField == 2 && (!editing || editCursorVisible)) ? ">" : " ");
  if (editSecond < 10) display.print("0");
  display.print(editSecond);

  display.setCursor(8, 36);
  display.print((editField == 3 && (!editing || editCursorVisible)) ? ">" : " ");
  display.print(editPM ? "PM" : "AM");

  display.setCursor(70, 36);
  display.print((editField == 4 && (!editing || editCursorVisible)) ? ">" : " ");
  display.print("Save");

  display.setCursor(0, 54);
  display.print(editing ? "Short: ch Hold: next" : "Hold: edit Double: back");
  display.display();
}

void drawDateConfig()
{
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.print("DATE CONFIGURATION");
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  display.setCursor(5, 15);
  display.print(" DD     MM     YYYY");

  display.setCursor(8, 29);
  display.print((editField == 0 && (!editing || editCursorVisible)) ? ">" : " ");
  if (editDay < 10) display.print("0");
  display.print(editDay);

  display.setCursor(48, 29);
  display.print((editField == 1 && (!editing || editCursorVisible)) ? ">" : " ");
  if (editMonth < 10) display.print("0");
  display.print(editMonth);

  display.setCursor(87, 29);
  display.print((editField == 2 && (!editing || editCursorVisible)) ? ">" : " ");
  display.print(editYear);

  display.setCursor(49, 43);
  display.print((editField == 3 && (!editing || editCursorVisible)) ? ">" : " ");
  display.print("Save");

  display.setCursor(0, 52);
  display.print(editing ? "Short: ch Hold: next" : "Hold: edit Double: back");
  display.display();
}

void drawCurrentScreen()
{
  switch (currentScreen) {
    case SCREEN_DASHBOARD:    drawDashboard(); break;
    case SCREEN_SETTINGS:     drawSettingsMenu(); break;
    case SCREEN_WIFI_INFO:    drawWifiInfo(); break;
    case SCREEN_MQTT_INFO:    drawMqttInfo(); break;
    case SCREEN_TIME_CONFIG:  drawTimeConfig(); break;
    case SCREEN_DATE_CONFIG:  drawDateConfig(); break;
    case SCREEN_WIFI_SCAN:    drawWifiScan(); break;
    case SCREEN_FACTORY_RESET: drawFactoryReset(); break;
    case SCREEN_PROVISION:    drawProvision(); break;
  }
}

// ---------- WiFi scan selection ----------

void moveWifiScanSelection()
{
  if (scanCount > 0) {
    scanIndex++;
    if (scanIndex >= scanCount) scanIndex = 0;
  }
  drawWifiScan();
}

// ---------- Time/date editing ----------

void increaseTimeField()
{
  switch (editField) {
    case 0:
      editHour++;
      if (editHour > 12) editHour = 1;
      break;
    case 1:
      editMinute = (editMinute + 1) % 60;
      break;
    case 2:
      editSecond = (editSecond + 1) % 60;
      break;
    case 3:
      editPM = !editPM;
      break;
  }
}

void increaseDateField()
{
  switch (editField) {
    case 0:
      editDay++;
      if (editDay > daysInMonth(editMonth, editYear)) editDay = 1;
      break;
    case 1:
      editMonth++;
      if (editMonth > 12) editMonth = 1;
      if (editDay > daysInMonth(editMonth, editYear))
        editDay = daysInMonth(editMonth, editYear);
      break;
    case 2:
      editYear++;
      if (editYear > 2099) editYear = 2024;
      if (editDay > daysInMonth(editMonth, editYear))
        editDay = daysInMonth(editMonth, editYear);
      break;
  }
}

// ---------- Button actions ----------

void shortPressAction()
{
  if (provisioningMode) return;   // buttons disabled during WiFi setup

  switch (currentScreen) {
    case SCREEN_DASHBOARD:
      currentScreen = SCREEN_SETTINGS;
      break;

    case SCREEN_SETTINGS:
      menuIndex = (menuIndex + 1) % MENU_COUNT;
      break;

    case SCREEN_WIFI_INFO:
      startWifiScan();
      return;

    case SCREEN_WIFI_SCAN:
      moveWifiScanSelection();
      return;

    case SCREEN_TIME_CONFIG:
      if (editing && editField < 4) increaseTimeField();
      break;

    case SCREEN_DATE_CONFIG:
      if (editing && editField < 3) increaseDateField();
      break;

    case SCREEN_FACTORY_RESET:
      break;  // nothing, only the 10 sec hold does something

    default:
      currentScreen = SCREEN_SETTINGS;
      break;
  }

  drawCurrentScreen();
}

void longPressAction()
{
  if (provisioningMode) return;

  switch (currentScreen) {
    case SCREEN_DASHBOARD:
      currentScreen = SCREEN_SETTINGS;
      break;

    case SCREEN_SETTINGS:
      switch (menuIndex) {
        case 0:
          currentScreen = SCREEN_WIFI_INFO;
          break;
        case 1:
          currentScreen = SCREEN_MQTT_INFO;
          break;
        case 2:
          beginTimeEditor();
          currentScreen = SCREEN_TIME_CONFIG;
          break;
        case 3:
          beginTimeEditor();
          currentScreen = SCREEN_DATE_CONFIG;
          break;
        case 4:
          factoryProgress = 0;
          factoryHoldValid = false;   // need a fresh press on the reset screen
          currentScreen = SCREEN_FACTORY_RESET;
          break;
      }
      break;

    case SCREEN_WIFI_INFO:
      startWifiScan();
      return;

    case SCREEN_WIFI_SCAN:
      currentScreen = SCREEN_WIFI_INFO;
      break;

    case SCREEN_TIME_CONFIG:
      if (!editing) {
        editing = true;
        editField = 0;
        editCursorVisible = true;
        lastCursorBlinkAt = millis();
      } else if (editField < 4) {
        editField++;
        editCursorVisible = true;
        lastCursorBlinkAt = millis();
      } else {
        saveEditedTime();
        editing = false;
        currentScreen = SCREEN_SETTINGS;
      }
      break;

    case SCREEN_DATE_CONFIG:
      if (!editing) {
        editing = true;
        editField = 0;
        editCursorVisible = true;
        lastCursorBlinkAt = millis();
      } else if (editField < 3) {
        editField++;
        editCursorVisible = true;
        lastCursorBlinkAt = millis();
      } else {
        saveEditedTime();
        editing = false;
        currentScreen = SCREEN_SETTINGS;
      }
      break;

    case SCREEN_FACTORY_RESET:
      return;  // the 10 sec hold is handled in handleButton()

    default:
      currentScreen = SCREEN_SETTINGS;
      break;
  }

  drawCurrentScreen();
}

void doublePressAction()
{
  if (provisioningMode) return;
  if (currentScreen == SCREEN_DASHBOARD) return;

  if (editing) {
    editing = false;
    currentScreen = SCREEN_SETTINGS;
  } else if (currentScreen == SCREEN_SETTINGS) {
    currentScreen = SCREEN_DASHBOARD;
  } else if (currentScreen == SCREEN_WIFI_SCAN) {
    currentScreen = SCREEN_WIFI_INFO;
  } else {
    currentScreen = SCREEN_SETTINGS;
  }

  factoryProgress = 0;
  drawCurrentScreen();
}

// ---------- Button detection ----------

void handleButton()
{
  uint32_t now = millis();
  bool reading = digitalRead(BUTTON_PIN);

  if (reading != rawButtonLast) {
    lastDebounceAt = now;
  }

  if (now - lastDebounceAt >= BUTTON_DEBOUNCE_MS) {
    if (reading != stableButton) {
      stableButton = reading;

      if (stableButton == LOW) {
        pressStartedAt = now;
        longPressHandled = false;
        if (currentScreen == SCREEN_FACTORY_RESET) factoryHoldValid = true;
      } else {
        if (currentScreen == SCREEN_FACTORY_RESET) {
          factoryHoldValid = false;
          factoryProgress = 0;
        }

        if (longPressHandled) {
          // Long action is already triggered while the button is held.
        } else if (waitingForSecondPress &&
                   now - lastReleaseAt <= DOUBLE_PRESS_MS) {
          waitingForSecondPress = false;
          doublePressAction();
        } else {
          waitingForSecondPress = true;
          lastReleaseAt = now;
        }
      }
    }

    if (stableButton == LOW &&
        !longPressHandled &&
        now - pressStartedAt >= LONG_PRESS_MS) {
      longPressHandled = true;
      waitingForSecondPress = false;
      longPressAction();
    }

    // Factory reset: hold 10 sec on the reset screen
    if (stableButton == LOW &&
        currentScreen == SCREEN_FACTORY_RESET &&
        factoryHoldValid) {
      uint32_t held = now - pressStartedAt;
      uint32_t p = (held * 100) / FACTORY_HOLD_MS;
      if (p > 100) p = 100;

      if (p != factoryProgress) {
        factoryProgress = p;
        drawFactoryReset();
      }
      if (held >= FACTORY_HOLD_MS) {
        factoryReset();   // erases WiFi and restarts, never returns
      }
    }
  }

  if (waitingForSecondPress &&
      now - lastReleaseAt > DOUBLE_PRESS_MS) {
    waitingForSecondPress = false;
    shortPressAction();
  }

  rawButtonLast = reading;
}

// ---------- LED ----------

void updateStatusLED()
{
  if (provisioningMode) {
    // Purple = WiFi setup mode
    statusLed.setPixelColor(0, statusLed.Color(30, 0, 30));
  } else if (WiFi.status() != WL_CONNECTED) {
    statusLed.setPixelColor(0, statusLed.Color(0, 0, 30));
  } else if (!mqttConnected) {
    statusLed.setPixelColor(0, statusLed.Color(30, 12, 0));
  } else if (!rs485Connected) {
    statusLed.setPixelColor(0, statusLed.Color(30, 0, 0));
  } else {
    statusLed.setPixelColor(0, statusLed.Color(0, 30, 0));
  }

  statusLed.show();
}

// ---------- Setup and loop ----------

void setup()
{
  Serial.begin(115200);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Wire.begin(OLED_SDA, OLED_SCL);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("SSD1306 init failed. Check OLED wiring/address.");
    while (true) delay(1000);
  }

  // Show CAMS logo for 3 seconds
  display.clearDisplay();
  display.drawBitmap(22, 16, CAMS_LOGO, 84, 32, SSD1306_WHITE);
  display.display();
  delay(3000);

  // Backup reset: keep button pressed during power-on for 10 sec
  checkBootFactoryReset();

  preferences.begin("device", true);
  bool haveSavedTime = preferences.getInt("year", 0) != 0;
  if (haveSavedTime) {
    editHour = preferences.getInt("hour", 12);
    editMinute = preferences.getInt("minute", 0);
    editSecond = preferences.getInt("second", 0);
    editPM = preferences.getBool("pm", false);
    editDay = preferences.getInt("day", 1);
    editMonth = preferences.getInt("month", 1);
    editYear = preferences.getInt("year", 2026);
  }
  preferences.end();

  statusLed.begin();
  statusLed.setBrightness(35);
  statusLed.clear();
  statusLed.show();

  loadWifiCredentials();

  if (!wifiConfigured) {
    // WiFi not set by user (new device or after factory reset):
    // run setup portal until user saves WiFi from phone
    startProvisioning();
    drawCurrentScreen();
    return;
  }

  // WiFi saved: normal operation
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 20);
  display.print("Connecting WiFi...");
  display.display();

  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());

  configTime(
    GMT_OFFSET_SECONDS,
    DAYLIGHT_OFFSET_SECONDS,
    "pool.ntp.org",
    "time.nist.gov"
  );

  setenv("TZ", "IST-5:30", 1);
  tzset();

  currentScreen = SCREEN_DASHBOARD;
  drawCurrentScreen();
}

void loop()
{
  if (provisioningMode) {
    dnsServer.processNextRequest();
    webServer.handleClient();
  }

  handleButton();
  pollWifiScan();
  updateStatusLED();

  uint32_t now = millis();
  bool editorScreen = (currentScreen == SCREEN_TIME_CONFIG ||
                       currentScreen == SCREEN_DATE_CONFIG);

  if (editing && editorScreen) {
    if (now - lastCursorBlinkAt >= CURSOR_BLINK_MS) {
      lastCursorBlinkAt = now;
      editCursorVisible = !editCursorVisible;
      drawCurrentScreen();
    }
  } else if (currentScreen != SCREEN_FACTORY_RESET &&
             now - lastDisplayRefresh >= 1000) {
    lastDisplayRefresh = now;
    drawCurrentScreen();
  }

  if (!provisioningMode &&
      WiFi.status() != WL_CONNECTED &&
      millis() - lastWifiRetry >= 10000) {
    lastWifiRetry = millis();
    WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
  }
}
