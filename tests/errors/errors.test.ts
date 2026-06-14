import { describe, expect, it } from "vitest";
import {
  ApiClientError,
  StateMeshError,
  getErrorMessage,
  getErrorMetadata,
  getErrorStatus,
  isApiClientError,
  isStateMeshError
} from "../../src";

describe("error helpers", () => {
  it("detects StateMesh and API errors and extracts useful UI details", () => {
    const apiError = new ApiClientError("Request failed", {
      status: 422,
      metadata: { field: "email" }
    });
    const meshError = new StateMeshError("Mesh failed", {
      code: "TEST",
      metadata: { feature: "test" }
    });

    expect(isApiClientError(apiError)).toBe(true);
    expect(isStateMeshError(apiError)).toBe(true);
    expect(isStateMeshError(meshError)).toBe(true);
    expect(getErrorStatus(apiError)).toBe(422);
    expect(getErrorMessage(apiError)).toBe("Request failed");
    expect(getErrorMessage("plain")).toBe("plain");
    expect(getErrorMetadata(meshError)).toEqual({ feature: "test" });
  });
});
