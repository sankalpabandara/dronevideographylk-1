import "server-only";
import { Ga4Client } from "./ga4-client";
import { GA4_DESTINATION } from "./ga4-destination";

let client: Ga4Client | undefined;

export function analyticsClient(): Ga4Client | null {
  // Explicitly disabled until the owner approves the property, stream and access.
  if (process.env.GA4_REPORTS_ENABLED !== "true") return null;
  if (client) return client;
  const propertyId = process.env.GA4_PROPERTY_ID;
  const streamId = process.env.GA4_STREAM_ID;
  const email = process.env.GA4_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!propertyId || !streamId || !email || !privateKey) return null;
  if (propertyId !== GA4_DESTINATION.propertyId || streamId !== GA4_DESTINATION.streamId) return null;
  client = new Ga4Client({ propertyId, streamId, email, privateKey: privateKey.replace(/\\n/g, "\n") });
  return client;
}

export function analyticsDestination() {
  return { propertyId: process.env.GA4_PROPERTY_ID!, streamId: process.env.GA4_STREAM_ID! };
}
