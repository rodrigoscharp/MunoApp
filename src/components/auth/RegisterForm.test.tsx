// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({ push: vi.fn(), busca: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, refresh: vi.fn() }),
  useSearchParams: () => nav.busca,
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn(async () => ({ error: undefined })) }));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => <span data-imagem={alt} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { RegisterForm } from "./RegisterForm";

const RESTAURANTE = {
  name: "Burguer",
  address: "",
  phone: "",
  logoUrl: "",
  floorPlanImageUrl: null,
};

async function cadastrar() {
  const { container } = render(<RegisterForm restaurantInfo={RESTAURANTE} />);
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Seu nome completo"), "Cliente Novo");
  await user.type(screen.getByPlaceholderText("seu@email.com"), "novo@exemplo.com");
  await user.type(screen.getByPlaceholderText("Mínimo 6 caracteres"), "senha-123");
  await user.type(screen.getByPlaceholderText("Repita a senha"), "senha-123");
  await user.click(container.querySelector('button[type="submit"]')!);
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
}

beforeEach(() => {
  nav.push.mockClear();
  nav.busca = new URLSearchParams();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ id: "u1" }), { status: 201 }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RegisterForm: para onde vai depois de criar a conta", () => {
  it.each(["https://golpe.example", "//golpe.example"])(
    "ignora callbackUrl externo %s",
    async (externo) => {
      nav.busca = new URLSearchParams({ callbackUrl: externo });

      await cadastrar();

      expect(nav.push).toHaveBeenCalledWith("/");
    }
  );

  it("callbackUrl interno continua valendo", async () => {
    nav.busca = new URLSearchParams({ callbackUrl: "/checkout" });

    await cadastrar();

    expect(nav.push).toHaveBeenCalledWith("/checkout");
  });

  it("o link de login não carrega o callbackUrl externo", () => {
    nav.busca = new URLSearchParams({ callbackUrl: "https://golpe.example" });

    const { container } = render(<RegisterForm restaurantInfo={RESTAURANTE} />);

    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.includes("golpe.example"))).toBe(false);
  });
});
