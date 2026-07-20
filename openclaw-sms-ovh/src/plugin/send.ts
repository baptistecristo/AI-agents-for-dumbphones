/**
 * Outbound delivery.
 *
 * Two things differ from a typical chat channel. Replies are chunked at a
 * segment boundary because the user is billed per segment, and markdown is
 * stripped because a basic phone renders asterisks and backticks literally.
 */

import { analyze, chunk, toGsm7 } from "../encoding.js";
import { OvhClient } from "../ovh/client.js";
import { MAX_SEGMENTS, sendFromVirtualNumber, type OvhSendReport } from "../ovh/sms.js";
import type { ResolvedOvhSmsAccount } from "./accounts.js";

/**
 * Reduce agent output to something a basic phone displays sensibly.
 *
 * Deliberately conservative: it unwraps the common markdown constructs rather
 * than trying to parse the grammar. Links keep both label and URL, since a
 * bare label is useless on a device with no way to tap it.
 */
export function toPlainText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?|```/g, "").trim())
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1 $2")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 $2")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/^\s*[-*+]\s+/gm, "- ")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface SendTextParams {
  account: ResolvedOvhSmsAccount;
  to: string;
  text: string;
  /**
   * Rewrite characters that are absent from GSM-7 but have an obvious
   * equivalent, so a stray circumflex does not double the bill. Off by default
   * because it is lossy: "prêt" becomes "pret".
   */
  forceGsm7?: boolean;
  client?: OvhClient;
}

export interface SendTextResult {
  reports: OvhSendReport[];
  parts: string[];
  segments: number;
}

/**
 * Split a reply into parts that each fit the configured chunk limit, then send
 * them in order.
 *
 * Sequential rather than concurrent: SMS has no ordering guarantee, and firing
 * three parts at once is a good way to have part 3 arrive first.
 */
export async function sendText(params: SendTextParams): Promise<SendTextResult> {
  const { account } = params;

  let body = toPlainText(params.text);
  if (params.forceGsm7 === true) body = toGsm7(body);

  const parts = chunk(body, account.textChunkLimit);
  if (parts.length === 0) return { reports: [], parts: [], segments: 0 };

  const client =
    params.client ??
    new OvhClient({
      applicationKey: account.applicationKey,
      applicationSecret: account.applicationSecret,
      consumerKey: account.consumerKey,
      region: account.region,
    });

  const reports: OvhSendReport[] = [];
  let segments = 0;

  for (const part of parts) {
    const info = analyze(part);
    if (info.segments > MAX_SEGMENTS) {
      throw new Error(
        `SMS part spans ${info.segments} segments, above OVH's limit of ${MAX_SEGMENTS}. ` +
          `Lower textChunkLimit (currently ${account.textChunkLimit}).`,
      );
    }
    segments += info.segments;

    reports.push(
      await sendFromVirtualNumber(client, account.serviceName, account.virtualNumber, {
        message: part,
        receivers: [params.to],
        tag: "openclaw",
      }),
    );
  }

  return { reports, parts, segments };
}
