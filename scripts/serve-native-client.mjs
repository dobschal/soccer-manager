import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import express from 'express'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLIENT_DIR = resolve(__dirname, '..', 'client')
const PORT = process.env.PORT || 8080
const SERVER_URL = process.env.NATIVE_SERVER_URL || 'https://footballmanager.io'

const app = express()

app.get('/', (req, res) => {
  let html = readFileSync(resolve(CLIENT_DIR, 'index.html'), 'utf-8')

  html = html.replace(
    '<link rel="stylesheet" href="style/landing.css">',
    '<link rel="stylesheet" href="style/landing.css">\n    <link rel="stylesheet" href="style/native-app.css">'
  )

  html = html.replace(
    '<script src="app.js" defer type="module"></script>',
    `<script>window.__NATIVE_SERVER_URL = '${SERVER_URL}';</script>\n    <script src="native-app.js" defer type="module"></script>`
  )

  res.setHeader('Content-Type', 'text/html')
  res.send(html)
})

app.use(express.static(CLIENT_DIR))

app.listen(PORT, () => {
  console.log(`Native client dev server running at http://localhost:${PORT}`)
})
