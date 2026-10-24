// Os tipos de `import x from "*.png"` (StaticImageData) vêm do next-env.d.ts,
// que é gerado pelo `next dev`/`next build` e fica fora do git. Sem esta
// referência, o `npx tsc --noEmit` do CI, que roda num checkout limpo, não
// conhece o import de imagem dos mapas. Referenciar o mesmo arquivo duas vezes
// é inofensivo quando o next-env.d.ts existe.
/// <reference types="next/image-types/global" />
