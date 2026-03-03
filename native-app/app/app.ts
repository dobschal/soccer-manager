import { Application, isIOS } from '@nativescript/core'
import { onDeviceToken } from './pushNotifications'

declare const NSObject: any
declare const UIApplicationDelegate: any

if (isIOS) {
  const CustomAppDelegate = (NSObject as any).extend({
    applicationDidRegisterForRemoteNotificationsWithDeviceToken (application: any, deviceToken: any): void {
      // Convert NSData to lowercase hex string
      let token = ''
      for (let i = 0; i < deviceToken.length; i++) {
        token += ('0' + (deviceToken.bytes[i] & 0xFF).toString(16)).slice(-2)
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
