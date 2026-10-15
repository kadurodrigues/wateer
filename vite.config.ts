import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type PluginOption } from "vite";

export default defineConfig(({ command }) => {
  const plugins: PluginOption[] = [
    tailwindcss(),
    tanstackStart({
      // Fail the build if client code reaches for server-only modules.
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      // Route the bundled server entry to src/server.ts, our SSR error wrapper.
      server: { entry: "server" },
    }),
  ];

  // Nitro emits the deploy bundle, so it has nothing to do while serving.
  // The `vercel` preset is pinned because Nitro otherwise guesses a target from
  // the environment, which yields a layout Vercel can't run.
  if (command === "build") {
    plugins.push(nitro({ preset: "vercel" }));
  }

  // After tanstackStart, so it transforms the route modules that plugin generates.
  plugins.push(viteReact());

  return {
    plugins,
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    server: {
      host: "::",
      port: 8080,
    },
  };
});
