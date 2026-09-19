import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "artifacts", "book-project-management", "fixture");
await mkdir(fixture, { recursive: true });
for (const directory of ["components", "lib", "app"]) {
  await cp(path.join(root, directory), path.join(fixture, directory), { recursive: true });
}
for (const file of ["package.json", "jsconfig.json"]) await cp(path.join(root, file), path.join(fixture, file));
await mkdir(path.join(fixture, "tests", "fixtures"), { recursive: true });
await cp(path.join(root, "tests", "fixtures", "BookProjectManagementPage.jsx"), path.join(fixture, "tests", "fixtures", "BookProjectManagementPage.jsx"));
await writeFile(path.join(fixture, "lib/firebase.js"), "export const isFirebaseConfigured = false; export const db = null; export const auth = null; export const storage = null;\n");
await writeFile(path.join(fixture, "next.config.mjs"), "export default { devIndicators: false };\n");
await writeFile(path.join(fixture, "app/page.js"), 'export { default } from "@/tests/fixtures/BookProjectManagementPage";\n');
console.log(`Isolated mock fixture prepared: ${fixture}`);
