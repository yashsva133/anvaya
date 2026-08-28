// Lightweight TypeScript loader for the dependency-free boundary tests.
// Next.js owns production compilation; this keeps `npm test` able to exercise
// the same sanitiser/anonymizer helpers without adding a runtime TS loader to
// the application bundle.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const sourceRoot = new URL("../src/", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const url = new URL(specifier.slice(2), sourceRoot);
    return { url: `${url.href}.ts`, shortCircuit: true };
  }

  if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
    try {
      return await nextResolve(specifier, context);
    } catch (error) {
      for (const suffix of [".ts", ".tsx", "/index.ts"]) {
        try {
          return await nextResolve(`${specifier}${suffix}`, context);
        } catch {
          // Try the next TypeScript resolution shape.
        }
      }
      throw error;
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith(root.href) && (url.endsWith(".ts") || url.endsWith(".tsx"))) {
    const source = await readFile(fileURLToPath(url), "utf8");
    const result = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        sourceMap: false,
      },
      fileName: fileURLToPath(url),
    });
    return { format: "module", source: result.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
