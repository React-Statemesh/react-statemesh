import { expectType } from "tsd";
import {
  GuardError,
  createApiClient,
  createMesh,
  getErrorMessage,
  getErrorMetadata,
  getErrorStatus,
  isApiClientError,
  isStateMeshError,
  type ApiUploadProgress,
  type ApiRetryOptions,
  type MeshDehydratedSnapshot,
  type QueuedMutation,
  type ResourceFetchOptions,
  type ResourceSnapshot,
  type StateMeshProviderProps,
  zodSchema,
  useMeshAction,
  useMeshMutation,
  useMeshResource,
  useMeshTransaction,
  useMeshUrlState
} from "../dist/index";

const mesh = createMesh({
  state: {
    theme: "light" as "light" | "dark",
    cart: {
      items: [] as Array<{ id: string; quantity: number }>
    }
  }
});

expectType<"light" | "dark">(mesh.getState().theme);

const providerProps: StateMeshProviderProps<typeof mesh extends { getState: () => infer TState } ? TState : never> = {
  mesh,
  children: null,
  devForceFullReload: false
};
expectType<boolean | undefined>(providerProps.devForceFullReload);

const addItem = mesh.action("cart.add", (state, payload: { id: string }) => {
  state.cart.items.push({ id: payload.id, quantity: 1 });
});

expectType<void>(addItem({ id: "keyboard" }));
expectType<(payload: { id: string }) => void>(useMeshAction(addItem));

const saveCart = mesh.transaction("cart.save", {
  async effect(_state, payload: { id: string }) {
    return { ok: Boolean(payload.id), id: payload.id };
  },
  commit(state, result) {
    expectType<boolean>(result.ok);
    state.cart.items.push({ id: result.id, quantity: 1 });
  }
});

expectType<(payload: { id: string }) => Promise<{ ok: boolean; id: string }>>(useMeshTransaction(saveCart).run);

const productsResource = mesh.resource("products.list", {
  async fetch(_params: { search: string }) {
    return [{ id: "keyboard", title: "Keyboard" }];
  },
  tags: [{ type: "products" }]
});

const products = useMeshResource(productsResource, { search: "key" });
expectType<Array<{ id: string; title: string }> | null>(products.data);
expectType<(options?: ResourceFetchOptions) => Promise<Array<{ id: string; title: string }>>>(products.refetch);
expectType<(options?: ResourceFetchOptions) => Promise<Array<{ id: string; title: string }>>>(products.prefetch);
expectType<Promise<Array<{ id: string; title: string }>>>(mesh.prefetchResource("products.list", { search: "key" }));
const productTitles = useMeshResource(productsResource, { search: "key" }, {
  keepPreviousData: true,
  placeholderData: [],
  select(data) {
    return (data ?? []).map((product) => product.title);
  }
});
expectType<string[] | null>(productTitles.data);
const resourceSnapshot = mesh.dehydrateResources({ names: ["products.list"] });
expectType<ResourceSnapshot>(resourceSnapshot);
expectType<void>(mesh.hydrateResources(resourceSnapshot));
expectType<() => void>(mesh.persistResources({ names: ["products.list"] }));
const meshSnapshot = mesh.dehydrate({ forms: true });
expectType<MeshDehydratedSnapshot>(meshSnapshot);
expectType<void>(mesh.hydrate(meshSnapshot, { mergeState: true }));

const createProduct = mesh.mutation("products.create", {
  async mutate(payload: { title: string }) {
    return { id: "new", title: payload.title };
  },
  invalidate: [{ type: "products" }]
});

expectType<(payload: { title: string }) => Promise<{ id: string; title: string }>>(useMeshMutation(createProduct).run);
expectType<QueuedMutation[]>(mesh.getQueuedMutations());
expectType<Promise<void>>(mesh.runQueuedMutations());
expectType<void>(mesh.clearQueuedMutations());
expectType<() => void>(mesh.persistQueuedMutations({ storage: "memory" }));

expectType<() => void>(mesh.guard({ kind: "action", name: "cart.add" }, (context) => {
  expectType<"light" | "dark">(context.state.theme);
  return true;
}));

const productsById = mesh.normalizeEntities([
  { id: "1", title: "Keyboard" }
], (product) => product.id);
expectType<{ byId: Record<string, { id: string; title: string }>; allIds: string[] }>(productsById);
expectType<Array<{ id: string; title: string }>>(mesh.denormalizeEntities(productsById));

mesh.urlState("products.filters", {
  search: "",
  page: 1,
  sale: false
}, {
  paramNames: {
    search: "q",
    page: "p",
    sale: "available"
  }
});

mesh.urlState("products.generatedFilters", {
  search: "",
  page: 1
}, {
  paramNames(field, urlStateName) {
    expectType<"search" | "page">(field);
    expectType<string>(urlStateName);
    return `filter_${field}`;
  }
});

mesh.urlState("products.dynamicFilters", {
  search: "",
  params: {} as Record<string, string>
}, {
  captureUnknown: /^filter_/,
  unknownField: "params"
});

const [urlFilters, setUrlFilters] = useMeshUrlState<{ search: string; page: number; sale: boolean }>("products.filters");
expectType<string>(urlFilters.search);
expectType<void>(setUrlFilters({ page: 2 }));

const updateProfile = mesh.mutation("profile.update", {
  async mutate(payload: { name: string; email: string }) {
    return { ok: true, ...payload };
  }
});

mesh.form("profile.form", {
  initialValues: { name: "", email: "" },
  schema: zodSchema({
    safeParse(values: { name: string; email: string }) {
      return values.name ? { success: true } : { success: false, error: { issues: [{ path: ["name"], message: "Required" }] } };
    }
  }),
  fields: {
    async email(value, values, field) {
      expectType<string>(value);
      expectType<string>(values.name);
      expectType<"email">(field);
      return value.includes("@") ? null : "Valid email is required";
    }
  },
  autosave: {
    debounce: 250,
    when(state) {
      expectType<boolean>(state.dirty);
      return state.dirty;
    }
  },
  submit: updateProfile,
  steps: [
    { name: "profile", fields: ["name"] },
    { name: "contact", fields: ["email"] }
  ]
});

const profileForm = mesh.getForm<{ name: string; email: string }>("profile.form");
expectType<boolean | undefined>(profileForm.dirtyFields.name);
expectType<void>(profileForm.fieldArray("email").append("alias@example.test"));
expectType<Promise<string | null>>(profileForm.validateField("email"));
expectType<void>(profileForm.setServerErrors({ email: "Already taken" }));
expectType<void>(profileForm.resetToServer({ name: "Ada", email: "ada@example.test" }));
expectType<Promise<void>>(profileForm.autosaveNow());
expectType<Promise<boolean>>(profileForm.nextStep());

mesh.form("settings.form", {
  initialValues: {
    alerts: true,
    plan: "pro" as "pro" | "enterprise",
    country: "IN",
    avatar: null as File | null
  }
});

const settingsForm = mesh.getForm<{
  alerts: boolean;
  plan: "pro" | "enterprise";
  country: string;
  avatar: File | null;
}>("settings.form");
expectType<boolean>(settingsForm.checkbox("alerts").checked);
expectType<"pro" | "enterprise">(settingsForm.radio("plan", "pro").value);
expectType<string>(settingsForm.select("country").value);
expectType<void>(settingsForm.file("avatar").onChange(new File(["hello"], "hello.txt")));

const api = createApiClient({ baseUrl: "https://api.example.test" });
expectType<Promise<{ ok: boolean }>>(api.get<{ ok: boolean }>("/health"));
expectType<Promise<{ ok: boolean }>>(api.upload<{ ok: boolean }>("/files", new FormData(), {
  onUploadProgress(progress) {
    expectType<ApiUploadProgress>(progress);
    expectType<number | null>(progress.percent);
  }
}));

const retryOptions: ApiRetryOptions = {
  attempts: 2,
  delay: (context) => context.attempt * 100,
  retryOn: (context) => context.status === 503,
  retryTimeouts: true,
  jitter: false
};
const controlledApi = createApiClient({ timeout: 10_000, retry: retryOptions });
expectType<Promise<{ ok: boolean }>>(controlledApi.post<{ ok: boolean }, { name: string }>("/products", { name: "Keyboard" }, {
  timeout: false,
  retry: false
}));

const guardError = new GuardError("Blocked", { metadata: { action: "cart.add" } });
expectType<GuardError>(guardError);
const unknownError: unknown = guardError;
expectType<string>(getErrorMessage(unknownError));
expectType<number | null>(getErrorStatus(unknownError));
expectType<Record<string, unknown> | null>(getErrorMetadata(unknownError));
if (isStateMeshError(unknownError)) {
  expectType<string>(unknownError.code);
}
if (isApiClientError(unknownError)) {
  expectType<number>(unknownError.status);
}
