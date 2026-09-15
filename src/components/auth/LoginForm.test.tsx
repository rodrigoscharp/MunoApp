// @vitest-environment jsdom
/**
 * O login é onde o open redirect morde: a pessoa acabou de digitar a senha no
 * domínio do restaurante e confia no próximo destino.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  busca: new URLSearchParams(),
  papel: "CUSTOMER",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, refresh: vi.fn() }),
  useSearchParams: () => nav.busca,
}));
vi.mock("next-auth/react", () => ({
  signIn: vi.fn(async () => ({ error: undefined })),
  getSession: vi.fn(async () => ({ user: { role: nav.papel } })),
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => <span data-imagem={alt} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/pwa/convitePosLogin", () => ({ pedirConviteAposLogin: vi.fn() }));

import { LoginForm } from "./LoginForm";

const RESTAURANTE = {
  name: "Burguer",
  address: "",
  phone: "",
  logoUrl: "",
  floorPlanImageUrl: null,
};

async function entrar() {
  const { container } = render(<LoginForm restaurantInfo={RESTAURANTE} />);
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("seu@email.com"), "cliente@exemplo.com");
  await user.type(screen.getByPlaceholderText("••••••••"), "senha-123");
  await user.click(container.querySelector('button[type="submit"]')!);
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
}

beforeEach(() => {
  nav.push.mockClear();
  nav.busca = new URLSearchParams();
  nav.papel = "CUSTOMER";
});

afterEach(cleanup);

describe("LoginForm: para onde vai depois de entrar", () => {
  it.each(["https://golpe.example", "//golpe.example", "/\\golpe.example"])(
    "ignora callbackUrl externo %s e segue o destino do papel",
    async (externo) => {
      nav.busca = new URLSearchParams({ callbackUrl: externo });

      await entrar();

      expect(nav.push).toHaveBeenCalledWith("/");
    }
  );

  it("callbackUrl externo não tira o dono do painel", async () => {
    nav.busca = new URLSearchParams({ callbackUrl: "https://golpe.example" });
    nav.papel = "ADMIN";

    await entrar();

    expect(nav.push).toHaveBeenCalledWith("/adm");
  });

  it("callbackUrl interno continua valendo", async () => {
    nav.busca = new URLSearchParams({ callbackUrl: "/checkout" });

    await entrar();

    expect(nav.push).toHaveBeenCalledWith("/checkout");
  });

  it("o link de cadastro não carrega o callbackUrl externo", () => {
    nav.busca = new URLSearchParams({ callbackUrl: "https://golpe.example" });

    const { container } = render(<LoginForm restaurantInfo={RESTAURANTE} />);

    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.includes("golpe.example"))).toBe(false);
  });
});
