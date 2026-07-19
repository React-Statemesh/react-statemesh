import React from "react";
import {
  StateMeshProvider,
  createApiClient,
  createMesh,
  useMeshForm,
  useMeshMutation,
  useMeshResource,
  zodSchema
} from "statemesh-core";
import { StateMeshDevtools } from "statemesh-core/devtools";

const defaultFilters = { search: "", status: "open", priority: "all" };
const tickets = [
  { id: "t1", subject: "Acme login is broken", customerEmail: "ops@acme.test", status: "open", priority: "high", tags: ["login"] },
  { id: "t2", subject: "Billing invoice copy", customerEmail: "finance@northwind.test", status: "pending", priority: "medium", tags: ["billing"] }
];

const api = createApiClient({
  baseUrl: "https://support.example.test",
  async fetcher(input, init) {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.pathname === "/tickets" && method === "GET") {
      const search = url.searchParams.get("search") ?? "";
      return Response.json(tickets.filter((ticket) => ticket.subject.toLowerCase().includes(search.toLowerCase())));
    }

    if (url.pathname === "/tickets" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const ticket = {
        id: `t${tickets.length + 1}`,
        subject: body.subject,
        customerEmail: body.customerEmail,
        status: "open",
        priority: body.priority,
        tags: body.tags ?? []
      };
      tickets.unshift(ticket);
      return Response.json(ticket, { status: 201 });
    }

    const ticketId = url.pathname.split("/").at(-1);
    if (method === "PATCH") {
      const patch = JSON.parse(String(init?.body ?? "{}"));
      const ticket = tickets.find((item) => item.id === ticketId);
      Object.assign(ticket, patch);
      return Response.json(ticket);
    }

    return Response.json({ message: "Not found" }, { status: 404 });
  }
});

const mesh = createMesh({
  name: "support-desk-js",
  state: {
    ticketEntities: { byId: {}, allIds: [] },
    lastSavedTicket: null
  }
});

const ticketsResource = mesh.resource("tickets.list", {
  key: (filters) => ["tickets", filters],
  staleTime: "30s",
  async fetch(filters, context) {
    const result = await api.get("/tickets", { query: filters, signal: context.signal });
    context.mesh.setState((state) => {
      state.ticketEntities = context.mesh.mergeEntities(state.ticketEntities, result, (ticket) => ticket.id);
    });
    return result;
  },
  tags: ["tickets"]
});

const createTicketMutation = mesh.mutation("tickets.create", {
  offline: true,
  async mutate(values) {
    return api.post("/tickets", values);
  },
  commit(state, ticket, _values, context) {
    state.ticketEntities = context.mesh.mergeEntities(state.ticketEntities, [ticket], (item) => item.id);
    state.lastSavedTicket = ticket;
  },
  invalidate: ["tickets"],
  refetch: "active"
});

mesh.form("tickets.create.form", {
  initialValues: {
    subject: "",
    customerEmail: "",
    priority: "medium",
    body: "",
    tags: [],
    attachments: []
  },
  schema: zodSchema({
    safeParse(values) {
      const issues = [];
      if (!values.subject) issues.push({ path: ["subject"], message: "Subject is required" });
      if (!values.customerEmail.includes("@")) issues.push({ path: ["customerEmail"], message: "Valid email is required" });
      if (values.body.length < 10) issues.push({ path: ["body"], message: "Message must be at least 10 characters" });
      return issues.length ? { success: false, error: { issues } } : { success: true };
    }
  }),
  submit: createTicketMutation,
  autosave: {
    debounce: 300,
    validate: false,
    submit(values) {
      console.info("Autosaved support draft", values);
    }
  }
});

function TicketQueue() {
  const queue = useMeshResource(ticketsResource, defaultFilters, {
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 30000
  });

  return (
    <section>
      <h2>Support queue</h2>
      <button type="button" onMouseEnter={() => void queue.prefetch()}>
        Prefetch queue
      </button>
      <ul>
        {queue.data?.map((ticket) => <li key={ticket.id}>{ticket.subject}</li>)}
      </ul>
    </section>
  );
}

function NewTicketForm() {
  const form = useMeshForm("tickets.create.form");
  const attachments = form.fieldArray("attachments");
  const createTicket = useMeshMutation(createTicketMutation);

  return (
    <form onSubmit={(event) => void form.submit(event).catch(() => undefined)}>
      <input {...form.field("subject")} placeholder="Subject" />
      {form.errors.subject && <p>{form.errors.subject}</p>}
      <input {...form.field("customerEmail")} placeholder="Customer email" />
      <textarea {...form.field("body")} placeholder="Message" />
      <button type="button" onClick={() => attachments.append({ name: "screenshot.png", url: "https://example.test/screenshot.png" })}>
        Add attachment
      </button>
      <button disabled={form.submitting || createTicket.pending}>Create ticket</button>
      {createTicket.queued && <p>Queued until reconnect</p>}
    </form>
  );
}

export default function App() {
  return (
    <StateMeshProvider mesh={mesh}>
      <TicketQueue />
      <NewTicketForm />
      <StateMeshDevtools mesh={mesh} />
    </StateMeshProvider>
  );
}
