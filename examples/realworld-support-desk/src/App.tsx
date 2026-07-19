import {
  StateMeshProvider,
  useMeshComputed,
  useMeshForm,
  useMeshMutation,
  useMeshResource,
  useMeshSelector,
  useMeshUrlState
} from "@statemesh/react";
import { StateMeshDevtools } from "@statemesh/react/devtools";
import {
  createSupportDeskExample,
  createTicketFormName,
  defaultTicketFilters,
  type CreateTicketValues,
  type TicketFilters
} from "./state";

export const supportDeskExample = createSupportDeskExample();
supportDeskExample.persistResourceCache();

function TicketQueue() {
  const [filters, setFilters] = useMeshUrlState<TicketFilters>("tickets.filters");
  const tickets = useMeshResource(supportDeskExample.ticketsResource, filters, {
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 30000
  });
  const updateTicket = useMeshMutation(supportDeskExample.updateTicketMutation);
  const openCount = useMeshComputed<number>("tickets.openCount");
  const theme = useMeshSelector((state: { theme: "light" | "dark" }) => state.theme);

  return (
    <section>
      <header>
        <strong>Support queue</strong>
        <span>Open: {openCount}</span>
        <button type="button" onClick={() => supportDeskExample.toggleTheme()}>
          Theme: {theme}
        </button>
      </header>

      <label>
        Search
        <input
          value={filters.search}
          onChange={(event) => setFilters({ search: event.target.value })}
          onFocus={() => void supportDeskExample.ticketsResource.prefetch(defaultTicketFilters)}
        />
      </label>

      <button type="button" onClick={() => void tickets.refetch()}>
        Refresh
      </button>

      {tickets.pending && <p>Loading tickets...</p>}
      {tickets.error && <p>Could not load tickets</p>}

      <ul>
        {tickets.data?.map((ticket) => (
          <li key={ticket.id}>
            <button
              type="button"
              onClick={() => void supportDeskExample.ticketDetailResource.prefetch({ id: ticket.id })}
            >
              {ticket.subject}
            </button>
            <span>{ticket.priority}</span>
            <button
              type="button"
              disabled={updateTicket.pending}
              onClick={() => void updateTicket.run({ id: ticket.id, status: "closed", filters })}
            >
              Close
            </button>
          </li>
        ))}
      </ul>

      {updateTicket.queued && <p>Queued until reconnect</p>}
    </section>
  );
}

function NewTicketForm() {
  const form = useMeshForm<CreateTicketValues>(createTicketFormName);
  const attachments = form.fieldArray("attachments");

  return (
    <form onSubmit={(event) => void form.submit(event).catch(() => undefined)}>
      {form.currentStep === "details" && (
        <fieldset>
          <label>
            Subject
            <input {...form.field("subject")} />
          </label>
          {form.errors.subject && <p>{form.errors.subject}</p>}

          <label>
            Customer email
            <input {...form.field("customerEmail")} />
          </label>
          {form.validatingFields.customerEmail && <p>Checking customer...</p>}
          {form.errors.customerEmail && <p>{form.errors.customerEmail}</p>}
        </fieldset>
      )}

      {form.currentStep === "message" && (
        <fieldset>
          <label>
            Message
            <textarea {...form.field("body")} />
          </label>
          {form.errors.body && <p>{form.errors.body}</p>}

          {attachments.items.map((attachment, index) => (
            <label key={`${attachment.name}-${index}`}>
              Attachment
              <input
                value={attachment.name}
                onChange={(event) => attachments.update(index, { ...attachment, name: event.target.value })}
              />
              <button type="button" onClick={() => attachments.remove(index)}>
                Remove
              </button>
            </label>
          ))}

          <button
            type="button"
            onClick={() => attachments.append({ name: "screenshot.png", url: "https://example.test/screenshot.png" })}
          >
            Add attachment
          </button>
        </fieldset>
      )}

      <footer>
        <button type="button" disabled={form.stepIndex <= 0} onClick={form.previousStep}>
          Back
        </button>
        {form.currentStep === "details" ? (
          <button type="button" onClick={() => void form.nextStep()}>
            Next
          </button>
        ) : (
          <button disabled={form.submitting}>{form.submitting ? "Creating..." : "Create ticket"}</button>
        )}
      </footer>

      {form.autosaving && <p>Autosaving draft...</p>}
    </form>
  );
}

export default function App() {
  return (
    <StateMeshProvider mesh={supportDeskExample.mesh}>
      <main>
        <TicketQueue />
        <NewTicketForm />
      </main>
      <StateMeshDevtools mesh={supportDeskExample.mesh} limit={40} />
    </StateMeshProvider>
  );
}
