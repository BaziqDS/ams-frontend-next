export function buildGoogleTranslateV2Body({
  text,
  target,
  source,
  projectId,
  location = "us-central1",
}: {
  text: string;
  target: string;
  source?: string;
  projectId?: string;
  location?: string;
}) {
  const body: Record<string, string> = {
    q: text,
    target,
    format: "text",
  };

  if (source) {
    body.source = source;
  }

  if (projectId) {
    body.model = `projects/${projectId}/locations/${location}/models/general/translation-llm`;
  }

  return body;
}
