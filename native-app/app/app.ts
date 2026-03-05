import { Application, isIOS } from '@nativescript/core'
import { onDeviceToken, onRegistrationError } from './pushNotifications'

// iOS type declarations (available at runtime via NativeScript iOS runtime)
declare function NativeClass (): ClassDecorator
declare class UIResponder {}
declare interface UIApplicationDelegate {}
declare const UIApplicationDelegate: any
declare class UIApplication { static sharedApplication: UIApplication }
declare class NSData {}
declare class NSError { localizedDescription: string }
declare class NSDictionary<K, V> {}
declare const interop: any

if (isIOS) {
  @NativeClass()
  class CustomAppDelegate extends UIResponder implements UIApplicationDelegate {
    public static ObjCProtocols = [UIApplicationDelegate]

    applicationDidFinishLaunchingWithOptions (application: UIApplication, launchOptions: NSDictionary<string, any>): boolean {
      console.log('[Push][AppDelegate] applicationDidFinishLaunching')
      return true
    }

    applicationDidRegisterForRemoteNotificationsWithDeviceToken (application: UIApplication, tokenData: NSData): void {
      console.log('[Push][AppDelegate] applicationDidRegisterForRemoteNotificationsWithDeviceToken CALLED')
      try {
        const nsData = tokenData as any
        const dataLength = nsData.length // NSData.length property
        console.log(`[Push][AppDelegate] NSData.length: ${dataLength}`)
        const buffer = interop.bufferFromData(nsData)
        const view = new Uint8Array(buffer, 0, dataLength)
        let token = ''
        for (let i = 0; i < dataLength; i++) {
          token += ('0' + view[i].toString(16)).slice(-2)
        }
        console.log(`[Push][AppDelegate] Converted token: ${token.substring(0, 10)}... (length: ${token.length})`)
        if (token.length > 0) {
          onDeviceToken(token)
        } else {
          console.error('[Push][AppDelegate] Token conversion produced empty string')
        }
      } catch (e) {
        console.error(`[Push][AppDelegate] ERROR converting device token: ${e}`)
      }
    }

    applicationDidFailToRegisterForRemoteNotificationsWithError (application: UIApplication, error: NSError): void {
      const msg = error?.localizedDescription || 'unknown error'
      console.error('[Push][AppDelegate] FAILED to register for remote notifications:', msg)
      onRegistrationError(msg)
    }
  }

  console.log('[Push][AppDelegate] Setting Application.ios.delegate...')
  Application.ios.delegate = CustomAppDelegate
  console.log('[Push][AppDelegate] Delegate set successfully')
}

Application.run({ moduleName: 'app-root' })
