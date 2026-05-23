import { describe, expect, it } from "vitest";

import { buildGoogleTranslateV2Body } from "@/lib/googleTranslateRequest";

describe("buildGoogleTranslateV2Body", () => {
  it("uses Translation LLM when a Google Cloud project is configured", () => {
    expect(
      buildGoogleTranslateV2Body({
        text: "سی ایس آئی ٹی مین اسٹور",
        target: "en",
        source: "ur",
        projectId: "ams-prod",
        location: "us-central1",
      }),
    ).toEqual({
      q: "سی ایس آئی ٹی مین اسٹور",
      target: "en",
      format: "text",
      source: "ur",
      model: "projects/ams-prod/locations/us-central1/models/general/translation-llm",
    });
  });

  it("falls back to default NMT when no Google Cloud project is configured", () => {
    expect(
      buildGoogleTranslateV2Body({
        text: "hello",
        target: "en",
      }),
    ).toEqual({
      q: "hello",
      target: "en",
      format: "text",
    });
  });
});
