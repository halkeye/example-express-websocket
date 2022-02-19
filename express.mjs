import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import {dirname} from 'path';
import {fileURLToPath} from 'url';

import morgan from 'morgan';
import express from 'express';
import {WebSocketServer} from "ws";
import ServeStatic from 'serve-static';

const __dirname = dirname(fileURLToPath(import.meta.url));

const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITE_TEST_BUILD

const resolve = (p) => path.resolve(__dirname, p)
const range = (start, end) => new Array(end - start).fill(0).map((_, idx) => start + idx);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function createServer(root = process.cwd(), isProd = process.env.NODE_ENV === 'production') {
  const app = express()
  const server = http.createServer(app);

  app.set('trust proxy', true);
  app.use(morgan('combined'))

  const websocketServer = new WebSocketServer({noServer: true})

  server.on("upgrade", (request, socket, head) => {
    console.log('upgrade', request.url);
    if (request.url === '/websockets') {
      websocketServer.handleUpgrade(request, socket, head, (websocket) => {
        websocketServer.emit("connection", websocket, request);
      });
    }
  });

  websocketServer.on("connection", async function connection(ws, connectionRequest) {
    console.log('websocket on url', connectionRequest?.url);

    ws.send("start");
    for (const seconds of range(0, 60)) {
      await sleep(seconds * 1000);
      ws.send(seconds + " seconds later, " + new Date());
    }
    ws.send("end");

    ws.on("message", (message) => {
      const parsedMessage = JSON.parse(message);
      console.log(parsedMessage);
    });
  });

  /**
   * @type {import('vite').ViteDevServer}
   */
  let vite
  if (!isProd) {
    const {createServer: createViteServer} = await import('vite')
    vite = await createViteServer({
      root,
      logLevel: isTest ? 'error' : 'info',
      server: {
        middlewareMode: 'ssr',
        watch: {
          // During tests we edit the files too fast and sometimes chokidar
          // misses change events, so enforce polling for consistency
          usePolling: true,
          interval: 100
        }
      }
    })
    // use vite's connect instance as middleware
    app.use(vite.middlewares)

    app.use('*', async (req, res) => {
      try {
        const url = req.originalUrl

        // always read fresh template in dev
        let template = await fs.readFile(resolve('index.html'), 'utf-8')
        template = await vite.transformIndexHtml(url, template)
        const render = (await vite.ssrLoadModule('/src/entry-server.jsx')).render

        const context = {}
        const appHtml = render(url, context)

        if (context.url) {
          // Somewhere a `<Redirect>` was rendered
          return res.redirect(301, context.url)
        }

        const html = template.replace(`<!--app-html-->`, appHtml)

        res.status(200).set({'Content-Type': 'text/html'}).end(html)
      } catch (e) {
        !isProd && vite.ssrFixStacktrace(e)
        console.log(e.stack)
        res.status(500).end(e.stack)
      }
    })
  } else {
    app.use(new ServeStatic('./dist', {index: 'index.html'}))
  }

  return {server, app, vite}
}

if (!isTest) {
  createServer().then(({server}) => {
    const port = process.env.PORT || 3000
    return server.listen(port, () => {
      console.log('http://localhost:' + port)
    })
  })
}

