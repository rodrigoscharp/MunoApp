import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cliente do Prisma, gerado por `prisma generate` e fora do versionamento
    // (ver .gitignore). Sozinho ele respondia por 860 dos 883 problemas do
    // `npm run lint` — ruído que nenhum commit pode resolver e que escondia as
    // duas dezenas de avisos reais do código escrito à mão. Next 16 não roda
    // mais lint no build, então este é o único lugar onde eles aparecem.
    "src/generated/**",
  ]),
  {
    // Os scripts de operação em .js rodam por `node scripts/...` direto, antes
    // e fora do bundler — guard-local-db no `npm run dev`, migrate-on-deploy no
    // build da Vercel. Sem `"type": "module"` no package.json, .js é CommonJS, e
    // `require` ali não é legado: é a única forma que funciona. A regra é de
    // TypeScript e estava reclamando de Node.
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // `_algo` é a convenção do projeto para "existe na assinatura e não se usa"
    // — parâmetro posicional que precisa estar lá, valor descartado de um
    // destructuring. Nomear com underscore já é a declaração da intenção.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
