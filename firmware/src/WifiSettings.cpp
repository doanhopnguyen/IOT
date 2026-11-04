#include "WifiSettings.h"
#include <ArduinoJson.h>

namespace {
constexpr uint16_t BLACK = 0x0000, WHITE = 0xFFFF, CYAN = 0x07FF, YELLOW = 0xFFE0;
constexpr uint32_t JOIN_TIMEOUT = 20000, RETRY_INTERVAL = 15000;
bool validPassword(const String &password) {
  if (password.isEmpty() || (password.length() >= 8 && password.length() <= 63)) return true;
  if (password.length() != 64) return false;
  for (unsigned i = 0; i < password.length(); ++i) if (!isHexadecimalDigit(password[i])) return false;
  return true;
}
}

void WifiSettings::begin(const char *fallbackSsid, const char *fallbackPassword) {
  storageReady = storage.begin("doorwifi", false);
  DynamicJsonDocument config(512);
  if (storageReady && !deserializeJson(config, storage.getString("config", ""))) {
    savedSsid = config["ssid"] | ""; savedPassword = config["password"] | "";
  }
  if (savedSsid.isEmpty()) { savedSsid = fallbackSsid; savedPassword = fallbackPassword; }
  WiFi.persistent(false); // Only our verified, single-record NVS config is persistent.
  WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true);
  WiFi.setMinSecurity(WIFI_AUTH_OPEN); // Also allow explicitly selected open networks.
  if (savedSsid.length()) WiFi.begin(savedSsid.c_str(), savedPassword.c_str());
  nextRetry = millis() + RETRY_INTERVAL;
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  if (savedSsid.isEmpty()) open();
}

void WifiSettings::text(int x, int y, const String &value, uint16_t color) {
  display.setTextSize(1); display.setTextColor(color); display.setCursor(x, y); display.print(value);
}
void WifiSettings::button(int x, int y, int w, int h, const String &label) {
  display.drawRect(x, y, w, h, CYAN);
  text(x + (w - (int)label.length() * 6) / 2, y + (h - 8) / 2, label);
}
const char *WifiSettings::keyRow(int row) const {
  static const char *lower[] = {"1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"};
  static const char *upper[] = {"1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"};
  static const char *symbols[] = {"!@#$%^&*()", "-_=+[]{}<>", ";:'\"\\|`~/?", ",."};
  return keyMode == 2 ? symbols[row] : keyMode == 1 ? upper[row] : lower[row];
}
void WifiSettings::render() {
  if (!visible()) return;
  display.fillScreen(BLACK);
  text(8, 10, "WI-FI SETTINGS", CYAN);
  if (page == Page::Networks) {
    String connected = WiFi.status() == WL_CONNECTED ? WiFi.SSID() : String("Offline");
    text(8, 30, connected.substring(0, 36), YELLOW);
    text(8, 43, WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "2.4 GHz Wi-Fi only");
    for (int i = 0; i < 5 && offset + i < count; i++) {
      const auto &n = networks[offset + i];
      button(6, 64 + i * 31, 228, 28, "");
      text(10, 74 + i * 31, n.ssid.substring(0, 24));
      text(158, 74 + i * 31, String(n.secured ? "* " : "  ") + String(n.rssi));
    }
    text(8, 226, scanning ? "Scanning..." : notice.substring(0, 37), YELLOW);
    button(6, 246, 72, 30, "SCAN"); button(84, 246, 72, 30, "HIDDEN"); button(162, 246, 72, 30, "NEXT");
    button(6, 282, 228, 32, "BACK TO DOOR");
  } else if (page == Page::Keyboard) {
    text(8, 30, candidateSsid.substring(0, 36), YELLOW);
    button(6, 47, 110, 28, editingSsid ? "[SSID]" : "SSID");
    button(124, 47, 110, 28, editingSsid ? "PASSWORD" : "[PASSWORD]");
    text(8, 83, editingSsid ? candidateSsid.substring(0, 36) : String(candidatePassword.length()) + " characters (hidden)");
    text(8, 99, notice.substring(0, 37), YELLOW);
    for (int row = 0; row < 4; row++) {
      const char *keys = keyRow(row);
      for (unsigned col = 0; col < strlen(keys); col++) button(5 + col * 23, 116 + row * 31, 22, 28, String(keys[col]));
    }
    button(5, 243, 72, 30, keyMode == 0 ? "ABC" : keyMode == 1 ? "#+=" : "abc");
    button(84, 243, 72, 30, "SPACE"); button(163, 243, 72, 30, "DEL");
    button(5, 282, 110, 32, "BACK"); button(125, 282, 110, 32, "CONNECT");
  } else {
    text(8, 52, "Connecting to:"); text(8, 72, candidateSsid.substring(0, 36), YELLOW);
    text(8, 106, "Checking connection (up to 20s)");
    text(8, 125, "Previous network is kept on failure.");
    button(6, 282, 228, 32, "CANCEL");
  }
}
void WifiSettings::scan() {
  if (scanning || testing) return;
  // Wi-Fi scans are asynchronous; sensor polling and auto-lock continue.
  int result = WiFi.scanNetworks(true, true);
  scanning = result == WIFI_SCAN_RUNNING;
  scanStarted = millis(); notice = scanning ? "" : "Scan unavailable; try again";
  render();
}
void WifiSettings::open() { page = Page::Networks; offset = 0; notice = "Select a network or HIDDEN"; render(); scan(); }

void WifiSettings::connectCandidate() {
  if (scanning) { notice = "Wait for scan, then tap CONNECT"; render(); return; }
  if (candidateSsid.isEmpty() || candidateSsid.length() > 32) { notice = "SSID must be 1-32 bytes"; render(); return; }
  if (!validPassword(candidatePassword)) { notice = "Password: 8-63 chars, or blank"; render(); return; }
  WiFi.scanDelete(); scanning = false;
  WiFi.setAutoReconnect(false); WiFi.disconnect(false, false);
  testing = true; started = millis(); page = Page::Connecting; render();
  WiFi.begin(candidateSsid.c_str(), candidatePassword.c_str());
}
void WifiSettings::restore() {
  testing = false; candidatePassword = "";
  WiFi.disconnect(false, false); WiFi.setAutoReconnect(true);
  if (savedSsid.length()) WiFi.begin(savedSsid.c_str(), savedPassword.c_str());
  nextRetry = millis() + RETRY_INTERVAL;
}

void WifiSettings::poll() {
  uint32_t now = millis();
  if (scanning) {
    int result = WiFi.scanComplete();
    if (result >= 0) {
      count = 0; offset = 0;
      for (int i = 0; i < result && count < 20; i++) {
        String ssid = WiFi.SSID(i); if (ssid.isEmpty()) continue;
        bool duplicate = false;
        for (int j = 0; j < count; j++) if (networks[j].ssid == ssid) duplicate = true;
        if (!duplicate) networks[count++] = {ssid, WiFi.RSSI(i), WiFi.encryptionType(i) != WIFI_AUTH_OPEN};
      }
      WiFi.scanDelete(); scanning = false; notice = String(count) + " networks; * = password";
      if (page == Page::Networks) render();
    } else if (result == WIFI_SCAN_FAILED || now - scanStarted > 20000) {
      WiFi.scanDelete(); scanning = false; notice = "Scan failed; tap SCAN to retry";
      if (page == Page::Networks) render();
    }
  }
  if (testing) {
    if (WiFi.status() == WL_CONNECTED && WiFi.SSID() == candidateSsid) {
      DynamicJsonDocument config(512); config["ssid"] = candidateSsid; config["password"] = candidatePassword;
      String data; serializeJson(config, data);
      if (storageReady && storage.putString("config", data) == data.length()) {
        savedSsid = candidateSsid; savedPassword = candidatePassword; candidatePassword = "";
        testing = false; WiFi.setAutoReconnect(true); page = Page::Networks; notice = "Connected and saved";
        render();
      } else { restore(); page = Page::Networks; notice = "Save failed; using previous Wi-Fi"; render(); }
    } else if (now - started >= JOIN_TIMEOUT) {
      restore(); page = Page::Networks; notice = "Failed; previous Wi-Fi restored"; render();
    }
  } else if (!scanning && WiFi.status() != WL_CONNECTED && savedSsid.length() && (int32_t)(now - nextRetry) >= 0) {
    nextRetry = now + RETRY_INTERVAL; WiFi.reconnect();
  }
  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected != lastConnected) {
    lastConnected = connected;
    if (page == Page::Networks) render();
  }
}

bool WifiSettings::tap(int x, int y) {
  if (!visible()) return false;
  if (page == Page::Connecting) {
    if (y >= 282 && y < 314) { restore(); page = Page::Networks; notice = "Cancelled; previous Wi-Fi kept"; render(); }
  } else if (page == Page::Networks) {
    if (y >= 282 && y < 314) { page = Page::Home; return true; }
    if (y >= 246 && y < 276) {
      if (x < 78) scan();
      else if (x >= 84 && x < 156) {
        candidateSsid = ""; candidatePassword = ""; editingSsid = true; keyMode = 0;
        notice = "Enter hidden network SSID"; page = Page::Keyboard; render();
      } else if (x >= 162) { offset = offset + 5 >= count ? 0 : offset + 5; render(); }
    } else if (y >= 64 && y < 219 && (y - 64) % 31 < 28) {
      int selected = offset + (y - 64) / 31;
      if (selected < count) {
        candidateSsid = networks[selected].ssid; candidatePassword = ""; editingSsid = false; keyMode = 0;
        notice = networks[selected].secured ? "Enter password, then CONNECT" : "Open network: leave password blank";
        page = Page::Keyboard; render();
      }
    }
  } else if (page == Page::Keyboard) {
    String &field = editingSsid ? candidateSsid : candidatePassword;
    int limit = editingSsid ? 32 : 64;
    if (y >= 47 && y < 75) { editingSsid = x < 120; notice = ""; }
    else if (y >= 116 && y < 240 && x >= 5 && x < 235) {
      int row = (y - 116) / 31, col = (x - 5) / 23;
      const char *keys = keyRow(row);
      if ((y - 116) % 31 < 28 && (x - 5) % 23 < 22 && col < (int)strlen(keys) && (int)field.length() < limit) field += keys[col];
    } else if (y >= 243 && y < 273) {
      if (x < 77) keyMode = (keyMode + 1) % 3;
      else if (x >= 84 && x < 156 && (int)field.length() < limit) field += ' ';
      else if (x >= 163 && field.length()) field.remove(field.length() - 1);
    } else if (y >= 282 && y < 314) {
      if (x < 115) { candidatePassword = ""; page = Page::Networks; }
      else if (x >= 125) { connectCandidate(); return true; }
    }
    render();
  }
  return true;
}
