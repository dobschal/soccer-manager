import { Application, isIOS } from '@nativescript/core'
import { onDeviceToken } from './pushNotifications'

// iOS type declarations (available at runtime via NativeScript iOS runtime)
declare function NativeClass (): ClassDecorator
declare class UIResponder {}
declare interface UIApplicationDelegate {}
declare const UIApplicationDelegate: any
declare class UIApplication { static sharedApplication: UIApplication }
declare class NSData {}
declare class NSError { localizedDescription: string }
declare class NSDictionary<K, V> {}

if (isIOS) {
  @NativeClass()
  class CustomAppDelegate extends UIResponder implements UIApplicationDelegate {
    public static ObjCProtocols = [UIApplicationDelegate]

    applicationDidFinishLaunchingWithOptions (application: UIApplication, launchOptions: NSDictionary<string, any>): boolean {
      console.log('[Push][AppDelegate] applicationDidFinishLaunching')
      return true
    }

    applicationDidRegisterForRemoteNotificationsWithDeviceToken (application: UIApplication, deviceToken: NSData): void {
      console.log('[Push][AppDelegate] applicationDidRegisterForRemoteNotificationsWithDeviceToken CALLED')
      try {
        const buffer = interop.bufferFromData(deviceToken)
        console.log(`[Push][AppDelegate] buffer length: ${buffer.length}`)
        let token = ''
        for (let i = 0; i < buffer.length; i++) {
          token += ('0' + (buffer[i] & 0xFF).toString(16)).slice(-2)
        }
        console.log(`[Push][AppDelegate] Converted token: ${token.substring(0, 10)}... (length: ${token.length})`)
        onDeviceToken(token)
      } catch (e) {
        console.error(`[Push][AppDelegate] ERROR converting device token: ${e}`)
      }
    }

    applicationDidFailToRegisterForRemoteNotificationsWithError (application: UIApplication, error: NSError): void {
      console.error('[Push][AppDelegate] FAILED to register for remote notifications:', error.localizedDescription)
    }
  }

  console.log('[Push][AppDelegate] Setting Application.ios.delegate...')
  Application.ios.delegate = CustomAppDelegate
  console.log('[Push][AppDelegate] Delegate set successfully')
}

Application.run({ moduleName: 'app-root' })
