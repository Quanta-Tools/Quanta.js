import typescript from "rollup-plugin-typescript2";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

export default [
  // Module builds (CJS and ESM)
  {
    input: "src/index.ts",
    output: [
      {
        file: "dist/index.cjs.js",
        format: "cjs",
        exports: "named",
        sourcemap: true,
      },
      {
        file: "dist/index.esm.js",
        format: "es",
        exports: "named",
        sourcemap: true,
      },
    ],
    plugins: [
      nodeResolve(),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        useTsconfigDeclarationDir: true,
        tsconfigOverride: {
          compilerOptions: {
            declaration: true,
            declarationDir: "./dist",
          },
        },
      }),
      terser({
        format: {
          comments: false,
        },
        compress: {
          drop_console: false,
        },
      }),
    ],
  },
  // IIFE build for browsers
  {
    input: "src/iife.ts",
    output: {
      file: "dist/quanta.min.js",
      format: "iife",
      name: "Quanta",
      sourcemap: false,
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        useTsconfigDeclarationDir: true,
        tsconfigOverride: {
          compilerOptions: {
            declaration: true,
            declarationDir: "./dist",
          },
        },
      }),
      terser({
        format: {
          comments: false,
        },
        compress: {
          drop_console: false,
        },
      }),
    ],
  },
];
