Pod::Spec.new do |s|
  s.name = 'SmartDoorWifi'
  s.version = '1.0.0'
  s.summary = 'Local Smart Door Wi-Fi setup'
  s.description = 'System-confirmed Wi-Fi provisioning for Smart Door products.'
  s.author = 'Smart Door'
  s.homepage = 'https://docs.expo.dev/modules/'
  s.license = { :type => 'Private' }
  s.source = { :git => '' }
  s.platforms = { :ios => '16.4' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'NetworkExtension'
  s.source_files = '**/*.{h,m,mm,swift}'
end
