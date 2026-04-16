import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

export interface PublishStandaloneSiteInput {
  projectRoot: string;
  outputDir: string;
  dashboardHtml: string;
  pairId: string;
  generatedAt: string;
  artifactFiles: string[];
}

function injectStandaloneHead(html: string, pairId: string): string {
  const headBits = `
  <link rel="manifest" href="manifest.webmanifest" />
  <meta name="theme-color" content="#0f1419" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Trade1" />
  <link rel="icon" href="app-icon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="app-icon.svg" />
  <meta name="application-name" content="Trade1 ${pairId}" />`;
  return html.replace("</head>", `${headBits}\n</head>`);
}

function buildManifest(pairId: string): string {
  return JSON.stringify(
    {
      name: `Trade1 ${pairId} Replay`,
      short_name: "Trade1",
      start_url: "./trade.html",
      display: "standalone",
      background_color: "#0f1419",
      theme_color: "#0f1419",
      description:
        "Static FX replay dashboard with beginner-friendly as-of-date analysis.",
      icons: [
        {
          src: "./app-icon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any",
        },
      ],
    },
    null,
    2
  );
}

function buildAppIcon(pairId: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Trade1">
  <rect width="256" height="256" rx="48" fill="#0f1419"/>
  <rect x="28" y="28" width="200" height="200" rx="28" fill="#161b22" stroke="#30363d" stroke-width="4"/>
  <path d="M72 162h36l18-56 24 76 34-102" fill="none" stroke="#3fb950" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="128" y="84" text-anchor="middle" font-family="system-ui, sans-serif" font-size="26" font-weight="700" fill="#e6edf3">${pairId}</text>
</svg>`;
}

function buildReadme(generatedAt: string): string {
  return [
    "Trade1 standalone bundle",
    "",
    `Generated: ${generatedAt}`,
    "",
    "Open trade.html (or index.html) for the simple FX trading app (Data health tab + live quote check).",
    "Open trial_dashboard.html for the full analyst / trial dashboard bundle.",
    "Full manual: docs/USER_GUIDE.md in the repo root.",
    "To refresh data on your PC without Cursor: double-click Refresh Trade1 Data.cmd in the parent Trade1 repo folder (see docs/RUN_WITHOUT_CURSOR.md).",
    "For iPad / phone access, put this whole folder on any static host or synced web-accessible storage.",
    "GitHub Pages is prewired in .github/workflows/pages.yml for automatic static publishing after push.",
    "This bundle stays static: no server or broker connection is required.",
  ].join("\n");
}

export function publishStandaloneSite(
  input: PublishStandaloneSiteInput
): string {
  const standaloneDir = resolve(input.projectRoot, "standalone");
  mkdirSync(standaloneDir, { recursive: true });

  const standaloneHtml = injectStandaloneHead(input.dashboardHtml, input.pairId);
  // Do not overwrite index.html — that file is the Trade1 app (trade.html copy) for Vercel/Pages.
  writeFileSync(
    resolve(standaloneDir, "trial_dashboard.html"),
    standaloneHtml,
    "utf8"
  );
  writeFileSync(resolve(standaloneDir, "404.html"), standaloneHtml, "utf8");
  writeFileSync(
    resolve(standaloneDir, "manifest.webmanifest"),
    buildManifest(input.pairId),
    "utf8"
  );
  writeFileSync(
    resolve(standaloneDir, "app-icon.svg"),
    buildAppIcon(input.pairId),
    "utf8"
  );
  writeFileSync(
    resolve(standaloneDir, "README.txt"),
    buildReadme(input.generatedAt),
    "utf8"
  );
  writeFileSync(resolve(standaloneDir, ".nojekyll"), "", "utf8");

  for (const file of input.artifactFiles) {
    const from = resolve(input.outputDir, file);
    const to = resolve(standaloneDir, file);
    if (existsSync(from)) {
      copyFileSync(from, to);
    } else if (existsSync(to)) {
      rmSync(to, { force: true });
    }
  }

  return standaloneDir;
}
