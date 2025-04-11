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
    external: [
      "expo-application",
      "expo-constants",
      "expo-device",
      "expo-localization",
      "expo-secure-store",
      "react-native",
      "react",
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
];
