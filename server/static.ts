import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // index: false is critical — without it, express.static auto-serves the
  // raw index.html for directory-style requests (e.g. "/"), bypassing the
  // catch-all handler below that injects the HA Ingress base path script.
  app.use(express.static(distPath, { index: false }));

  // Serve index.html for all non-API routes, injecting the HA Ingress base path
  app.use("*", (req: Request, res: Response) => {
    const indexPath = path.resolve(distPath, "index.html");
    let html = fs.readFileSync(indexPath, "utf-8");

    // HA Ingress sends X-Ingress-Path header with the base path
    const ingressPath = (req.headers["x-ingress-path"] as string) || "";
    // basePath has no trailing slash so we can do basePath + "/api/..."
    const basePath = ingressPath ? ingressPath.replace(/\/$/, "") : "";

    // Inject:
    //  1. window.__BASE_PATH__  – used by the wouter Router and resolveUrl()
    //  2. Global window.fetch override – intercepts ALL fetch calls so no hook
    //     can accidentally forget resolveUrl(). Recommended by the HA Ingress guide.
    const injectScript = `
<script>
  window.__BASE_PATH__ = ${JSON.stringify(basePath ? basePath + "/" : "/")};
  (function () {
    var _base = ${JSON.stringify(basePath)};
    if (!_base) return;
    var _orig = window.fetch.bind(window);
    window.fetch = function (input, init) {
      if (typeof input === 'string' && input.startsWith('/') && !input.startsWith(_base)) {
        input = _base + input;
      } else if (input instanceof Request && input.url.startsWith('/') && !input.url.startsWith(_base)) {
        input = new Request(_base + input.url, input);
      }
      return _orig(input, init);
    };
  })();
</script>`;

    html = html.replace("<head>", "<head>" + injectScript);

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });
}
