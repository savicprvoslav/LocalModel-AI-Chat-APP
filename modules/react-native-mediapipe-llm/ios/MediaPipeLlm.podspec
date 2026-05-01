require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'MediaPipeLlm'
  s.version        = package['version']
  s.summary        = package['description']
  s.license        = package['license']
  s.author         = 'Local Chat'
  s.homepage       = 'https://example.com/local-chat'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'MediaPipeTasksGenAI'
  s.dependency 'MediaPipeTasksGenAIC'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
