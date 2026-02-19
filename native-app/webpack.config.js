const webpack = require('@nativescript/webpack')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const path = require('path')

module.exports = (env) => {
  webpack.init(env)

  webpack.chainWebpack((config) => {
    config.plugin('copy-web-assets').use(CopyWebpackPlugin, [{
      patterns: [{
        from: path.resolve(__dirname, 'web'),
        to: 'web'
      }]
    }])

    config.merge({
      resolve: {
        fallback: { url: false }
      }
    })
  })

  return webpack.resolveConfig()
}
