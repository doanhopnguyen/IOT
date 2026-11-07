package com.smartdoor.wifi

import android.app.Activity
import android.content.Intent
import android.net.wifi.WifiNetworkSuggestion
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmartDoorWifiModule : Module() {
  private var pending: Promise? = null
  private val requestCode = 4862

  override fun definition() = ModuleDefinition {
    Name("SmartDoorWifi")
    Constant("available") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.R }
    AsyncFunction("connect") { ssid: String, password: String, promise: Promise ->
      if (!ssid.matches(Regex("SmartDoor-[0-9A-F]{6}")) || !password.matches(Regex("[A-Za-z0-9_-]{8,63}"))) {
        promise.reject("INVALID_SETUP_WIFI", "QR không có Wi-Fi thiết lập hợp lệ.", null)
      } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
        promise.resolve("manual")
      } else if (pending != null) {
        promise.reject("WIFI_JOIN_BUSY", "Điện thoại đang chờ xác nhận Wi-Fi.", null)
      } else {
        val activity = appContext.currentActivity
        if (activity == null) {
          promise.reject("WIFI_NO_ACTIVITY", "Mở lại app rồi thử kết nối Wi-Fi.", null)
        } else {
          val configuration = WifiNetworkSuggestion.Builder().setSsid(ssid).setWpa2Passphrase(password).build()
          val intent = Intent(Settings.ACTION_WIFI_ADD_NETWORKS)
            .putParcelableArrayListExtra(Settings.EXTRA_WIFI_NETWORK_LIST, arrayListOf(configuration))
          pending = promise
          try {
            // The OS confirms and joins a saved network. No process binding:
            // Tailscale/cloud traffic remains on the system's default route.
            activity.startActivityForResult(intent, requestCode)
          } catch (error: Exception) {
            pending = null
            promise.reject("WIFI_JOIN_UNAVAILABLE", "Chưa mở được kết nối Wi-Fi. Hãy dùng cài đặt Wi-Fi.", error)
          }
        }
      }
    }.runOnQueue(Queues.MAIN)
    OnActivityResult { _, result ->
      if (result.requestCode == requestCode) {
        val promise = pending
        pending = null
        val results = result.data?.getIntegerArrayListExtra(Settings.EXTRA_WIFI_NETWORK_RESULT_LIST)
        if (result.resultCode == Activity.RESULT_OK && results?.size == 1 &&
          (results[0] == Settings.ADD_WIFI_RESULT_SUCCESS || results[0] == Settings.ADD_WIFI_RESULT_ALREADY_EXISTS)) {
          promise?.resolve("saved")
        } else {
          promise?.reject("WIFI_JOIN_CANCELLED", "Chưa kết nối Wi-Fi của cửa. Bạn có thể thử lại.", null)
        }
      }
    }
    OnDestroy {
      pending?.reject("WIFI_JOIN_INTERRUPTED", "Kết nối Wi-Fi bị gián đoạn. Mở lại app để tiếp tục.", null)
      pending = null
    }
  }
}
