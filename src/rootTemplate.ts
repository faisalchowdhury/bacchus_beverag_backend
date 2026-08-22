import { APP_NAME, NODE_ENV } from "./config";

/** Simple landing page served at GET / so the API root isn't a 404. */
export const template = `
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${APP_NAME} API</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        background: #f8f9fa;
        color: #333;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        line-height: 1.6;
      }
      .card {
        background: #fff;
        padding: 48px 56px;
        border-radius: 16px;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
        text-align: center;
        max-width: 520px;
      }
      h1 { font-size: 2rem; margin-bottom: 8px; }
      p { color: #666; }
      .badge {
        display: inline-block;
        margin-top: 20px;
        padding: 6px 14px;
        border-radius: 999px;
        background: #eff6ff;
        color: #0066cc;
        font-size: 0.85rem;
        font-weight: 600;
      }
      code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${APP_NAME} API</h1>
      <p>The server is up. Endpoints live under <code>/api/v1</code>.</p>
      <span class="badge">${NODE_ENV}</span>
    </div>
  </body>
</html>
`;
