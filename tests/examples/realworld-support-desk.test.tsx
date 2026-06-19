import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductionObservabilityApp from "../../examples/production-observability/src/App";
import ProductionUpgradesApp, { createProductionUpgradesExample, type Filters as ProductFilters } from "../../examples/production-upgrades/src/App";
import App from "../../examples/realworld-support-desk/src/App";
import {
  createSupportDeskExample,
  createTicketFormName,
  defaultTicketFilters,
  type CreateTicketValues,
  type Ticket,
  type TicketFilters
} from "../../examples/realworld-support-desk/src/state";

describe("realworld support desk example", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("uses the production upgrade APIs together", async () => {
    const example = createProductionUpgradesExample();

    example.mesh.setUrlState("products.filters", {
      search: "key",
      dynamic: {
        filter_stock: "in"
      }
    });

    const keyboard = await example.productsResource.fetch(example.mesh.getUrlState<ProductFilters>("products.filters"));
    expect(keyboard.map((product) => product.name)).toEqual(["Keyboard"]);

    example.exportReport();
    expect(example.mesh.getState().exports).toBe(1);

    const form = example.mesh.getForm("settings.form");
    form.checkbox("alerts").onChange({ target: { checked: false } });
    form.radio("plan", "enterprise").onChange();
    form.select("country").onChange({ target: { value: "US" } });

    expect(form.checkbox("alerts").checked).toBe(false);
    expect(form.radio("plan", "enterprise").checked).toBe(true);
    expect(form.select("country").value).toBe("US");
  });

  it("renders the production observability example", async () => {
    render(<ProductionObservabilityApp />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Ada" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Record refresh" }));
    expect(screen.getByText("Refreshes: 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Profiler" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Doctor" })).toBeTruthy();
  });

  it("renders the plain JavaScript production observability example", async () => {
    // @ts-expect-error The JavaScript example is intentionally authored as .jsx.
    const { default: JavaScriptApp } = await import("../../examples-js/production-observability/src/App.jsx");

    render(<JavaScriptApp />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Ada" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Record refresh" })).toBeTruthy();
  });

  it("renders the production upgrades React example", async () => {
    render(<ProductionUpgradesApp />);

    await waitFor(() => expect(screen.getByText("Keyboard")).toBeTruthy());
    expect(screen.getByText("Laptop Stand")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "Search products" }), {
      target: { value: "mouse" }
    });

    await waitFor(() => expect(screen.getByText("Mouse")).toBeTruthy());

    fireEvent.click(screen.getByRole("checkbox", { name: "Alerts" }));
    fireEvent.click(screen.getByRole("radio", { name: "Enterprise" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Country" }), {
      target: { value: "US" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Export report" }));

    expect(screen.getByRole("button", { name: "Save settings" })).toBeTruthy();
  });

  it("renders the plain JavaScript production upgrades example", async () => {
    window.history.replaceState(null, "", "/");
    // @ts-expect-error The JavaScript example is intentionally authored as .jsx.
    const { default: JavaScriptApp } = await import("../../examples-js/production-upgrades/src/App.jsx");

    render(<JavaScriptApp />);

    await waitFor(() => expect(screen.getByText("Keyboard")).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox", { name: "Search products" }), {
      target: { value: "stand" }
    });

    await waitFor(() => expect(screen.getByText("Laptop Stand")).toBeTruthy());
  });

  it("fetches tickets, normalizes entities, and hydrates the resource cache", async () => {
    const example = createSupportDeskExample({ registerPlugins: false });
    const stopPersisting = example.persistResourceCache();

    const tickets = await example.ticketsResource.fetch(defaultTicketFilters);
    expect(tickets.map((ticket) => ticket.id)).toEqual(["t1", "t3"]);
    expect(example.mesh.getComputed<number>("tickets.openCount")).toBe(2);
    expect(example.mesh.denormalizeEntities(example.mesh.getState().ticketEntities)).toHaveLength(2);

    await example.ticketDetailResource.prefetch({ id: "t1" });
    const snapshot = example.dehydrateForSsr();
    expect(snapshot.entries.length).toBeGreaterThanOrEqual(2);

    const restored = createSupportDeskExample({ registerPlugins: false });
    restored.mesh.hydrateResources(snapshot);
    expect(restored.mesh.getResourceStatus<Ticket[], TicketFilters>("tickets.list", defaultTicketFilters).data?.[0]?.id).toBe("t1");
    expect(restored.mesh.getResourceStatus<Ticket, { id: string }>("tickets.detail", { id: "t1" }).data?.subject).toBe("Acme login is broken");

    stopPersisting();
  });

  it("queues offline ticket mutations and flushes them on demand", async () => {
    const example = createSupportDeskExample({ registerPlugins: false });
    await example.ticketsResource.fetch(defaultTicketFilters);

    const originalOnline = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });

    try {
      const queued = example.updateTicketMutation.run({
        id: "t1",
        status: "closed",
        filters: defaultTicketFilters
      });

      expect(example.mesh.getQueuedMutations()).toHaveLength(1);
      expect(example.mesh.getMutationStatus("tickets.updateStatus").queued).toBe(true);

      Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
      await example.mesh.runQueuedMutations();
      await expect(queued).resolves.toMatchObject({ id: "t1", status: "closed" });

      expect(example.mesh.getQueuedMutations()).toHaveLength(0);
      expect(example.mesh.getState().lastSavedTicket?.status).toBe("closed");
    } finally {
      if (originalOnline) Object.defineProperty(window.navigator, "onLine", originalOnline);
    }
  });

  it("validates and submits the production ticket form", async () => {
    const example = createSupportDeskExample({ registerPlugins: false });
    const form = example.mesh.getForm<CreateTicketValues>(createTicketFormName);

    form.fieldArray("attachments").append({ name: "error.png", url: "https://example.test/error.png" });
    await expect(form.validate()).resolves.toMatchObject({
      subject: "Subject is required",
      customerEmail: "Valid email is required",
      body: "Message must be at least 10 characters"
    });

    form.setValue("subject", "Cannot export report");
    form.setValue("customerEmail", "ops@example.test");
    form.setValue("body", "The weekly report export fails for CSV files.");
    form.setValue("tags", ["reports", "csv"]);

    await expect(example.mesh.getForm<CreateTicketValues>(createTicketFormName).validate()).resolves.toEqual({});
    await example.mesh.getForm<CreateTicketValues>(createTicketFormName).submit();

    expect(example.mesh.getState().lastSavedTicket).toMatchObject({
      subject: "Cannot export report",
      customerEmail: "ops@example.test",
      status: "open"
    });
  });

  it("renders the realworld React example", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Acme login is broken")).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox", { name: "Subject" }), {
      target: { value: "Cannot export report" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Customer email" }), {
      target: { value: "ops@example.test" }
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });

    fireEvent.click(screen.getByRole("button", { name: "Add attachment" }));
    expect(screen.getByDisplayValue("screenshot.png")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Theme: light" }));
    });

    expect(screen.getByRole("button", { name: "Theme: dark" })).toBeTruthy();
  });

  it("renders the plain JavaScript mirror example", async () => {
    // @ts-expect-error The JavaScript example is intentionally authored as .jsx.
    const { default: JavaScriptApp } = await import("../../examples-js/realworld-support-desk/src/App.jsx");

    render(<JavaScriptApp />);

    await waitFor(() => expect(screen.getByText("Acme login is broken")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Add attachment" }));
    expect(screen.getByRole("button", { name: "Create ticket" })).toBeTruthy();
  });
});
