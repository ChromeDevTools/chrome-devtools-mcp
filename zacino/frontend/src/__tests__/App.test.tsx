import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import App from "../App";

const mockFetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ access_token: "token", token_type: "bearer" })
  })
);

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  localStorage.clear();
  mockFetch.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders authentication form and validates input", async () => {
  render(<App />);

  const button = screen.getByRole("button", { name: /sign in/i });
  expect(button).toBeDisabled();

  await userEvent.type(screen.getByLabelText(/email/i), "team@zacino.io");
  await userEvent.type(screen.getByLabelText(/password/i), "StrongPass123");

  expect(button).toBeEnabled();
});
