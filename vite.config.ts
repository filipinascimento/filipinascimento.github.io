import vinext from "vinext";
import { defineConfig } from "vite";

// The canonical GitHub Pages repository does not use the Sites runtime or its
// project-specific bindings. Keep the local vinext build intentionally simple.
export default defineConfig({
  plugins: [vinext()],
});
