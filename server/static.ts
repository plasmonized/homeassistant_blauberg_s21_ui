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

  app.use(express.static(distPath));

  // Serve index.html for all non-API routes, injecting the HA Ingress base path
  app.use("*", (req: Request, res: Response) => {
    const indexPath = path.resolve(distPath, "index.html");
    let html = fs.readFileSync(indexPath, "utf-8");

    // HA Ingress sends X-Ingress-Path header with the base path
    const ingressPath = (req.headers["x-ingress-path"] as string) || "";
    const basePath = ingressPath ? ingressPath.replace(/\/$/, "") + "/" : "/";

    // Inject base path so the frontend router can use it
    html = html.replace(
      "<head>",
      `<head>\n  <script>window.__BASE_PATH__ = "${basePath}";</script>`,
    );

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });
}
