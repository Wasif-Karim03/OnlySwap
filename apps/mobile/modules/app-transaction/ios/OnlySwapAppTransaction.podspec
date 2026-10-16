# AR-04: reads StoreKit's AppTransaction.appTransactionID so the server can
# match Apple's RESCIND_CONSENT notification to the account.
Pod::Spec.new do |s|
  s.name           = 'OnlySwapAppTransaction'
  s.version        = '1.0.0'
  s.summary        = 'Reads the App Store appTransactionID (AR-04).'
  s.author         = 'OnlySwap'
  s.homepage       = 'https://onlyswap.pages.dev'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'StoreKit'
  s.source_files   = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
