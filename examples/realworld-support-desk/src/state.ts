import {
  createApiClient,
  createMesh,
  loggerPlugin,
  tabSyncPlugin,
  zodSchema,
  type EntityCollection,
  type ResourceSnapshot,
  type StorageAdapter
} from "react-statemesh";

export type TicketStatus = "open" | "pending" | "closed";
export type TicketPriority = "low" | "medium" | "high";

export type Ticket = {
  id: string;
  subject: string;
  customerEmail: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId: string | null;
  updatedAt: string;
  tags: string[];
};

export type Attachment = {
  name: string;
  url: string;
};

export type TicketFilters = {
  search: string;
  status: TicketStatus | "all";
  priority: TicketPriority | "all";
};

export type CreateTicketValues = {
  subject: string;
  customerEmail: string;
  priority: TicketPriority;
  body: string;
  tags: string[];
  attachments: Attachment[];
};

type SupportDeskState = {
  theme: "light" | "dark";
  sidebarOpen: boolean;
  selectedTicketId: string | null;
  ticketEntities: EntityCollection<Ticket, string>;
  lastSavedTicket: Ticket | null;
  draftSaves: number;
};

type SupportDeskExampleOptions = {
  storage?: StorageAdapter;
  registerPlugins?: boolean;
};

export const defaultTicketFilters: TicketFilters = {
  search: "",
  status: "open",
  priority: "all"
};

export const createTicketFormName = "tickets.create.form";

export function createExampleMemoryStorage(seed = new Map<string, string>()): StorageAdapter {
  return {
    getItem: (key) => seed.get(key) ?? null,
    setItem: (key, value) => seed.set(key, value),
    removeItem: (key) => seed.delete(key)
  };
}

export function createSupportDeskExample(options: SupportDeskExampleOptions = {}) {
  const storage = options.storage ?? createExampleMemoryStorage();
  const database = createSupportDatabase();
  const api = createSupportApi(database);

  const mesh = createMesh<SupportDeskState>({
    name: "support-desk",
    state: {
      theme: "light",
      sidebarOpen: true,
      selectedTicketId: null,
      ticketEntities: { byId: {}, allIds: [] },
      lastSavedTicket: null,
      draftSaves: 0
    }
  });

  mesh.persist({
    key: "support-desk:state",
    storage,
    keys: ["theme", "sidebarOpen"],
    version: 1,
    ttl: "7d"
  });

  if (options.registerPlugins ?? true) {
    mesh.use(loggerPlugin({ enabled: false, limit: 50 }));
    mesh.use(tabSyncPlugin({
      keys: ["theme", "selectedTicketId"],
      channel: "support-desk",
      sourceTabId: "support-desk-example"
    }));
  }

  mesh.urlState("tickets.filters", defaultTicketFilters, {
    paramPrefix: "tickets",
    replace: true
  });

  const toggleTheme = mesh.action("ui.toggleTheme", (state) => {
    state.theme = state.theme === "light" ? "dark" : "light";
  });

  mesh.computed("tickets.openCount", {
    deps: ["ticketEntities"],
    compute(state) {
      return mesh.denormalizeEntities(state.ticketEntities).filter((ticket) => ticket.status === "open").length;
    }
  });

  const ticketsResource = mesh.resource<TicketFilters, Ticket[]>("tickets.list", {
    key: (filters) => ["tickets", filters],
    staleTime: "30s",
    cacheTime: "10m",
    async fetch(filters, context) {
      const tickets = await api.get<Ticket[]>("/tickets", {
        query: filters,
        signal: context.signal,
        metadata: { resource: "tickets.list" }
      });
      context.mesh.setState((draft) => {
        draft.ticketEntities = context.mesh.mergeEntities(draft.ticketEntities, tickets, (ticket) => ticket.id);
      }, { metadata: { source: "tickets.list" } });
      return tickets;
    },
    tags: (tickets) => [
      { type: "tickets" },
      ...((tickets ?? []).map((ticket) => ({ type: "ticket", id: ticket.id })))
    ]
  });

  const ticketDetailResource = mesh.resource<{ id: string }, Ticket>("tickets.detail", {
    key: (params) => ["ticket", params.id],
    staleTime: "1m",
    async fetch(params, context) {
      const ticket = await api.get<Ticket>(`/tickets/${params.id}`, {
        signal: context.signal,
        metadata: { resource: "tickets.detail" }
      });
      context.mesh.setState((draft) => {
        draft.ticketEntities = context.mesh.mergeEntities(draft.ticketEntities, [ticket], (item) => item.id);
      }, { metadata: { source: "tickets.detail" } });
      return ticket;
    },
    tags: (_ticket, params) => [{ type: "ticket", id: params.id }]
  });

  const updateTicketMutation = mesh.mutation<
    { id: string; status: TicketStatus; filters: TicketFilters },
    Ticket
  >("tickets.updateStatus", {
    offline: true,
    optimistic(state, payload, context) {
      const current = state.ticketEntities.byId[payload.id];
      if (!current) return;
      const updated = { ...current, status: payload.status, updatedAt: new Date().toISOString() };
      state.ticketEntities = context.mesh.mergeEntities(state.ticketEntities, [updated], (ticket) => ticket.id);
      context.setResourceData<Ticket[], TicketFilters>(ticketsResource, payload.filters, (list) =>
        (list ?? []).map((ticket) => ticket.id === payload.id ? updated : ticket)
      );
    },
    async mutate(payload, context) {
      return api.patch<Ticket, { status: TicketStatus }>(`/tickets/${payload.id}`, {
        status: payload.status
      }, { signal: context.signal });
    },
    commit(state, ticket, _payload, context) {
      state.ticketEntities = context.mesh.mergeEntities(state.ticketEntities, [ticket], (item) => item.id);
      state.lastSavedTicket = ticket;
    },
    invalidate: (ticket) => [{ type: "tickets" }, { type: "ticket", id: ticket.id }],
    refetch: "active"
  });

  const createTicketMutation = mesh.mutation<CreateTicketValues, Ticket>("tickets.create", {
    offline: true,
    async mutate(values, context) {
      return api.post<Ticket, CreateTicketValues>("/tickets", values, { signal: context.signal });
    },
    commit(state, ticket, _values, context) {
      state.ticketEntities = context.mesh.mergeEntities(state.ticketEntities, [ticket], (item) => item.id);
      state.lastSavedTicket = ticket;
    },
    invalidate: [{ type: "tickets" }],
    refetch: "active"
  });

  mesh.form<CreateTicketValues>(createTicketFormName, {
    initialValues: {
      subject: "",
      customerEmail: "",
      priority: "medium",
      body: "",
      tags: [],
      attachments: []
    },
    schema: zodSchema(createTicketSchema),
    fields: {
      async customerEmail(value) {
        await Promise.resolve();
        return value.endsWith("@blocked.test") ? "This customer domain is blocked" : null;
      }
    },
    validateOnBlur: true,
    submit: createTicketMutation,
    autosave: {
      debounce: 250,
      validate: false,
      submit() {
        mesh.setState((state) => {
          state.draftSaves += 1;
        }, { metadata: { source: "ticket-form-autosave" } });
      },
      when: (form) => form.dirty && !form.submitting
    },
    steps: [
      { name: "details", fields: ["subject", "customerEmail", "priority"] },
      { name: "message", fields: ["body", "tags", "attachments"] }
    ]
  });

  const persistResourceCache = () => mesh.persistResources({
    key: "support-desk:resources",
    storage,
    names: ["tickets.list", "tickets.detail"],
    ttl: "10m"
  });

  const dehydrateForSsr = (): ResourceSnapshot => mesh.dehydrateResources({
    names: ["tickets.list", "tickets.detail"]
  });

  return {
    api,
    mesh,
    storage,
    ticketsResource,
    ticketDetailResource,
    updateTicketMutation,
    createTicketMutation,
    toggleTheme,
    persistResourceCache,
    dehydrateForSsr
  };
}

const createTicketSchema = {
  safeParse(values: CreateTicketValues) {
    const issues: Array<{ path: string[]; message: string }> = [];
    if (!values.subject.trim()) issues.push({ path: ["subject"], message: "Subject is required" });
    if (!values.customerEmail.includes("@")) issues.push({ path: ["customerEmail"], message: "Valid email is required" });
    if (values.body.trim().length < 10) issues.push({ path: ["body"], message: "Message must be at least 10 characters" });
    return issues.length === 0
      ? { success: true as const }
      : { success: false as const, error: { issues } };
  }
};

function createSupportDatabase() {
  let nextTicketId = 4;
  const tickets: Ticket[] = [
    {
      id: "t1",
      subject: "Acme login is broken",
      customerEmail: "ops@acme.test",
      status: "open",
      priority: "high",
      assigneeId: "agent_1",
      updatedAt: "2026-06-13T08:00:00.000Z",
      tags: ["login", "enterprise"]
    },
    {
      id: "t2",
      subject: "Billing invoice copy",
      customerEmail: "finance@northwind.test",
      status: "pending",
      priority: "medium",
      assigneeId: "agent_2",
      updatedAt: "2026-06-13T08:15:00.000Z",
      tags: ["billing"]
    },
    {
      id: "t3",
      subject: "Feature request: CSV export",
      customerEmail: "founder@smallco.test",
      status: "open",
      priority: "low",
      assigneeId: null,
      updatedAt: "2026-06-13T08:30:00.000Z",
      tags: ["feature-request"]
    }
  ];

  return {
    list(filters: TicketFilters) {
      return tickets.filter((ticket) => {
        const searchMatch = !filters.search ||
          ticket.subject.toLowerCase().includes(filters.search.toLowerCase()) ||
          ticket.customerEmail.toLowerCase().includes(filters.search.toLowerCase());
        const statusMatch = filters.status === "all" || ticket.status === filters.status;
        const priorityMatch = filters.priority === "all" || ticket.priority === filters.priority;
        return searchMatch && statusMatch && priorityMatch;
      });
    },
    get(id: string) {
      return tickets.find((ticket) => ticket.id === id) ?? null;
    },
    update(id: string, patch: Partial<Pick<Ticket, "status" | "priority" | "assigneeId">>) {
      const index = tickets.findIndex((ticket) => ticket.id === id);
      if (index < 0) return null;
      const next = {
        ...tickets[index],
        ...patch,
        updatedAt: new Date().toISOString()
      } as Ticket;
      tickets[index] = next;
      return next;
    },
    create(values: CreateTicketValues) {
      const ticket: Ticket = {
        id: `t${nextTicketId++}`,
        subject: values.subject,
        customerEmail: values.customerEmail,
        status: "open",
        priority: values.priority,
        assigneeId: null,
        updatedAt: new Date().toISOString(),
        tags: values.tags
      };
      tickets.unshift(ticket);
      return ticket;
    }
  };
}

function createSupportApi(database: ReturnType<typeof createSupportDatabase>) {
  return createApiClient({
    baseUrl: "https://support.example.test",
    timeout: 5000,
    retry: {
      attempts: 1,
      delay: 0,
      retryOn: [503],
      jitter: false
    },
    async fetcher(input, init) {
      const url = new URL(String(input));
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.pathname === "/tickets" && method === "GET") {
        return Response.json(database.list({
          search: url.searchParams.get("search") ?? "",
          status: (url.searchParams.get("status") ?? "all") as TicketFilters["status"],
          priority: (url.searchParams.get("priority") ?? "all") as TicketFilters["priority"]
        }));
      }

      if (url.pathname === "/tickets" && method === "POST") {
        const body = parseJsonBody<CreateTicketValues>(init?.body);
        if (body.customerEmail === "duplicate@example.test") {
          return Response.json({ errors: { customerEmail: "Customer already has an open ticket" } }, { status: 422 });
        }
        return Response.json(database.create(body), { status: 201 });
      }

      const ticketMatch = url.pathname.match(/^\/tickets\/([^/]+)$/);
      if (ticketMatch && method === "GET") {
        const ticket = database.get(ticketMatch[1] ?? "");
        return ticket ? Response.json(ticket) : Response.json({ message: "Not found" }, { status: 404 });
      }

      if (ticketMatch && method === "PATCH") {
        const ticket = database.update(ticketMatch[1] ?? "", parseJsonBody(init?.body));
        return ticket ? Response.json(ticket) : Response.json({ message: "Not found" }, { status: 404 });
      }

      return Response.json({ message: "Not found" }, { status: 404 });
    }
  });
}

function parseJsonBody<TBody>(body: BodyInit | null | undefined): TBody {
  if (!body) return {} as TBody;
  if (typeof body === "string") return JSON.parse(body) as TBody;
  return JSON.parse(String(body)) as TBody;
}
