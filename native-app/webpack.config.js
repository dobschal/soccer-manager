const webpack = require('@nativescript/webpack')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const { DefinePlugin } = require('webpack')
const path = require('path')

module.exports = (env) => {
  webpack.init(env)

  // OTA is disabled in dev builds (`ns run ios|android`) so the local bundle
  // isn't immediately replaced by the prod webapp on first launch. Release
  // builds keep OTA enabled. NativeScript's webpack sets `env.production`
  // when called via `ns build --release` / `ns prepare --release`.
  const otaEnabled = env.production === true || env.production === 'true'

  webpack.chainWebpack((config) => {
    config.plugin('copy-web-assets').use(CopyWebpackPlugin, [{
      patterns: [{
        from: path.resolve(__dirname, 'web'),
        to: 'web',
        force: true
      }]
    }])

    config.plugin('ota-define').use(DefinePlugin, [{
      __OTA_ENABLED__: JSON.stringify(otaEnabled)
    }])

    config.merge({
      resolve: {
        fallback: { url: false }
      }
    })
  })

  console.log(`[build] OTA ${otaEnabled ? 'enabled (release)' : 'disabled (dev)'}`)

  return webpack.resolveConfig()
}
