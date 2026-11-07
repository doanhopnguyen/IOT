import ExpoModulesCore
import NetworkExtension

public class SmartDoorWifiModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SmartDoorWifi")
    Constant("available") { true }
    AsyncFunction("connect") { (ssid: String, password: String, promise: Promise) in
      guard ssid.range(of: "^SmartDoor-[0-9A-F]{6}$", options: .regularExpression) != nil,
            password.range(of: "^[A-Za-z0-9_-]{8,63}$", options: .regularExpression) != nil else {
        promise.reject("INVALID_SETUP_WIFI", "QR không có Wi-Fi thiết lập hợp lệ.")
        return
      }
      let configuration = NEHotspotConfiguration(ssid: ssid, passphrase: password, isWEP: false)
      // Keep the AP while the user opens the portal in the browser.
      configuration.joinOnce = false
      NEHotspotConfigurationManager.shared.apply(configuration) { error in
        if let error = error as NSError?, !(error.domain == NEHotspotConfigurationErrorDomain && error.code == NEHotspotConfigurationError.alreadyAssociated.rawValue) {
          promise.reject("WIFI_JOIN_FAILED", "Chưa kết nối Wi-Fi của cửa. Xác nhận trên điện thoại hoặc thử lại.")
        } else {
          promise.resolve("saved")
        }
      }
    }.runOnQueue(.main)
  }
}
