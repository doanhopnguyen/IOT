#pragma once
#include <Adafruit_GFX.h>
#include <Preferences.h>
#include <WiFi.h>

// All UI, NVS and station changes run on loop(); no Wi-Fi callback touches the SPI bus.
class WifiSettings {
public:
  explicit WifiSettings(Adafruit_GFX &display) : display(display) {}
  void begin(const char *fallbackSsid, const char *fallbackPassword);
  void open();
  void poll();
  bool tap(int x, int y); // true when the Wi-Fi screen consumes this tap
  bool visible() const { return page != Page::Home; }
  bool joining() const { return testing; }
private:
  enum class Page { Home, Networks, Keyboard, Connecting };
  struct Network { String ssid; int rssi; bool secured; };
  Adafruit_GFX &display;
  Preferences storage;
  Page page = Page::Home;
  Network networks[20];
  int count = 0, offset = 0, keyMode = 0;
  bool scanning = false, testing = false, editingSsid = false, storageReady = false;
  bool lastConnected = false;
  uint32_t started = 0, nextRetry = 0, scanStarted = 0;
  String savedSsid, savedPassword, candidateSsid, candidatePassword, notice;
  void scan();
  void connectCandidate();
  void restore();
  void render();
  void button(int x, int y, int w, int h, const String &label);
  void text(int x, int y, const String &value, uint16_t color = 0xFFFF);
  const char *keyRow(int row) const;
};
