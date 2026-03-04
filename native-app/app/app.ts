import { Application, isIOS } from '@nativescript/core'
import { onDeviceToken } from './pushNotifications'

declare const NSObject: any
declare const UIApplicationDelegate: any

if (isIOS) {
  const CustomAppDelegate = (NSObject as any).extend({
    applicationDidRegisterForRemoteNotificationsWithDeviceToken (application: any, deviceToken: any): void {
      // Convert NSData to lowercase hex string using interop.bufferFromData
      // (NSData.bytes returns an interop.Pointer which cannot be indexed directly)
      const buffer = interop.bufferFromData(deviceToken)
      let token = ''
      for (let i = 0; i < buffer.length; i++) {
        token += ('0' + (buffer[i] & 0xFF).toString(16)).slice(-2)
      }
      onDeviceToken(token)
    },
    applicationDidFailToRegisterForRemoteNotificationsWithError (application: any, error: any): void {
      console.error('[Push] Failed to register for remote notifications:', error.localizedDescription)
    }
  }, {
    protocols: [UIApplicationDelegate]
  })

  Application.ios.delegate = CustomAppDelegate
}

Application.run({ moduleName: 'app-root' })
