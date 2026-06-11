import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { build as esbuild } from 'esbuild'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))

// AudioWorklets cannot use ES `import` statements, so we pre-bundle the worklet
// entry into a single classic (IIFE) script with esbuild. This works in both dev
// (served via middleware) and build (emitted as an asset). Import the bundled
// URL via `import url from 'virtual:audio-worklet'`.
function audioWorkletPlugin() {
  const VIRTUAL = 'virtual:audio-worklet'
  const RESOLVED = '\0virtual:audio-worklet'
  const DEV_PATH = '/@audio-worklet.js'
  const entry = path.resolve(dir, 'src/engine/worklet/processor.js')
  let isBuild = false

  async function bundle() {
    const res = await esbuild({
      entryPoints: [entry],
      bundle: true,
      format: 'iife',
      target: 'es2020',
      write: false,
      sourcemap: false,
    })
    return res.outputFiles[0].text
  }

  return {
    name: 'audio-worklet',
    config(_, { command }) { isBuild = command === 'build' },
    resolveId(id) { if (id === VIRTUAL) return RESOLVED },
    async load(id) {
      if (id !== RESOLVED) return null
      if (isBuild) {
        const code = await bundle()
        const ref = this.emitFile({ type: 'asset', name: 'audio-worklet.js', source: code })
        return `export default import.meta.ROLLUP_FILE_URL_${ref}`
      }
      return `export default ${JSON.stringify(DEV_PATH)}`
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.split('?')[0] === DEV_PATH) {
          try {
            const code = await bundle()
            res.setHeader('Content-Type', 'application/javascript')
            res.end(code)
          } catch (err) {
            next(err)
          }
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), audioWorkletPlugin()],
})
