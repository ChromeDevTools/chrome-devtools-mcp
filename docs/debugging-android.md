# Experimental: Debugging Chrome on Android

This is an experimental feature as Puppeteer does not officially support Chrome on Android as a target.

The workflow below works for most users. See [Troubleshooting: DevTools is not detecting the Android device for more help](https://developer.chrome.com/docs/devtools/remote-debugging#troubleshooting) for more help.

1. Open the Developer Options screen on your Android. See [Configure on-device developer Options](https://developer.android.com/studio/debug/dev-options.html).
2. Select Enable USB Debugging.
3. Connect your Android device directly to your development machine using a USB cable.
4. On your development machine setup port forwarding from your development machine to your android device:
   ```shell
   adb forward tcp:9222 localabstract:chrome_devtools_remote
   ```
5. Configure your MCP server to connect to the Chrome
   ```json
   "chrome-devtools": {
     "command": "npx",
     "args": [
       "chrome-devtools-mcp@latest",
       "--wsEndpoint=ws://127.0.0.1:9222/devtools/browser/"
     ],
     "trust": true
   }
   ```
6. Test your setup by running the following prompt in your coding agent:
   ```none
   Check the performance of developers.chrome.com
   ```

The Chrome DevTools MCP server should now control Chrome on your Android device.
