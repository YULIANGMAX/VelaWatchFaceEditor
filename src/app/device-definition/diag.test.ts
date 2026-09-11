import { describe, it } from "vitest";

describe("diag", () => {
  it("dynamic import device-definition", async () => {
    try {
      const mod = await import(".");
      // eslint-disable-next-line no-console
      console.log("DIAG_OK keys=", Object.keys(mod).length);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("DIAG_ERROR_STACK:\n", error instanceof Error ? error.stack : error);
      throw error;
    }
  });
});
