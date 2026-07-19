// Main entry point — core state management, React hooks, persistence, sync, forms, URL state, resources, errors, utils
// Heavy optional modules are available as sub-path imports:
//   react-statemesh/router    — built-in router with nested routes, loaders, guards, middleware
//   react-statemesh/devtools  — DevTools dock, logger, bridge
//   react-statemesh/testing   — test helpers and mock utilities
export * from "./core";
export * from "./react";
export * from "./persist";
export * from "./sync";
export * from "./forms";
export * from "./url";
export * from "./computed";
export * from "./transactions";
export * from "./resources";
export * from "./errors";
export * from "./utils";
