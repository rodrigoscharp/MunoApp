import { describe, expect, it } from "vitest";
import { isValidCpf, stripCpf, formatCpf, isValidCnpj, isValidCpfCnpj, stripDocumento } from "@/lib/cpf";

describe("isValidCpf", () => {
  it("aceita CPF válido com e sem máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("recusa dígito verificador errado", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
  });

  it("recusa sequência de dígitos repetidos", () => {
    // 11111111111 passa na conta dos dígitos verificadores, mas não é CPF.
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("00000000000")).toBe(false);
  });

  it("recusa tamanho errado", () => {
    expect(isValidCpf("5299822472")).toBe(false);
    expect(isValidCpf("529982247255")).toBe(false);
    expect(isValidCpf("")).toBe(false);
  });

  it("recusa letras", () => {
    expect(isValidCpf("abc.def.ghi-jk")).toBe(false);
  });
});

describe("stripCpf", () => {
  it("remove tudo que não é dígito", () => {
    expect(stripCpf("529.982.247-25")).toBe("52998224725");
  });
});

describe("formatCpf", () => {
  it("aplica a máscara progressivamente enquanto o usuário digita", () => {
    expect(formatCpf("529")).toBe("529");
    expect(formatCpf("529982")).toBe("529.982");
    expect(formatCpf("529982247")).toBe("529.982.247");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });

  it("ignora dígitos além dos 11", () => {
    expect(formatCpf("5299822472599")).toBe("529.982.247-25");
  });
});

describe("stripDocumento", () => {
  it("remove tudo que não é dígito", () => {
    expect(stripDocumento("11.222.333/0001-81")).toBe("11222333000181");
    expect(stripDocumento("529.982.247-25")).toBe("52998224725");
  });
});

describe("isValidCnpj", () => {
  it("aceita CNPJ válido, com e sem máscara", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
  });

  it.each(["11222333000182", "52998224726"])(
    "recusa dígito verificador errado: %s",
    (doc) => expect(isValidCnpj(doc)).toBe(false)
  );

  it("recusa sequência repetida", () => {
    expect(isValidCnpj("11111111111111")).toBe(false);
  });

  it.each(["123", "1122233300018", "112223330001811"])(
    "recusa contagem de dígitos fora de 14: %s",
    (doc) => expect(isValidCnpj(doc)).toBe(false)
  );
});

describe("isValidCpfCnpj", () => {
  // O pagador aqui é o restaurante, normalmente CNPJ. Aceitar só CPF
  // excluiria a maior parte dos clientes.
  it("aceita CNPJ válido, com e sem máscara", () => {
    expect(isValidCpfCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCpfCnpj("11222333000181")).toBe(true);
  });

  it("aceita CPF válido", () => {
    expect(isValidCpfCnpj("529.982.247-25")).toBe(true);
  });

  it.each(["11222333000182", "52998224726"])(
    "recusa dígito verificador errado: %s",
    (doc) => expect(isValidCpfCnpj(doc)).toBe(false)
  );

  it("recusa sequência repetida", () => {
    expect(isValidCpfCnpj("11111111111111")).toBe(false);
  });

  it.each(["123", "1122233300018", "112223330001811"])(
    "recusa contagem de dígitos fora de 11 e 14: %s",
    (doc) => expect(isValidCpfCnpj(doc)).toBe(false)
  );
});
